import { createOptionState, type OptionPatch, type OptionStateSnapshot } from '../core/options.js'
import { DirtyLayer, type DirtyLayers } from '../core/frame-scheduler.js'
import { reactive, invalidate, cancelRender, optionSignal } from '../core/runtime.js'
import type { ReadonlySignal } from '../core/reactive.js'
import {
  isScaleHandle,
  type ScaleBinding,
  type ScaleHandle,
  type ScaleValue,
} from '../scales/scale.js'
import {
  layout,
  createTextMeasurer,
  type Size,
  type Margins,
  type PlotLayout,
} from '../layout/layout.js'
import { resolveTheme, watchTheme, type ThemeMode, type ThemeTokens } from '../theme/theme.js'
import { isAxisHandle, validateAxisUpdates, type AxisHandle, type AxisSide } from './axis.js'
import { observeSize } from './resize.js'
import { svgElement, renderAxes, renderPolarAxes, axisTickLabels } from './render-axes.js'
import { arc } from 'd3'
import { projectPolarPoint } from './polar-geometry.js'
import { watchCanvasPixelRatio } from './render-composite-canvas.js'
import type { CoordinateSystem } from './mark-definition.js'
import { isPlotMark, type PlotMark } from './marks.js'
import { createPluginHost, isPlotPlugin, type PlotPlugin } from './plugins.js'
import {
  projectSkewTPoint,
  invertSkewTPoint,
  type SkewTOptions,
  type SkewTPoint,
  type SoundingPoint,
} from './skew-t-geometry.js'
import { renderSkewTAxes } from './render-skew-t-axes.js'
import { createScaleBindings } from './scale-bindings.js'
import { createMarkLayer } from './mark-layer.js'
import { createPointerHub, type PlotPointer } from './pointer-hub.js'
import { createLegendModel, type LegendModel } from './legend.js'

export type { PlotPointer } from './pointer-hub.js'
import {
  direction,
  marginKeys,
  validateAxisAppearance,
  validateClassicPolarAxes,
  validatePatch,
  validatePlotOptions,
} from './plot-validation.js'

export interface PlotOptions {
  skewT?: SkewTOptions
  clipMarks: boolean
  autoMargins: boolean
  axisLayout: 'outside' | 'inset'
  background: 'chart' | 'plot'
  width?: number
  height?: number
  title: string
  margins: Margins
  theme: ThemeMode
  themeElement?: Element
  scales: Record<string, ScaleHandle>
  directions: Record<string, 'x' | 'y'>
  axes: readonly AxisHandle[]
  marks: readonly PlotMark[]
  plugins: readonly PlotPlugin[]
}

export type PlotConfig = Omit<
  OptionPatch<PlotOptions>,
  'scales' | 'axes' | 'marks' | 'plugins' | 'themeElement'
> & {
  scales?: Record<string, ScaleHandle | undefined>
  axes?: readonly AxisHandle[]
  marks?: readonly PlotMark[]
  plugins?: readonly PlotPlugin[]
  themeElement?: Element
}

export type PolarPlotConfig = Omit<PlotConfig, 'directions'>
export type SkewTPlotConfig = Omit<PlotConfig, 'directions'>

export interface SkewTPlot extends Omit<Plot, 'update' | 'setConfig'> {
  update(patch: SkewTPlotConfig): void
  setConfig(config: SkewTPlotConfig): void
  project(temperature: number, pressure: number): SkewTPoint
  invert(x: number, y: number): SoundingPoint
}

export interface Plot {
  readonly element: SVGSVGElement
  readonly options: ReadonlySignal<OptionStateSnapshot<PlotOptions>>
  readonly size: ReadonlySignal<Readonly<Size>>
  readonly regions: ReadonlySignal<PlotLayout>
  readonly theme: ReadonlySignal<ThemeTokens>
  readonly pointer: ReadonlySignal<PlotPointer>
  readonly legend: LegendModel
  readonly scales: Readonly<Record<string, ScaleBinding>>
  readonly destroyed: boolean
  update(patch: PlotConfig): void
  setConfig(config: PlotConfig): void
  destroy(): void
}

export interface PolarPoint {
  readonly x: number
  readonly y: number
}

export interface PolarPlot extends Omit<Plot, 'update' | 'setConfig'> {
  update(patch: PolarPlotConfig): void
  setConfig(config: PolarPlotConfig): void
  project(angularValue: ScaleValue, radialValue: ScaleValue): PolarPoint
}

type CartesianSide = Exclude<AxisSide, 'angular' | 'radial'>

function isCartesianSide(position: AxisSide): position is CartesianSide {
  return position !== 'angular' && position !== 'radial'
}

let nextClipId = 0

type DependencyGroups = Readonly<Record<string, readonly unknown[]>>

interface PlotDependencySnapshot {
  readonly layout: DependencyGroups
  readonly marks: DependencyGroups
}

function dependenciesChanged(previous: DependencyGroups | undefined, current: DependencyGroups) {
  if (!previous) return true
  const previousKeys = Object.keys(previous)
  const currentKeys = Object.keys(current)
  if (previousKeys.length !== currentKeys.length) return true
  return currentKeys.some((key) => {
    const before = previous[key]
    const after = current[key]
    return (
      !before ||
      before.length !== after.length ||
      after.some((value, index) => value !== before[index])
    )
  })
}

function createPlotInternal(
  host: HTMLElement,
  config: PlotConfig,
  coordinateSystem: CoordinateSystem,
): Plot {
  if (!(host instanceof HTMLElement)) throw new Error('createPlot requires an HTMLElement.')
  validatePatch(config)
  const state = createOptionState<PlotOptions>(config, {
    defaults: () => ({
      skewT: coordinateSystem === 'skewT' ? { skew: 30 } : undefined,
      clipMarks: true,
      autoMargins: false,
      axisLayout: 'outside',
      background: 'chart',
      title: '',
      margins: { top: 8, right: 8, bottom: 8, left: 8 },
      theme: 'auto',
      scales: {},
      directions: {},
      axes: [],
      marks: [],
      plugins: [],
    }),
    isAtomicReference: (value) =>
      isScaleHandle(value) || isAxisHandle(value) || isPlotMark(value) || isPlotPlugin(value),
    validate: (options) => validatePlotOptions(options, coordinateSystem),
  })
  const optionState = optionSignal(state)
  const options = optionState.snapshot
  const measured = reactive.signal<Size>(
    {
      width: host.clientWidth,
      height: host.clientHeight,
    },
    (a, b) => a.width === b.width && a.height === b.height,
  )
  const size = reactive.signal<Readonly<Size>>(Object.freeze({ width: 0, height: 0 }))
  const regions = reactive.signal(layout({ width: 0, height: 0 }))
  const initialThemeMode = options.get().resolved.theme
  const theme = reactive.signal(
    resolveTheme(host, initialThemeMode, matchMedia('(prefers-color-scheme: dark)').matches),
  )
  const themeVersion = reactive.signal(0)
  const scope = reactive.createScope()
  const measurer = createTextMeasurer()
  const axisWidths = new Map<AxisHandle, { version: number; thickness: number }>()
  const insetWidths = new Map<AxisHandle, number>()
  const axisValidators = new Map<AxisHandle, () => void>()
  const scaleBindings = createScaleBindings({
    scope,
    coordinateSystem,
    regions,
    options: () => options.get().resolved,
  })
  let destroyed = false
  let lastThemeMode: ThemeMode | undefined
  let lastThemeVersion = -1
  let dependencySnapshot: PlotDependencySnapshot | undefined
  let stopTheme = watchTheme(options.get().resolved.themeElement, () =>
    themeVersion.update((value) => value + 1),
  )
  const element = svgElement('svg', { class: 'fews-chart', role: 'img' })
  if (coordinateSystem === 'skewT') element.dataset.coordinateSystem = 'skewT'
  element.style.display = 'block'
  const background = svgElement('rect')
  const polarBackground = svgElement('path', { display: 'none' })
  const gridLayer = svgElement('g', { 'data-layer': 'grid' })
  const marksLayer = svgElement('g', { 'data-layer': 'marks' })
  const axesLayer = svgElement('g', { 'data-layer': 'axes' })
  const title = svgElement('text', { 'text-anchor': 'middle' })
  const clipId = `fews-plot-clip-${nextClipId++}`
  const definitions = svgElement('defs')
  const clipPath = svgElement('clipPath', { id: clipId })
  const clipRect = svgElement('rect')
  clipPath.append(clipRect)
  definitions.append(clipPath)
  marksLayer.setAttribute('clip-path', `url(#${clipId})`)
  if (coordinateSystem === 'skewT') gridLayer.setAttribute('clip-path', `url(#${clipId})`)
  element.append(background, polarBackground, definitions, gridLayer, marksLayer, axesLayer, title)
  const pointerHub = createPointerHub({
    element,
    coordinateSystem,
    size,
    regions,
    scales: () => scaleBindings.scales,
    options: () => options.get().resolved,
  })
  const markLayer = createMarkLayer({
    scope,
    layer: marksLayer,
    coordinateSystem,
    regions,
    scales: () => scaleBindings.markScales,
    options: () => options.get().resolved,
    requestRender: () => invalidate(render, DirtyLayer.marks),
  })
  const legend = createLegendModel(scope, () => options.get().resolved.marks, element)
  const pluginHost = createPluginHost(scope, {
    element,
    coordinateSystem,
    options,
    size,
    regions,
    pointer: pointerHub.pointer,
    legend,
    get scales() {
      return scaleBindings.scales
    },
    direction: (name) =>
      direction(options.get().resolved, name, undefined, undefined, coordinateSystem),
    locate: (event) => pointerHub.locate(event),
    on: (type, handler) => pointerHub.on(type, handler),
  })

  function reconcile() {
    const current = options.get().resolved
    markLayer.reconcile(current)
    for (const [axis, dispose] of axisValidators) {
      if (!current.axes.includes(axis)) {
        dispose()
        axisValidators.delete(axis)
        axisWidths.delete(axis)
        insetWidths.delete(axis)
      }
    }
    for (const axis of current.axes) {
      if (!axisValidators.has(axis)) {
        axisValidators.set(
          axis,
          validateAxisUpdates(axis, (candidate) => {
            const config = options.get().resolved
            validateAxisAppearance(candidate, axis.scale, config, coordinateSystem)
            if (coordinateSystem === 'polar') {
              validateClassicPolarAxes(
                config.axes.map((item) =>
                  item === axis ? candidate : item.options.get().resolved,
                ),
              )
            }
            direction(
              options.get().resolved,
              axis.scale,
              axis,
              candidate.position,
              coordinateSystem,
            )
          }),
        )
      }
    }
    scaleBindings.reconcile(current)
    pluginHost.reconcile(current.plugins)
  }

  function renderLayout(current: PlotOptions, tokens: ThemeTokens) {
    if (current.axisLayout === 'inset') marksLayer.before(axesLayer)
    else axesLayer.before(marksLayer)
    const actualSize = Object.freeze({
      width: current.width ?? measured.get().width,
      height: current.height ?? measured.get().height,
    })
    size.set(actualSize)
    const cartesianAxes = current.axes.filter((axis) =>
      isCartesianSide(axis.options.get().resolved.position),
    )
    const measures = cartesianAxes.map((axis) => {
      const axisOptions = axis.options.get().resolved
      const binding = scaleBindings.scales[axis.scale]
      const labels = axisTickLabels(binding, axis)
      const maxWidth = Math.max(
        0,
        ...labels.flatMap(({ primary, secondary }) =>
          [primary, secondary]
            .filter(Boolean)
            .map((label) => measurer.measure(label, `${tokens.fontSize}px ${tokens.fontFamily}`)),
        ),
      )
      const labelRows = labels.some(({ secondary }) => secondary) ? 2 : 1
      const angle = Math.abs((axisOptions.labelAngle * Math.PI) / 180)
      const horizontal = axisOptions.position === 'top' || axisOptions.position === 'bottom'
      const labelExtent = horizontal
        ? Math.abs(Math.sin(angle)) * maxWidth +
          Math.abs(Math.cos(angle)) * tokens.fontSize * labelRows
        : Math.abs(Math.cos(angle)) * maxWidth +
          Math.abs(Math.sin(angle)) * tokens.fontSize * labelRows
      const thickness = Math.ceil(
        12 + labelExtent + (axisOptions.label || axisOptions.unit ? tokens.fontSize * 2 : 0),
      )
      const previous = axisWidths.get(axis)
      const version = axis.options.version
      const stable =
        previous?.version === version ? Math.max(thickness, previous.thickness) : thickness
      axisWidths.set(axis, { version, thickness: stable })
      return { position: axisOptions.position as CartesianSide, thickness: stable }
    })
    const margins =
      coordinateSystem === 'polar' && current.axisLayout !== 'inset'
        ? {
            top: current.margins.top + tokens.fontSize * 2,
            right: current.margins.right + tokens.fontSize * 2,
            bottom: current.margins.bottom + tokens.fontSize * 2,
            left: current.margins.left + tokens.fontSize * 2,
          }
        : current.margins
    const insetMargins = { ...margins }
    if (current.axisLayout === 'inset' && current.autoMargins) {
      for (const axis of cartesianAxes) {
        const position = axis.options.get().resolved.position as CartesianSide
        insetMargins[position] = Math.max(insetMargins[position], insetWidths.get(axis) ?? 0)
      }
    }
    regions.set(
      layout(
        actualSize,
        current.axisLayout === 'inset' ? [] : measures,
        current.axisLayout === 'inset' ? insetMargins : margins,
        current.title ? tokens.fontSize * 2 : 0,
      ),
    )
    element.setAttribute('width', String(actualSize.width))
    element.setAttribute('height', String(actualSize.height))
    element.setAttribute('viewBox', `0 0 ${actualSize.width} ${actualSize.height}`)
    background.setAttribute('width', String(actualSize.width))
    background.setAttribute('height', String(actualSize.height))
    const titleRegion = regions.get().title
    title.setAttribute('x', String(titleRegion.x + titleRegion.width / 2))
    title.setAttribute('y', String(titleRegion.y + tokens.fontSize))
    title.textContent = current.title
    const plotRegion = regions.get().plot
    if (current.clipMarks) marksLayer.setAttribute('clip-path', `url(#${clipId})`)
    else marksLayer.removeAttribute('clip-path')
    const polarFill = coordinateSystem === 'polar' && current.background === 'plot'
    background.setAttribute('display', polarFill ? 'none' : '')
    polarBackground.setAttribute('display', polarFill ? '' : 'none')
    if (polarFill) {
      const angular = Object.values(scaleBindings.scales).find(
        (binding) => binding.scale.kind === 'angular',
      )!
      const radial = Object.values(scaleBindings.scales).find(
        (binding) => binding.scale.kind === 'radial',
      )!
      const angularOptions = angular.scale.options.get().resolved
      const classic = current.axes.some((axis) => axis.options.get().resolved.style === 'classic')
      const sign = angularOptions.direction === 'anticlockwise' ? -1 : 1
      const intercept = angularOptions.intercept ?? 0
      const [start, end] = angular.range.get()
      polarBackground.setAttribute(
        'transform',
        `translate(${plotRegion.x + plotRegion.width / 2},${plotRegion.y + plotRegion.height / 2})`,
      )
      polarBackground.setAttribute(
        'd',
        arc<null>()
          .innerRadius(radial.range.get()[0])
          .outerRadius(radial.range.get()[1])
          .startAngle(
            classic ? intercept + start + (sign === -1 ? Math.PI : 0) : intercept + sign * start,
          )
          .endAngle(
            classic ? intercept + end + (sign === -1 ? Math.PI : 0) : intercept + sign * end,
          )(null) ?? '',
      )
    }
    const localMarks = current.axisLayout === 'inset' && coordinateSystem === 'cartesian'
    if (localMarks)
      marksLayer.setAttribute('transform', `translate(${plotRegion.x},${plotRegion.y})`)
    else marksLayer.removeAttribute('transform')
    const backgroundRegion =
      current.background === 'plot'
        ? plotRegion
        : { x: 0, y: 0, width: actualSize.width, height: actualSize.height }
    for (const name of ['x', 'y', 'width', 'height'] as const) {
      background.setAttribute(name, String(backgroundRegion[name]))
    }
    clipRect.setAttribute('x', String(localMarks ? 0 : plotRegion.x))
    clipRect.setAttribute('y', String(localMarks ? 0 : plotRegion.y))
    clipRect.setAttribute('width', String(plotRegion.width))
    clipRect.setAttribute('height', String(plotRegion.height))
    if (current.title) element.setAttribute('aria-label', current.title)
    else element.removeAttribute('aria-label')
  }

  function render(dirty: DirtyLayers) {
    if (destroyed) return
    const current = options.get().resolved
    const tokens = theme.get()
    if (dirty & DirtyLayer.layout) {
      renderLayout(current, tokens)
    }
    if (dirty & DirtyLayer.style) {
      background.setAttribute('fill', `var(--fews-chart-background, ${tokens.background})`)
      polarBackground.setAttribute('fill', `var(--fews-chart-background, ${tokens.background})`)
      element.style.color = `var(--fews-chart-foreground, ${tokens.foreground})`
      element.style.fontFamily = `var(--fews-chart-font-family, ${tokens.fontFamily})`
      element.style.fontSize = `${tokens.fontSize}px`
      title.setAttribute('fill', 'currentColor')
      gridLayer.setAttribute('stroke', `var(--fews-chart-grid, ${tokens.grid})`)
    }
    if (dirty & (DirtyLayer.layout | DirtyLayer.axes)) {
      if (coordinateSystem === 'skewT') {
        renderSkewTAxes(
          axesLayer,
          gridLayer,
          current.axes,
          scaleBindings.scales,
          regions.get(),
          tokens,
          current.skewT!.skew,
        )
      } else if (coordinateSystem === 'polar') {
        renderPolarAxes(
          axesLayer,
          gridLayer,
          current.axes,
          scaleBindings.scales,
          regions.get(),
          tokens,
        )
      } else {
        renderAxes(axesLayer, gridLayer, current.axes, scaleBindings.scales, regions.get(), tokens)
        if (current.axisLayout === 'inset' && current.autoMargins) {
          let changed = false
          const groups = [...axesLayer.children]
          current.axes.forEach((axis, index) => {
            if (axis.options.get().resolved.crossAt) return
            const tickGroup = groups[index]?.querySelector('[data-axis-ticks]')
            if (!tickGroup) return
            const bounds = tickGroup.getBoundingClientRect()
            const side = axis.options.get().resolved.position
            if (!isCartesianSide(side)) return
            const extent = side === 'top' || side === 'bottom' ? bounds.height : bounds.width
            const needed = Math.ceil(extent / 10) * 10
            const previous = Math.max(current.margins[side], insetWidths.get(axis) ?? 0)
            if (needed <= previous) return
            insetWidths.set(axis, needed)
            changed = true
          })
          if (changed) {
            renderLayout(current, tokens)
            renderAxes(
              axesLayer,
              gridLayer,
              current.axes,
              scaleBindings.scales,
              regions.get(),
              tokens,
            )
          }
        }
      }
    }
    markLayer.render(dirty, current, tokens)
  }

  reconcile()
  const stopPixelRatio = watchCanvasPixelRatio(() => markLayer.invalidateAll())
  const stopSize = observeSize(host, (value) => {
    axisWidths.clear()
    measured.set(value)
  })
  scope.run(() => {
    reactive.effect(() => {
      const current = options.get().resolved
      const measuredSize = measured.get()
      reconcile()
      const scaleDependencies = scaleBindings.trackDependencies()
      const nextDependencies: PlotDependencySnapshot = {
        layout: {
          size: [current.width ?? measuredSize.width, current.height ?? measuredSize.height],
          options: [
            current.title,
            current.axisLayout,
            current.background,
            current.autoMargins,
            current.clipMarks,
            current.skewT?.skew,
            ...marginKeys.map((side) => current.margins[side]),
          ],
          axes: current.axes.flatMap((axis) => [axis, axis.options.version]),
          scales: scaleDependencies,
        },
        marks: {
          membership: current.marks,
          projection: [current.axisLayout, current.skewT?.skew, ...scaleDependencies],
        },
      }
      const layoutChanged = dependenciesChanged(dependencySnapshot?.layout, nextDependencies.layout)
      const marksChanged = dependenciesChanged(dependencySnapshot?.marks, nextDependencies.marks)
      dependencySnapshot = nextDependencies
      if (layoutChanged) {
        insetWidths.clear()
        invalidate(render, DirtyLayer.layout | DirtyLayer.axes)
      } else if (marksChanged) {
        markLayer.invalidateAll()
      }
    })
    reactive.effect(() => {
      const version = themeVersion.get()
      const current = options.get().resolved
      if (lastThemeMode === current.theme && lastThemeVersion === version) return
      const previous = reactive.untracked(() => theme.get())
      const tokens =
        lastThemeMode === undefined && current.theme === initialThemeMode && version === 0
          ? previous
          : resolveTheme(host, current.theme, matchMedia('(prefers-color-scheme: dark)').matches)
      lastThemeMode = current.theme
      lastThemeVersion = version
      theme.set(tokens)
      const fontChanged =
        tokens.fontSize !== previous.fontSize || tokens.fontFamily !== previous.fontFamily
      if (fontChanged) {
        axisWidths.clear()
        insetWidths.clear()
        measurer.clear()
      }
      invalidate(render, DirtyLayer.style | (fontChanged ? DirtyLayer.layout : 0))
    })
  })
  host.append(element)

  function apply(patch: PlotConfig, replace: boolean) {
    if (destroyed) throw new Error('Cannot update a destroyed plot.')
    validatePatch(patch)
    const previous = options.get().resolved
    const changed = replace ? state.setConfig(patch) : state.update(patch)
    if (!changed) return
    optionState.publish()
    if (previous.themeElement !== options.get().resolved.themeElement) {
      stopTheme()
      stopTheme = watchTheme(options.get().resolved.themeElement, () =>
        themeVersion.update((value) => value + 1),
      )
      themeVersion.update((value) => value + 1)
    }
    axisWidths.clear()
    insetWidths.clear()
    reconcile()
  }

  return {
    element,
    options,
    size,
    regions,
    theme,
    pointer: pointerHub.pointer,
    legend,
    get scales() {
      return scaleBindings.scales
    },
    get destroyed() {
      return destroyed
    },
    update(patch) {
      apply(patch, false)
    },
    setConfig(next) {
      apply(next, true)
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      pluginHost.dispose()
      legend.dispose()
      pointerHub.dispose()
      stopSize()
      stopPixelRatio()
      stopTheme()
      markLayer.dispose()
      scaleBindings.dispose()
      scope.dispose()
      for (const dispose of axisValidators.values()) dispose()
      axisValidators.clear()
      cancelRender(render)
      axisWidths.clear()
      insetWidths.clear()
      measurer.clear()
      element.remove()
    },
  }
}

export function createPlot(host: HTMLElement, config: PlotConfig = {}): Plot {
  return createPlotInternal(host, config, 'cartesian')
}

function skewTBindings(scales: Readonly<Record<string, ScaleBinding>>) {
  const entries = Object.entries(scales)
  const temperature = entries.find(([, binding]) => binding.scale.kind === 'linear')
  const pressure = entries.find(([, binding]) => binding.scale.kind === 'log')
  if (!temperature || !pressure) throw new Error('Skew-T temperature or pressure scale is missing.')
  return [temperature, pressure] as const
}

export function createSkewTPlot(host: HTMLElement, config: SkewTPlotConfig): SkewTPlot {
  const plot = createPlotInternal(host, config, 'skewT')
  function bindings() {
    if (plot.destroyed) throw new Error('Cannot project or invert with a destroyed plot.')
    return skewTBindings(plot.scales)
  }
  return Object.assign(plot, {
    project(temperature: number, pressure: number): SkewTPoint {
      const [x, y] = bindings()
      return projectSkewTPoint(
        x[1],
        y[1],
        temperature,
        pressure,
        plot.options.get().resolved.skewT!.skew,
      )
    },
    invert(x: number, y: number): SoundingPoint {
      const [temperature, pressure] = bindings()
      return invertSkewTPoint(
        temperature[1],
        pressure[1],
        x,
        y,
        plot.options.get().resolved.skewT!.skew,
      )
    },
  })
}

export function createPolarPlot(host: HTMLElement, config: PolarPlotConfig = {}): PolarPlot {
  const plot = createPlotInternal(host, config, 'polar')
  return Object.assign(plot, {
    project(angularValue: ScaleValue, radialValue: ScaleValue): PolarPoint {
      if (plot.destroyed) throw new Error('Cannot project with a destroyed plot.')
      const scales = Object.entries(plot.options.get().resolved.scales)
      const angularName = scales.find(([, scale]) => scale.kind === 'angular')?.[0]
      const radialName = scales.find(([, scale]) => scale.kind === 'radial')?.[0]
      if (!angularName || !radialName) {
        throw new Error('Polar plots require exactly one angular scale and one radial scale.')
      }
      const region = plot.regions.get().plot
      return projectPolarPoint(
        plot.scales[angularName],
        plot.scales[radialName],
        region,
        angularValue,
        radialValue,
      )
    },
  })
}

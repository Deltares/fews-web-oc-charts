import { createOptionState, type OptionPatch, type OptionStateSnapshot } from '../core/options.js'
import { DirtyLayer, type DirtyLayers } from '../core/frame-scheduler.js'
import { reactive, invalidate, cancelRender, optionSignal } from '../core/runtime.js'
import type { ReadonlySignal, ReactiveScope } from '../core/reactive.js'
import { finiteNonnegative, validateKeys } from '../core/validation.js'
import {
  bindScale,
  isScaleHandle,
  type ScaleBinding,
  type ScaleHandle,
  type ScaleRange,
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
import { isLineMark, validateLineValuesForScale, type LineMark } from './line.js'

export interface PlotOptions {
  width?: number | undefined
  height?: number | undefined
  title: string
  margins: Margins
  theme: ThemeMode
  themeElement?: Element | undefined
  scales: Record<string, ScaleHandle>
  directions: Record<string, 'x' | 'y'>
  axes: readonly AxisHandle[]
  marks: readonly LineMark[]
}

export type PlotConfig = Omit<
  OptionPatch<PlotOptions>,
  'scales' | 'axes' | 'marks' | 'themeElement'
> & {
  scales?: Record<string, ScaleHandle | undefined> | undefined
  axes?: readonly AxisHandle[] | undefined
  marks?: readonly LineMark[] | undefined
  themeElement?: Element | undefined
}

export type PolarPlotConfig = Omit<PlotConfig, 'directions'>

export interface Plot {
  readonly element: SVGSVGElement
  readonly options: ReadonlySignal<OptionStateSnapshot<PlotOptions>>
  readonly size: ReadonlySignal<Readonly<Size>>
  readonly regions: ReadonlySignal<PlotLayout>
  readonly theme: ReadonlySignal<ThemeTokens>
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

type CoordinateSystem = 'cartesian' | 'polar'
type Orientation = 'x' | 'y' | 'angular' | 'radial'
type CartesianSide = Exclude<AxisSide, 'angular' | 'radial'>

function isCartesianSide(position: AxisSide): position is CartesianSide {
  return position !== 'angular' && position !== 'radial'
}

const optionKeys = [
  'width',
  'height',
  'title',
  'margins',
  'theme',
  'themeElement',
  'scales',
  'directions',
  'axes',
  'marks',
]
const marginKeys = ['top', 'right', 'bottom', 'left'] as const
let nextClipId = 0

function validatePatch(config: PlotConfig) {
  validateKeys(config, optionKeys, 'plot')
  if (config.margins) validateKeys(config.margins, marginKeys, 'plot.margins')
}

function direction(
  options: PlotOptions,
  name: string,
  candidate?: AxisHandle,
  position?: AxisSide,
  coordinateSystem: CoordinateSystem = 'cartesian',
): Orientation {
  const axes = options.axes.filter((axis) => axis.scale === name)
  const scale = options.scales[name]
  if (coordinateSystem === 'polar') {
    const orientation =
      scale.kind === 'angular' ? 'angular' : scale.kind === 'radial' ? 'radial' : undefined
    if (!orientation) throw new Error(`Polar plots require angular or radial scales ("${name}").`)
    if (
      axes.some((axis) => {
        const side = axis === candidate ? position : axis.options.get().resolved.position
        return side !== orientation
      })
    ) {
      throw new Error(`Polar scale "${name}" requires an axis in the ${orientation} direction.`)
    }
    return orientation
  }
  if (scale.kind === 'angular' || scale.kind === 'radial') {
    throw new Error(`Cartesian plots cannot use ${scale.kind} scale "${name}".`)
  }
  const axisDirections = axes.map((axis) => {
    const side = axis === candidate ? position : axis.options.get().resolved.position
    if (side === 'angular' || side === 'radial') {
      throw new Error('Cartesian plots require top, right, bottom or left axes.')
    }
    return side === 'top' || side === 'bottom' ? 'x' : 'y'
  })
  const result =
    options.directions[name] ??
    axisDirections[0] ??
    (options.scales[name].kind === 'time' || options.scales[name].kind === 'band' ? 'x' : 'y')
  if (axisDirections.some((axisDirection) => axisDirection !== result)) {
    throw new Error(`plot.scales.${name} cannot bind to both x and y directions in one plot.`)
  }
  return result
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
      title: '',
      margins: { top: 8, right: 8, bottom: 8, left: 8 },
      theme: 'auto',
      scales: {},
      directions: {},
      axes: [],
      marks: [],
    }),
    isAtomicReference: (value) => isScaleHandle(value) || isAxisHandle(value) || isLineMark(value),
    validate(options) {
      for (const dimension of ['width', 'height'] as const) {
        if (options[dimension] !== undefined)
          finiteNonnegative(options[dimension], `plot.${dimension}`)
      }
      if (typeof options.title !== 'string') throw new Error('plot.title must be a string.')
      if (!['auto', 'light', 'dark'].includes(options.theme))
        throw new Error('plot.theme must be auto, light or dark.')
      if (options.themeElement !== undefined && !(options.themeElement instanceof Element)) {
        throw new Error('plot.themeElement must be an Element.')
      }
      if (!options.margins || typeof options.margins !== 'object')
        throw new Error('plot.margins must be an object.')
      for (const side of marginKeys)
        finiteNonnegative(options.margins[side], `plot.margins.${side}`)
      if (!Array.isArray(options.axes)) throw new Error('plot.axes must be an array.')
      if (!Array.isArray(options.marks)) throw new Error('plot.marks must be an array.')
      for (const key of ['scales', 'directions'] as const) {
        const value = options[key]
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          throw new Error(`plot.${key} must be a named map.`)
        }
      }

      const ids = new Set<string>()
      const axes = new Set<AxisHandle>()
      for (const axis of options.axes) {
        if (!axis || !isAxisHandle(axis)) throw new Error('plot.axes requires axis handles.')
        const position = axis.options.get().resolved.position
        if (coordinateSystem === 'cartesian' && (position === 'angular' || position === 'radial')) {
          throw new Error('Cartesian plots require top, right, bottom or left axes.')
        }
        if (coordinateSystem === 'polar' && position !== 'angular' && position !== 'radial') {
          throw new Error('Polar plots require angular or radial axes.')
        }
        if (axes.has(axis)) throw new Error('Duplicate axis handle in plot.axes.')
        axes.add(axis)
        const id = axis.options.get().resolved.id
        if (id && ids.has(id)) throw new Error(`Duplicate axis id "${id}".`)
        if (id) ids.add(id)
        if (!Object.hasOwn(options.scales, axis.scale))
          throw new Error(`plot.axes references missing scale "${axis.scale}".`)
      }
      for (const [name, scale] of Object.entries(options.scales)) {
        if (!name || !scale || !isScaleHandle(scale))
          throw new Error(`plot.scales.${name} requires a scale handle.`)
        direction(options, name, undefined, undefined, coordinateSystem)
      }
      const markIds = new Set<string>()
      for (const mark of options.marks) {
        if (!mark || !isLineMark(mark)) {
          throw new Error('plot.marks currently accepts line() marks only.')
        }
        if (coordinateSystem === 'polar') {
          throw new Error('line() marks are supported on cartesian plots only.')
        }
        if (!Object.hasOwn(options.scales, mark.x) || !Object.hasOwn(options.scales, mark.y)) {
          throw new Error(`line "${mark.id ?? ''}" references a missing x or y scale.`)
        }
        if (direction(options, mark.x, undefined, undefined, coordinateSystem) !== 'x') {
          throw new Error(`line "${mark.id ?? ''}" requires an x-direction scale.`)
        }
        if (direction(options, mark.y, undefined, undefined, coordinateSystem) !== 'y') {
          throw new Error(`line "${mark.id ?? ''}" requires a y-direction scale.`)
        }
        validateLineValuesForScale(mark, 'x', options.scales[mark.x].kind)
        validateLineValuesForScale(mark, 'y', options.scales[mark.y].kind)
        if (mark.id && markIds.has(mark.id)) throw new Error(`Duplicate line id "${mark.id}".`)
        if (mark.id) markIds.add(mark.id)
      }
      if (coordinateSystem === 'polar') {
        const angularScales = Object.values(options.scales).filter(
          (scale) => scale.kind === 'angular',
        )
        const radialScales = Object.values(options.scales).filter(
          (scale) => scale.kind === 'radial',
        )
        if (angularScales.length !== 1 || radialScales.length !== 1) {
          throw new Error('Polar plots require exactly one angular scale and one radial scale.')
        }
        if (Object.keys(options.directions).length > 0) {
          throw new Error('Polar plots do not support cartesian plot.directions.')
        }
      }
      for (const [name, value] of Object.entries(options.directions)) {
        if (!Object.hasOwn(options.scales, name))
          throw new Error(`plot.directions.${name} references a missing scale.`)
        if (value !== 'x' && value !== 'y')
          throw new Error(`plot.directions.${name} must be x or y.`)
      }
    },
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
  const axisValidators = new Map<AxisHandle, () => void>()
  const bindings = new Map<
    string,
    { scale: ScaleHandle; direction: Orientation; binding: ScaleBinding; scope: ReactiveScope }
  >()
  let localScales: Readonly<Record<string, ScaleBinding>> = Object.freeze({})
  let destroyed = false
  let lastThemeMode: ThemeMode | undefined
  let lastThemeVersion = -1
  let layoutDependencies: readonly unknown[] = []
  let stopTheme = watchTheme(options.get().resolved.themeElement, () =>
    themeVersion.update((value) => value + 1),
  )
  const element = svgElement('svg', { class: 'fews-chart', role: 'img' })
  element.style.display = 'block'
  const background = svgElement('rect')
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
  const linePaths: SVGPathElement[] = []
  element.append(background, definitions, gridLayer, marksLayer, axesLayer, title)

  function renderMarks(current: PlotOptions, tokens: ThemeTokens) {
    current.marks.forEach((mark, markIndex) => {
      let path = linePaths[markIndex]
      if (!path) {
        path = svgElement('path', {
          fill: 'none',
          'vector-effect': 'non-scaling-stroke',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'data-mark': 'line',
        })
        linePaths.push(path)
        marksLayer.append(path)
      }
      if (mark.id) path.setAttribute('data-mark-id', mark.id)
      else path.removeAttribute('data-mark-id')
      path.setAttribute('stroke', mark.stroke ?? `var(--fews-chart-accent, ${tokens.accent})`)
      path.setAttribute('stroke-width', String(mark.strokeWidth))
      const xScale = localScales[mark.x]
      const yScale = localScales[mark.y]
      let data = ''
      let drawingSegment = false
      for (let index = 0; index < mark.xValues.length; index += 1) {
        const xValue = mark.xValues[index]
        const yValue = mark.yValues[index]
        if (
          xValue === null ||
          xValue === undefined ||
          yValue === null ||
          yValue === undefined ||
          (typeof xValue === 'number' && !Number.isFinite(xValue)) ||
          (typeof yValue === 'number' && !Number.isFinite(yValue))
        ) {
          drawingSegment = false
          continue
        }
        const x = xScale.project(xValue)
        const y = yScale.project(yValue)
        data += `${drawingSegment ? 'L' : 'M'}${x},${y}`
        drawingSegment = true
      }
      path.setAttribute('d', data)
    })
    while (linePaths.length > current.marks.length) linePaths.pop()?.remove()
  }

  function reconcile() {
    const current = options.get().resolved
    for (const [axis, dispose] of axisValidators) {
      if (!current.axes.includes(axis)) {
        dispose()
        axisValidators.delete(axis)
        axisWidths.delete(axis)
      }
    }
    for (const axis of current.axes) {
      if (!axisValidators.has(axis)) {
        axisValidators.set(
          axis,
          validateAxisUpdates(axis, (candidate) => {
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
    for (const [name, entry] of bindings) {
      if (
        entry.scale !== current.scales[name] ||
        entry.direction !== direction(current, name, undefined, undefined, coordinateSystem)
      ) {
        entry.scope.dispose()
        bindings.delete(name)
      }
    }
    for (const [name, scale] of Object.entries(current.scales)) {
      if (bindings.has(name)) continue
      const bindingScope = scope.createScope()
      const orientation = direction(current, name, undefined, undefined, coordinateSystem)
      const binding = bindingScope.run(() => {
        const range = reactive.computed<ScaleRange>(
          () => {
            const plot = regions.get().plot
            if (orientation === 'angular') {
              return Object.freeze([...(scale.options.get().resolved.range ?? [0, 2 * Math.PI])])
            }
            if (orientation === 'radial') {
              const radius = Math.min(plot.width, plot.height) / 2
              const innerRadius = scale.options.get().resolved.innerRadius ?? 0
              return Object.freeze([radius * innerRadius, radius])
            }
            return Object.freeze(
              orientation === 'x' ? [plot.x, plot.x + plot.width] : [plot.y + plot.height, plot.y],
            )
          },
          (a, b) => a[0] === b[0] && a[1] === b[1],
        )
        return bindScale(scale, range)
      })
      bindings.set(name, { scale, direction: orientation, binding, scope: bindingScope })
    }
    localScales = Object.freeze(
      Object.fromEntries([...bindings].map(([name, entry]) => [name, entry.binding])),
    )
  }

  function render(dirty: DirtyLayers) {
    if (destroyed) return
    const current = options.get().resolved
    const tokens = theme.get()
    if (dirty & DirtyLayer.layout) {
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
        const binding = localScales[axis.scale]
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
        coordinateSystem === 'polar'
          ? {
              top: current.margins.top + tokens.fontSize * 2,
              right: current.margins.right + tokens.fontSize * 2,
              bottom: current.margins.bottom + tokens.fontSize * 2,
              left: current.margins.left + tokens.fontSize * 2,
            }
          : current.margins
      regions.set(layout(actualSize, measures, margins, current.title ? tokens.fontSize * 2 : 0))
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
      clipRect.setAttribute('x', String(plotRegion.x))
      clipRect.setAttribute('y', String(plotRegion.y))
      clipRect.setAttribute('width', String(plotRegion.width))
      clipRect.setAttribute('height', String(plotRegion.height))
      if (current.title) element.setAttribute('aria-label', current.title)
      else element.removeAttribute('aria-label')
    }
    if (dirty & DirtyLayer.style) {
      background.setAttribute('fill', `var(--fews-chart-background, ${tokens.background})`)
      element.style.color = `var(--fews-chart-foreground, ${tokens.foreground})`
      element.style.fontFamily = `var(--fews-chart-font-family, ${tokens.fontFamily})`
      element.style.fontSize = `${tokens.fontSize}px`
      title.setAttribute('fill', 'currentColor')
      gridLayer.setAttribute('stroke', `var(--fews-chart-grid, ${tokens.grid})`)
    }
    if (dirty & (DirtyLayer.layout | DirtyLayer.axes)) {
      if (coordinateSystem === 'polar') {
        renderPolarAxes(axesLayer, gridLayer, current.axes, localScales, regions.get(), tokens)
      } else {
        renderAxes(axesLayer, gridLayer, current.axes, localScales, regions.get(), tokens)
      }
    }
    if (dirty & (DirtyLayer.layout | DirtyLayer.axes | DirtyLayer.marks | DirtyLayer.style)) {
      renderMarks(current, tokens)
    }
  }

  reconcile()
  const stopSize = observeSize(host, (value) => {
    axisWidths.clear()
    measured.set(value)
  })
  scope.run(() => {
    reactive.effect(() => {
      const current = options.get().resolved
      const measuredSize = measured.get()
      reconcile()
      const dependencies: unknown[] = [
        current.width ?? measuredSize.width,
        current.height ?? measuredSize.height,
        current.title,
        ...marginKeys.map((side) => current.margins[side]),
        ...current.axes.flatMap((axis) => [axis, axis.options.version]),
        ...current.marks,
      ]
      for (const entry of bindings.values()) {
        entry.scale.domain.get()
        entry.scale.options.get()
        dependencies.push(entry.binding, entry.scale.domain.version, entry.scale.options.version)
      }
      if (
        dependencies.length === layoutDependencies.length &&
        dependencies.every((value, index) => value === layoutDependencies[index])
      )
        return
      layoutDependencies = dependencies
      invalidate(render, DirtyLayer.layout | DirtyLayer.axes)
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
    reconcile()
  }

  return {
    element,
    options,
    size,
    regions,
    theme,
    get scales() {
      return localScales
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
      stopSize()
      stopTheme()
      scope.dispose()
      for (const dispose of axisValidators.values()) dispose()
      axisValidators.clear()
      cancelRender(render)
      bindings.clear()
      linePaths.length = 0
      localScales = Object.freeze({})
      axisWidths.clear()
      measurer.clear()
      element.remove()
    },
  }
}

export function createPlot(host: HTMLElement, config: PlotConfig = {}): Plot {
  return createPlotInternal(host, config, 'cartesian')
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
      const angularScale = plot.options.get().resolved.scales[angularName]
      const angleDirection =
        angularScale.options.get().resolved.direction === 'anticlockwise' ? -1 : 1
      const intercept = angularScale.options.get().resolved.intercept ?? 0
      const angle = intercept + angleDirection * plot.scales[angularName].project(angularValue)
      const radius = plot.scales[radialName].project(radialValue)
      const region = plot.regions.get().plot
      return Object.freeze({
        x: region.x + region.width / 2 + radius * Math.sin(angle),
        y: region.y + region.height / 2 - radius * Math.cos(angle),
      })
    },
  })
}

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
  type PixelRange,
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
import { svgElement, renderAxes, axisTickLabels } from './render-axes.js'

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
}

export type PlotConfig = Omit<OptionPatch<PlotOptions>, 'scales' | 'axes' | 'themeElement'> & {
  scales?: Record<string, ScaleHandle | undefined> | undefined
  axes?: readonly AxisHandle[] | undefined
  themeElement?: Element | undefined
}

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
]
const marginKeys = ['top', 'right', 'bottom', 'left'] as const

function validatePatch(config: PlotConfig) {
  validateKeys(config, optionKeys, 'plot')
  if (config.margins) validateKeys(config.margins, marginKeys, 'plot.margins')
}

function direction(
  options: PlotOptions,
  name: string,
  candidate?: AxisHandle,
  position?: AxisSide,
): 'x' | 'y' {
  const axes = options.axes.filter((axis) => axis.scale === name)
  const axisDirections = axes.map((axis) => {
    const side = axis === candidate ? position : axis.options.get().resolved.position
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

export function createPlot(host: HTMLElement, config: PlotConfig = {}): Plot {
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
    }),
    isAtomicReference: (value) => isScaleHandle(value) || isAxisHandle(value),
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
        direction(options, name)
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
    { scale: ScaleHandle; direction: 'x' | 'y'; binding: ScaleBinding; scope: ReactiveScope }
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
  element.append(background, gridLayer, marksLayer, axesLayer, title)

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
            direction(options.get().resolved, axis.scale, axis, candidate.position)
          }),
        )
      }
    }
    for (const [name, entry] of bindings) {
      if (entry.scale !== current.scales[name] || entry.direction !== direction(current, name)) {
        entry.scope.dispose()
        bindings.delete(name)
      }
    }
    for (const [name, scale] of Object.entries(current.scales)) {
      if (bindings.has(name)) continue
      const bindingScope = scope.createScope()
      const orientation = direction(current, name)
      const binding = bindingScope.run(() => {
        const range = reactive.computed<PixelRange>(
          () => {
            const plot = regions.get().plot
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
      const measures = current.axes.map((axis) => {
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
        return { position: axisOptions.position, thickness: stable }
      })
      regions.set(
        layout(actualSize, measures, current.margins, current.title ? tokens.fontSize * 2 : 0),
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
      renderAxes(axesLayer, gridLayer, current.axes, localScales, regions.get(), tokens)
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
      localScales = Object.freeze({})
      axisWidths.clear()
      measurer.clear()
      element.remove()
    },
  }
}

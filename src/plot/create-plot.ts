import { createOptionState, type OptionPatch, type OptionStateSnapshot } from '../core/options.js'
import { DirtyLayer, type DirtyLayers } from '../core/frame-scheduler.js'
import { reactive, invalidate, cancelRender, optionSignal } from '../core/runtime.js'
import type { ReadonlySignal, ReactiveScope } from '../core/reactive.js'
import { finiteNonnegative, validateKeys } from '../core/validation.js'
import {
  bindScale,
  isScaleHandle,
  registerScaleExtents,
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
import {
  isAxisHandle,
  validateAxisUpdates,
  type AxisHandle,
  type AxisOptions,
  type AxisSide,
} from './axis.js'
import { observeSize } from './resize.js'
import { svgElement, renderAxes, renderPolarAxes, axisTickLabels } from './render-axes.js'
import { markExtents } from './mark-extents.js'
import { arc } from 'd3'
import { projectPolarPoint } from './polar-geometry.js'
import { watchCanvasPixelRatio } from './render-composite-canvas.js'
import { coordinateAdapter } from './coordinate-system.js'
import type {
  CoordinateSystem,
  MarkDefinition,
  MarkRenderContext,
  MarkRenderer,
  MarkValidationContext,
  Orientation,
} from './mark-definition.js'
import {
  findMarkDefinition,
  isPlotMark,
  markDefinition,
  supportedMarks,
  type PlotMark,
} from './marks.js'
import { isZoomHandle, type ZoomHandle } from './zoom.js'
import { matchesModifierKey } from '../Utils/modifierKey.js'
import {
  projectSkewTPoint,
  invertSkewTPoint,
  type SkewTOptions,
  type SkewTPoint,
  type SoundingPoint,
} from './skew-t-geometry.js'
import { renderSkewTAxes } from './render-skew-t-axes.js'
import { skewTMarkExtents } from './skew-t-extents.js'

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
  plugins: readonly ZoomHandle[]
}

export type PlotConfig = Omit<
  OptionPatch<PlotOptions>,
  'scales' | 'axes' | 'marks' | 'plugins' | 'themeElement'
> & {
  scales?: Record<string, ScaleHandle | undefined>
  axes?: readonly AxisHandle[]
  marks?: readonly PlotMark[]
  plugins?: readonly ZoomHandle[]
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
  readonly scales: Readonly<Record<string, ScaleBinding>>
  readonly destroyed: boolean
  update(patch: PlotConfig): void
  setConfig(config: PlotConfig): void
  destroy(): void
}

export interface PlotPointer {
  readonly px: number
  readonly py: number
  readonly x: ReadonlyMap<string, ScaleValue>
  readonly inside: boolean
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

const optionKeys = [
  'skewT',
  'clipMarks',
  'autoMargins',
  'axisLayout',
  'background',
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
  'plugins',
]
const marginKeys = ['top', 'right', 'bottom', 'left'] as const
let nextClipId = 0

function validatePatch(config: PlotConfig) {
  validateKeys(config, optionKeys, 'plot')
  if (config.margins) validateKeys(config.margins, marginKeys, 'plot.margins')
}

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

function direction(
  options: PlotOptions,
  name: string,
  candidate?: AxisHandle,
  position?: AxisSide,
  coordinateSystem: CoordinateSystem = 'cartesian',
): Orientation {
  return coordinateAdapter(coordinateSystem).direction(options, name, candidate, position)
}

function validatePlotAppearance(options: PlotOptions) {
  if (typeof options.clipMarks !== 'boolean') throw new Error('plot.clipMarks must be boolean.')
  if (typeof options.autoMargins !== 'boolean') throw new Error('plot.autoMargins must be boolean.')
  if (!['outside', 'inset'].includes(options.axisLayout)) {
    throw new Error('plot.axisLayout must be outside or inset.')
  }
  if (!['chart', 'plot'].includes(options.background)) {
    throw new Error('plot.background must be chart or plot.')
  }
  for (const dimension of ['width', 'height'] as const) {
    if (options[dimension] !== undefined) finiteNonnegative(options[dimension], `plot.${dimension}`)
  }
  if (typeof options.title !== 'string') throw new Error('plot.title must be a string.')
  if (!['auto', 'light', 'dark'].includes(options.theme))
    throw new Error('plot.theme must be auto, light or dark.')
  if (options.themeElement !== undefined && !(options.themeElement instanceof Element)) {
    throw new Error('plot.themeElement must be an Element.')
  }
  if (!options.margins || typeof options.margins !== 'object')
    throw new Error('plot.margins must be an object.')
  for (const side of marginKeys) finiteNonnegative(options.margins[side], `plot.margins.${side}`)
}

function validatePlotCollections(
  options: PlotOptions,
  coordinateSystem: CoordinateSystem = 'cartesian',
) {
  if (!Array.isArray(options.axes)) throw new Error('plot.axes must be an array.')
  if (!Array.isArray(options.marks)) throw new Error('plot.marks must be an array.')
  if (!Array.isArray(options.plugins)) throw new Error('plot.plugins must be an array.')
  if (options.plugins.some((plugin) => !isZoomHandle(plugin))) {
    throw new Error('plot.plugins must contain zoom handles.')
  }
  if (options.plugins.length > 1) {
    throw new Error('A plot can install at most one zoom plugin.')
  }
  if (coordinateSystem !== 'cartesian' && options.plugins.length > 0) {
    throw new Error('The zoom plugin currently supports Cartesian plots only.')
  }
  for (const key of ['scales', 'directions'] as const) {
    const value = options[key]
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`plot.${key} must be a named map.`)
    }
  }
}

function validateAxisPosition(position: AxisSide, coordinateSystem: CoordinateSystem) {
  if (coordinateSystem !== 'polar' && (position === 'angular' || position === 'radial')) {
    throw new Error('Cartesian plots require top, right, bottom or left axes.')
  }
  if (coordinateSystem === 'polar' && position !== 'angular' && position !== 'radial') {
    throw new Error('Polar plots require angular or radial axes.')
  }
}

function validatePlotAxes(options: PlotOptions, coordinateSystem: CoordinateSystem) {
  const ids = new Set<string>()
  const axes = new Set<AxisHandle>()
  for (const axis of options.axes) {
    if (!axis || !isAxisHandle(axis)) throw new Error('plot.axes requires axis handles.')
    const position = axis.options.get().resolved.position
    validateAxisPosition(position, coordinateSystem)
    validateAxisAppearance(axis.options.get().resolved, axis.scale, options, coordinateSystem)
    if (axes.has(axis)) throw new Error('Duplicate axis handle in plot.axes.')
    axes.add(axis)
    const id = axis.options.get().resolved.id
    if (id && ids.has(id)) throw new Error(`Duplicate axis id "${id}".`)
    if (id) ids.add(id)
    if (!Object.hasOwn(options.scales, axis.scale))
      throw new Error(`plot.axes references missing scale "${axis.scale}".`)
  }
  if (
    coordinateSystem === 'polar' &&
    options.axes.some((axis) => axis.options.get().resolved.style === 'classic')
  ) {
    if (
      options.axes.length !== 2 ||
      options.axes.some((axis) => axis.options.get().resolved.style !== 'classic')
    ) {
      throw new Error('Classic polar plots require both angular and radial classic axes.')
    }
  }
}

function validateAxisAppearance(
  axis: Readonly<AxisOptions>,
  scale: string,
  options: PlotOptions,
  coordinateSystem: CoordinateSystem,
) {
  if (coordinateSystem === 'skewT' && (axis.crossAt || axis.style !== 'default')) {
    throw new Error('Skew-T plots require default axes without axis crossings.')
  }
  if (coordinateSystem === 'polar' && axis.crossAt) {
    throw new Error('Crossing axes require cartesian plots.')
  }
  if (!axis.crossAt) return
  const crossed = options.scales[axis.crossAt.scale]
  if (!crossed) throw new Error(`axis.crossAt references missing scale "${axis.crossAt.scale}".`)
  if (
    axis.crossAt.scale === scale ||
    direction(options, axis.crossAt.scale) ===
      (axis.position === 'top' || axis.position === 'bottom' ? 'x' : 'y')
  ) {
    throw new Error('axis.crossAt must reference a perpendicular scale.')
  }
  if ((crossed.kind === 'band') !== (typeof axis.crossAt.value === 'string')) {
    throw new Error('axis.crossAt.value must match the crossing scale kind.')
  }
}
function validatePlotScales(options: PlotOptions, coordinateSystem: CoordinateSystem) {
  for (const [name, scale] of Object.entries(options.scales)) {
    if (!name || !scale || !isScaleHandle(scale))
      throw new Error(`plot.scales.${name} requires a scale handle.`)
    direction(options, name, undefined, undefined, coordinateSystem)
  }
}

function markValidationContext(
  options: PlotOptions,
  coordinateSystem: CoordinateSystem,
): MarkValidationContext {
  return {
    coordinateSystem,
    scales: options.scales,
    direction: (name) => direction(options, name, undefined, undefined, coordinateSystem),
  }
}

function validatePlotMarks(options: PlotOptions, coordinateSystem: CoordinateSystem) {
  const context = markValidationContext(options, coordinateSystem)
  const markIds = new Set<string>()
  const marks = new Set<PlotMark>()
  for (const mark of options.marks) {
    const definition = findMarkDefinition(mark)
    if (!definition) throw new Error(`plot.marks accepts ${supportedMarks} marks only.`)
    if (coordinateSystem === 'skewT' && definition.name !== 'line') {
      throw new Error('Skew-T plots currently support line() marks only, including markers.')
    }
    definition.validate(mark, context)
    if (marks.has(mark)) throw new Error('Duplicate mark handle in plot.marks.')
    marks.add(mark)
    if (mark.id && markIds.has(mark.id)) throw new Error(`Duplicate mark id "${mark.id}".`)
    if (mark.id) markIds.add(mark.id)
  }
}

function validatePlotDirections(options: PlotOptions, coordinateSystem: CoordinateSystem) {
  coordinateAdapter(coordinateSystem).validateScales(options)
  for (const [name, value] of Object.entries(options.directions)) {
    if (!Object.hasOwn(options.scales, name))
      throw new Error(`plot.directions.${name} references a missing scale.`)
    if (value !== 'x' && value !== 'y') throw new Error(`plot.directions.${name} must be x or y.`)
  }
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
      isScaleHandle(value) || isAxisHandle(value) || isPlotMark(value) || isZoomHandle(value),
    validate(options) {
      if (coordinateSystem === 'skewT') {
        if (!options.skewT) throw new Error('Skew-T plots require skewT options.')
        validateKeys(options.skewT, ['skew'], 'plot.skewT')
        if (!Number.isFinite(options.skewT.skew) || options.skewT.skew < 0) {
          throw new Error('plot.skewT.skew must be finite and nonnegative.')
        }
        if (options.axisLayout !== 'outside') {
          throw new Error('Skew-T plots currently require outside axes.')
        }
      } else if (options.skewT !== undefined) {
        throw new Error('plot.skewT requires createSkewTPlot().')
      }
      validatePlotAppearance(options)
      validatePlotCollections(options, coordinateSystem)
      validatePlotAxes(options, coordinateSystem)
      validatePlotScales(options, coordinateSystem)
      validatePlotMarks(options, coordinateSystem)
      validatePlotDirections(options, coordinateSystem)
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
  const pointer = reactive.signal<PlotPointer>(
    Object.freeze({ px: 0, py: 0, x: new Map(), inside: false }),
  )
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
  const markValidators = new Map<PlotMark, { dispose(): void }>()
  const bindings = new Map<
    string,
    {
      scale: ScaleHandle
      direction: Orientation
      binding: ScaleBinding
      markBinding: ScaleBinding
      scope: ReactiveScope
      stopExtents(): void
    }
  >()
  let localScales: Readonly<Record<string, ScaleBinding>> = Object.freeze({})
  let markScales: Readonly<Record<string, ScaleBinding>> = Object.freeze({})
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
  interface MountedMark {
    readonly mark: PlotMark
    readonly definition: MarkDefinition<PlotMark>
    readonly renderer: MarkRenderer<PlotMark>
  }
  let mountedMarks: readonly MountedMark[] = []
  type MountedZoom = {
    handle: ZoomHandle
    onWheel(event: WheelEvent): void
    onDoubleClick(event: MouseEvent): void
    initialDomains: ReadonlyMap<
      string,
      { scale: ScaleHandle; domain: readonly ScaleValue[] | undefined }
    >
    toggledDomains: Map<string, readonly ScaleValue[]>
    toggled: boolean
  }
  let mountedZoom: MountedZoom | undefined
  element.append(background, polarBackground, definitions, gridLayer, marksLayer, axesLayer, title)

  function mountMarks(marks: readonly PlotMark[]) {
    if (
      marks.length === mountedMarks.length &&
      marks.every((mark, index) => mark === mountedMarks[index].mark)
    ) {
      return
    }
    const remaining = new Map(
      mountedMarks.map((entry) => [entry.mark.id ?? entry.mark, entry] as const),
    )
    mountedMarks = marks.map((mark) => {
      const definition = markDefinition(mark)
      const key = mark.id ?? mark
      const match = remaining.get(key)
      const renderer =
        match?.definition === definition ? match.renderer : definition.createRenderer()
      if (match?.definition === definition) remaining.delete(key)
      renderer.mount(marksLayer, mark)
      return { mark, definition, renderer }
    })
    for (const entry of remaining.values()) entry.renderer.destroy()
  }

  function renderMarkGeometry(current: PlotOptions) {
    mountMarks(current.marks)
    const context: MarkRenderContext = {
      skew: current.skewT?.skew,
      localCoordinates: current.axisLayout === 'inset',
      coordinateSystem,
      scales: markScales,
      plot:
        current.axisLayout === 'inset' && coordinateSystem === 'cartesian'
          ? { ...regions.get().plot, x: 0, y: 0 }
          : regions.get().plot,
      direction: (name) => direction(current, name, undefined, undefined, coordinateSystem),
    }
    for (const { mark, renderer } of mountedMarks) renderer.geometry(mark, context)
  }

  function renderMarkStyles(tokens: ThemeTokens) {
    for (const { mark, renderer } of mountedMarks) renderer.style(mark, tokens)
  }

  function removeZoom() {
    if (!mountedZoom) return
    element.removeEventListener('wheel', mountedZoom.onWheel)
    element.removeEventListener('dblclick', mountedZoom.onDoubleClick)
    mountedZoom = undefined
  }

  function reconcileZoom(plugins: readonly ZoomHandle[]) {
    const handle = plugins[0]
    if (mountedZoom?.handle === handle) return
    removeZoom()
    if (!handle) return
    if (coordinateSystem !== 'cartesian') {
      throw new Error('The zoom plugin currently supports Cartesian plots only.')
    }
    const initialDomains = new Map(
      Object.entries(options.get().resolved.scales).map(([name, scale]) => [
        name,
        { scale, domain: scale.options.get().explicit.domain },
      ]),
    )
    const installed: MountedZoom = {
      handle,
      initialDomains,
      toggledDomains: new Map(),
      toggled: false,
      onWheel: () => {},
      onDoubleClick: () => {},
    }
    installed.onWheel = (event) => {
      const config = handle.options.get().resolved
      if (config.wheel === 'none' || !matchesModifierKey(event, config.modifier)) return
      const rect = element.getBoundingClientRect()
      const actualSize = size.get()
      if (rect.width <= 0 || rect.height <= 0 || actualSize.width <= 0 || actualSize.height <= 0)
        return
      const svgX = ((event.clientX - rect.left) / rect.width) * actualSize.width
      const svgY = ((event.clientY - rect.top) / rect.height) * actualSize.height
      const region = regions.get().plot
      if (
        svgX < region.x ||
        svgY < region.y ||
        svgX > region.x + region.width ||
        svgY > region.y + region.height
      ) {
        return
      }
      const activeAxes = new Set<'x' | 'y'>()
      if (config.mode.includes('x') && config.wheel.includes('x')) activeAxes.add('x')
      if (config.mode.includes('y') && config.wheel.includes('y')) activeAxes.add('y')
      if (activeAxes.size === 0) return
      const factor = Math.exp(Math.max(-1, Math.min(1, event.deltaY * 0.002)))
      let changed = false
      for (const [name, binding] of Object.entries(localScales)) {
        const orientation = direction(
          options.get().resolved,
          name,
          undefined,
          undefined,
          coordinateSystem,
        )
        if (
          (orientation !== 'x' && orientation !== 'y') ||
          !activeAxes.has(orientation) ||
          binding.scale.kind === 'band'
        ) {
          continue
        }
        const pixel = orientation === 'x' ? svgX : svgY
        const anchor = binding.invert(pixel)
        const domain = binding.scale.domain.get()
        const low = Number(domain[0])
        const high = Number(domain[1])
        const zoomValue =
          binding.scale.kind === 'log'
            ? (value: number) =>
                Math.exp(Math.log(anchor) + (Math.log(value) - Math.log(anchor)) * factor)
            : (value: number) => anchor + (value - anchor) * factor
        const nextDomain = [zoomValue(low), zoomValue(high)] as const
        if (
          nextDomain.some((value) => !Number.isFinite(value)) ||
          (binding.scale.kind === 'log' && nextDomain.some((value) => value <= 0)) ||
          (binding.scale.kind === 'time' && nextDomain.some((value) => Math.abs(value) > 8.64e15))
        ) {
          continue
        }
        binding.scale.update({ domain: nextDomain })
        changed = true
      }
      if (changed) {
        event.preventDefault()
        installed.toggled = false
      }
    }
    installed.onDoubleClick = (event) => {
      if (event.button !== 0) return
      const config = handle.options.get().resolved
      const region = regions.get().plot
      const rect = element.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      const svgX = ((event.clientX - rect.left) / rect.width) * size.get().width
      const svgY = ((event.clientY - rect.top) / rect.height) * size.get().height
      if (
        svgX < region.x ||
        svgY < region.y ||
        svgX > region.x + region.width ||
        svgY > region.y + region.height
      ) {
        return
      }
      const currentOptions = options.get().resolved
      for (const [name, binding] of Object.entries(localScales)) {
        const orientation = direction(currentOptions, name, undefined, undefined, coordinateSystem)
        if (
          (orientation !== 'x' && orientation !== 'y') ||
          !config.mode.includes(orientation) ||
          binding.scale.kind === 'band'
        )
          continue
        if (config.reset === 'toggle' && installed.toggled) {
          const previous = installed.toggledDomains.get(name)
          if (previous) binding.scale.update({ domain: previous })
          installed.toggledDomains.delete(name)
          continue
        }
        if (config.reset === 'toggle')
          installed.toggledDomains.set(name, binding.scale.domain.get())
        const initial = installed.initialDomains.get(name)
        if (config.reset === 'initial' && initial?.scale === binding.scale) {
          binding.scale.update({ domain: initial.domain })
        } else {
          binding.scale.update({ domain: undefined })
        }
      }
      installed.toggled = config.reset === 'toggle' && !installed.toggled
      event.preventDefault()
    }
    mountedZoom = installed
    element.addEventListener('wheel', installed.onWheel, { passive: false })
    element.addEventListener('dblclick', installed.onDoubleClick)
  }

  function reconcile() {
    const current = options.get().resolved
    for (const [mark, entry] of markValidators) {
      if (!current.marks.includes(mark)) {
        entry.dispose()
        markValidators.delete(mark)
      }
    }
    for (const mark of current.marks) {
      const definition = markDefinition(mark)
      if (markValidators.has(mark) || (!definition.track && !definition.validateUpdates)) continue
      const markScope = scope.createScope()
      const stopValidation = definition.validateUpdates?.(mark, () =>
        markValidationContext(options.get().resolved, coordinateSystem),
      )
      if (definition.track) {
        const track = definition.track
        markScope.run(() => {
          reactive.effect(() => {
            track(mark)
            invalidate(render, DirtyLayer.marks)
          })
        })
      }
      markValidators.set(mark, {
        dispose() {
          stopValidation?.()
          markScope.dispose()
        },
      })
    }
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
              const appearances = config.axes.map((item) =>
                item === axis ? candidate : item.options.get().resolved,
              )
              if (
                appearances.some((item) => item.style === 'classic') &&
                (appearances.length !== 2 || appearances.some((item) => item.style !== 'classic'))
              ) {
                throw new Error('Classic polar plots require both angular and radial classic axes.')
              }
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
    for (const [name, entry] of bindings) {
      if (
        entry.scale !== current.scales[name] ||
        entry.direction !== direction(current, name, undefined, undefined, coordinateSystem)
      ) {
        entry.stopExtents()
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
      const markBinding = bindingScope.run(() =>
        bindScale(
          scale,
          reactive.computed<ScaleRange>(() => {
            if (options.get().resolved.axisLayout !== 'inset' || coordinateSystem === 'polar') {
              return binding.range.get()
            }
            const plot = regions.get().plot
            return Object.freeze(orientation === 'x' ? [0, plot.width] : [plot.height, 0])
          }),
        ),
      )
      const stopExtents = registerScaleExtents(scale, (mode) => {
        const config = options.get().resolved
        if (config.scales[name] !== scale) return undefined
        if (coordinateSystem === 'skewT') {
          return skewTMarkExtents(config.marks, config.scales, name, mode, config.skewT!.skew)
        }
        return markExtents(config.marks, config.scales, name, mode)
      })
      bindings.set(name, {
        scale,
        direction: orientation,
        binding,
        markBinding,
        scope: bindingScope,
        stopExtents,
      })
    }
    localScales = Object.freeze(
      Object.fromEntries([...bindings].map(([name, entry]) => [name, entry.binding])),
    )
    markScales = Object.freeze(
      Object.fromEntries(
        [...bindings].map(([name, entry]) => [
          name,
          current.axisLayout === 'inset' && coordinateSystem === 'cartesian'
            ? entry.markBinding
            : entry.binding,
        ]),
      ),
    )
    reconcileZoom(current.plugins)
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
      const angular = Object.values(localScales).find(
        (binding) => binding.scale.kind === 'angular',
      )!
      const radial = Object.values(localScales).find((binding) => binding.scale.kind === 'radial')!
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
          localScales,
          regions.get(),
          tokens,
          current.skewT!.skew,
        )
      } else if (coordinateSystem === 'polar') {
        renderPolarAxes(axesLayer, gridLayer, current.axes, localScales, regions.get(), tokens)
      } else {
        renderAxes(axesLayer, gridLayer, current.axes, localScales, regions.get(), tokens)
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
            renderAxes(axesLayer, gridLayer, current.axes, localScales, regions.get(), tokens)
          }
        }
      }
    }
    if (dirty & (DirtyLayer.layout | DirtyLayer.axes | DirtyLayer.marks)) {
      renderMarkGeometry(current)
    }
    if (dirty & (DirtyLayer.layout | DirtyLayer.axes | DirtyLayer.marks | DirtyLayer.style)) {
      renderMarkStyles(tokens)
    }
  }

  reconcile()
  const stopPixelRatio = watchCanvasPixelRatio(() => invalidate(render, DirtyLayer.marks))
  const stopSize = observeSize(host, (value) => {
    axisWidths.clear()
    measured.set(value)
  })
  scope.run(() => {
    reactive.effect(() => {
      const current = options.get().resolved
      const measuredSize = measured.get()
      reconcile()
      const scaleDependencies: unknown[] = []
      for (const entry of bindings.values()) {
        entry.scale.domain.get()
        entry.scale.options.get()
        scaleDependencies.push(
          entry.binding,
          entry.scale.domain.version,
          entry.scale.options.version,
        )
      }
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
        invalidate(render, DirtyLayer.marks)
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

  let pointerFrame: number | undefined
  let pendingPointer: { clientX: number; clientY: number; inside: boolean } | undefined
  function publishPointer() {
    pointerFrame = undefined
    const pending = pendingPointer
    pendingPointer = undefined
    if (!pending || destroyed) return
    const rect = element.getBoundingClientRect()
    const actualSize = size.get()
    const plotRegion = regions.get().plot
    if (rect.width <= 0 || rect.height <= 0 || actualSize.width <= 0 || actualSize.height <= 0) {
      pointer.set(Object.freeze({ px: 0, py: 0, x: new Map(), inside: false }))
      return
    }
    const svgX = ((pending.clientX - rect.left) / rect.width) * actualSize.width
    const svgY = ((pending.clientY - rect.top) / rect.height) * actualSize.height
    const px = svgX - plotRegion.x
    const py = svgY - plotRegion.y
    const inside =
      pending.inside && px >= 0 && py >= 0 && px <= plotRegion.width && py <= plotRegion.height
    const current = options.get().resolved
    const values = coordinateAdapter(coordinateSystem).invertPointer({
      svgX,
      svgY,
      plotX: px,
      plotY: py,
      region: plotRegion,
      scales: localScales,
      skew: current.skewT?.skew,
      direction: (name) => direction(current, name, undefined, undefined, coordinateSystem),
    })
    pointer.set(Object.freeze({ px, py, x: values, inside }))
  }
  function queuePointer(event: PointerEvent, inside: boolean) {
    if (!event.isPrimary) return
    pendingPointer = { clientX: event.clientX, clientY: event.clientY, inside }
    if (pointerFrame === undefined) pointerFrame = requestAnimationFrame(publishPointer)
  }
  const onPointerEnter = (event: PointerEvent) => queuePointer(event, true)
  const onPointerMove = (event: PointerEvent) => queuePointer(event, true)
  const onPointerDown = (event: PointerEvent) => queuePointer(event, true)
  const onPointerLeave = (event: PointerEvent) => queuePointer(event, false)
  const onPointerCancel = (event: PointerEvent) => queuePointer(event, false)
  element.addEventListener('pointerenter', onPointerEnter)
  element.addEventListener('pointermove', onPointerMove)
  element.addEventListener('pointerdown', onPointerDown)
  element.addEventListener('pointerleave', onPointerLeave)
  element.addEventListener('pointercancel', onPointerCancel)

  return {
    element,
    options,
    size,
    regions,
    theme,
    pointer,
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
      element.removeEventListener('pointerenter', onPointerEnter)
      element.removeEventListener('pointermove', onPointerMove)
      element.removeEventListener('pointerdown', onPointerDown)
      element.removeEventListener('pointerleave', onPointerLeave)
      element.removeEventListener('pointercancel', onPointerCancel)
      if (pointerFrame !== undefined) cancelAnimationFrame(pointerFrame)
      pendingPointer = undefined
      stopSize()
      stopPixelRatio()
      stopTheme()
      for (const entry of bindings.values()) entry.stopExtents()
      scope.dispose()
      for (const dispose of axisValidators.values()) dispose()
      axisValidators.clear()
      for (const entry of markValidators.values()) entry.dispose()
      markValidators.clear()
      cancelRender(render)
      bindings.clear()
      for (const { renderer } of mountedMarks) renderer.destroy()
      mountedMarks = []
      localScales = Object.freeze({})
      markScales = Object.freeze({})
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

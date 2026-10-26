import { createOptionState, type OptionPatch, type OptionStateSnapshot } from '../core/options.js'
import { DirtyLayer, type DirtyLayers } from '../core/frame-scheduler.js'
import {
  reactive,
  invalidate,
  cancelRender,
  optionSignal,
  scheduler,
  sourceOf,
  subscribe as subscribeSignal,
  type DomainChangeSource,
  type SubscribeOptions,
  type Unsubscribe,
} from '../core/runtime.js'
import type { ReadonlySignal } from '../core/reactive.js'
import { connectAlignGroup, isAlignGroup, type AlignGroup } from '../layout/align-group.js'
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
import { isAxisHandle, validateAxisUpdates, type AxisHandle, type AxisSide } from './axes/axis.js'
import { observeSize } from './resize.js'
import { observeVisibility } from './visibility.js'
import { svgElement, renderAxes, renderPolarAxes, axisTickLabels } from './axes/render-axes.js'
import { arc } from 'd3'
import { projectPolarPoint } from './coordinates/polar-geometry.js'
import { watchCanvasPixelRatio } from './rendering/render-composite-canvas.js'
import type { CoordinateSystem } from './marks/mark-definition.js'
import { isPlotMark, type PlotMark } from './marks/marks.js'
import { createPluginHost, isPlotPlugin, type PlotPlugin } from './plugins/plugins.js'
import {
  projectSkewTPoint,
  invertSkewTPoint,
  type SkewTOptions,
  type SkewTPoint,
  type SoundingPoint,
} from './coordinates/skew-t-geometry.js'
import { renderSkewTAxes } from './axes/render-skew-t-axes.js'
import { createScaleBindings } from './scales/scale-bindings.js'
import { createMarkLayer } from './marks/mark-layer.js'
import { createPointerHub, type PlotPointer } from './interaction/pointer-hub.js'
import {
  createLegendModel,
  type LegendEntry,
  type LegendModel,
  type LegendToggleEventDetail,
} from './plugins/legend/legend.js'
import type { BrushSelection } from './plugins/brush/brush.js'

export type { PlotPointer } from './interaction/pointer-hub.js'
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
  align?: AlignGroup
  scales: Record<string, ScaleHandle>
  directions: Record<string, 'x' | 'y'>
  axes: readonly AxisHandle[]
  marks: readonly PlotMark[]
  plugins: readonly PlotPlugin[]
}

export interface DomainChangeDetail {
  readonly scale: string
  readonly handle: ScaleHandle
  readonly domain: readonly ScaleValue[]
  readonly previous: readonly ScaleValue[] | undefined
  readonly explicit: boolean
  readonly source: DomainChangeSource
}

export interface LayoutChangeDetail {
  readonly size: Readonly<Size>
  readonly regions: PlotLayout
  readonly previous: PlotLayout | undefined
}

export interface LegendChangeDetail {
  readonly entries: readonly LegendEntry[]
}

export interface PlotEventMap {
  domainchange: DomainChangeDetail
  layoutchange: LayoutChangeDetail
  legendchange: LegendChangeDetail
  legendtoggle: LegendToggleEventDetail
  brush: BrushSelection
}

export type PlotConfig = Omit<
  OptionPatch<PlotOptions>,
  'scales' | 'axes' | 'marks' | 'plugins' | 'themeElement' | 'align'
> & {
  scales?: Record<string, ScaleHandle | undefined>
  axes?: readonly AxisHandle[]
  marks?: readonly PlotMark[]
  plugins?: readonly PlotPlugin[]
  themeElement?: Element
  align?: AlignGroup
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
  /** Effective suspension: manual pause, off-screen, or awaiting the first visibility result. */
  readonly paused: boolean
  on<K extends keyof PlotEventMap>(
    type: K,
    listener: (detail: PlotEventMap[K]) => void,
    options?: { signal?: AbortSignal },
  ): Unsubscribe
  /** Like `subscribe`, but also unsubscribes automatically when the plot is destroyed. */
  subscribe<T>(
    source: ReadonlySignal<T>,
    listener: (value: T, previous: T | undefined) => void,
    options?: SubscribeOptions<T>,
  ): Unsubscribe
  update(patch: PlotConfig): void
  setConfig(config: PlotConfig): void
  pause(): void
  resume(): void
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
  readonly alignment: readonly unknown[]
}

function dependenciesChanged(previous: DependencyGroups | undefined, current: DependencyGroups) {
  if (!previous) return true
  const previousKeys = Object.keys(previous)
  const currentKeys = Object.keys(current)
  if (previousKeys.length !== currentKeys.length) return true
  return currentKeys.some((key) => {
    const before = previous[key]
    const after = current[key]
    return before?.length !== after.length || after.some((value, index) => value !== before[index])
  })
}

function equalRegion(left: PlotLayout['plot'], right: PlotLayout['plot']) {
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  )
}

function equalMargins(left: PlotLayout['margins'], right: PlotLayout['margins']) {
  return (
    left.top === right.top &&
    left.right === right.right &&
    left.bottom === right.bottom &&
    left.left === right.left
  )
}

function equalLayout(left: PlotLayout, right: PlotLayout) {
  return equalRegion(left.plot, right.plot) && equalMargins(left.margins, right.margins)
}

function identicalLayout(left: PlotLayout, right: PlotLayout) {
  return (
    equalLayout(left, right) &&
    equalRegion(left.title, right.title) &&
    left.axes.length === right.axes.length &&
    left.axes.every((region, index) => equalRegion(region, right.axes[index]))
  )
}

function equalSize(left: Readonly<Size>, right: Readonly<Size>) {
  return left.width === right.width && left.height === right.height
}

function equalDomain(left: readonly ScaleValue[], right: readonly ScaleValue[]) {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function createPlotInternal(
  host: HTMLElement,
  config: PlotConfig,
  coordinateSystem: CoordinateSystem,
): Plot {
  if (!(host instanceof HTMLElement)) throw new Error('createPlot requires an HTMLElement.')
  const owner = Symbol('plot')
  validatePatch(config)
  const state = createOptionState<PlotOptions>(config, {
    defaults: () => ({
      skewT: coordinateSystem === 'skewT' ? { skew: 30 } : undefined,
      clipMarks: true,
      autoMargins: false,
      axisLayout: 'outside',
      background: 'plot',
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
      isScaleHandle(value) ||
      isAxisHandle(value) ||
      isPlotMark(value) ||
      isPlotPlugin(value) ||
      isAlignGroup(value),
    validate: (options) => validatePlotOptions(options, coordinateSystem, owner),
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
  const viewportSize = reactive.signal<Size | undefined>(undefined)
  const regions = reactive.signal(layout({ width: 0, height: 0 }))
  const initialThemeMode = options.get().resolved.theme
  const theme = reactive.signal(
    resolveTheme(host, initialThemeMode, matchMedia('(prefers-color-scheme: dark)').matches),
  )
  const themeVersion = reactive.signal(0)
  const scope = reactive.createScope()
  let alignment: { group: AlignGroup; member: ReturnType<typeof connectAlignGroup> } | undefined
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
  let manuallyPaused = false
  let visible = false
  const suspended = reactive.signal(true)
  let deferredDirty: DirtyLayers = 0

  function requestRender(dirty: DirtyLayers) {
    if (destroyed) return
    deferredDirty |= dirty
    if (!reactive.untracked(() => suspended.get())) invalidate(render, deferredDirty)
  }

  function updateSuspension() {
    const paused = manuallyPaused || !visible
    if (paused === reactive.untracked(() => suspended.get())) return
    suspended.set(paused)
    if (paused) cancelRender(render)
    else if (deferredDirty !== 0) invalidate(render, deferredDirty)
  }
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
    requestRender: () => requestRender(DirtyLayer.marks),
  })
  const legend = createLegendModel(
    scope,
    () => options.get().resolved.marks,
    element,
    () => theme.get(),
  )
  const pluginHost = createPluginHost(scope, {
    owner,
    element,
    coordinateSystem,
    options,
    size,
    regions,
    pointer: pointerHub.pointer,
    onPointer: (listener) => pointerHub.onPointer(listener),
    legend,
    theme,
    suspended,
    useViewport(viewport) {
      const update = (value: Size) => {
        axisWidths.clear()
        viewportSize.set(value)
      }
      update({ width: viewport.clientWidth, height: viewport.clientHeight })
      const stop = observeSize(viewport, update)
      return () => {
        stop()
        viewportSize.set(undefined)
      }
    },
    get scales() {
      return scaleBindings.scales
    },
    direction: (name) =>
      direction(options.get().resolved, name, undefined, undefined, coordinateSystem),
    locate: (event) => pointerHub.locate(event),
    on: (type, handler) => pointerHub.on(type, handler),
  })
  const plotListeners = new Map<keyof PlotEventMap, Set<(detail: unknown) => void>>()
  let previousLegendEntries = reactive.untracked(() => legend.entries.get())

  function notifyPlotListeners<K extends keyof PlotEventMap>(type: K, detail: PlotEventMap[K]) {
    for (const listener of [...(plotListeners.get(type) ?? [])]) {
      try {
        listener(detail)
      } catch (error) {
        scheduler.enqueueEffect(() => {
          throw error
        })
      }
    }
  }

  function dispatchPlotEvent<K extends keyof PlotEventMap>(type: K, detail: PlotEventMap[K]) {
    reactive.untracked(() => {
      element.dispatchEvent(
        new CustomEvent<PlotEventMap[K]>(type, { detail, bubbles: true, composed: true }),
      )
      notifyPlotListeners(type, detail)
    })
  }

  const forwardLegendToggle = (event: Event) =>
    notifyPlotListeners('legendtoggle', (event as CustomEvent<LegendToggleEventDetail>).detail)
  const forwardBrush = (event: Event) =>
    notifyPlotListeners('brush', (event as CustomEvent<BrushSelection>).detail)
  element.addEventListener('legendtoggle', forwardLegendToggle)
  element.addEventListener('brush', forwardBrush)

  const domainEffects = new Map<string, { scale: ScaleHandle; dispose: () => void }>()
  let layoutPrevious: { size: Readonly<Size>; regions: PlotLayout } | undefined
  let initialLayoutRendered = false

  function currentLayoutSnapshot() {
    return {
      size: size.get(),
      regions: regions.get(),
    }
  }

  function reconcileDomainEffects() {
    const currentScales = scaleBindings.scales
    for (const [name, observer] of domainEffects) {
      if (currentScales[name]?.scale !== observer.scale) {
        observer.dispose()
        domainEffects.delete(name)
      }
    }
    for (const [name, binding] of Object.entries(currentScales)) {
      if (domainEffects.has(name)) continue
      let previous = reactive.untracked(() => binding.scale.domain.get())
      const observer = scope.run(() =>
        reactive.effect(() => {
          const domain = binding.scale.domain.get()
          const explicit = binding.scale.options.get().explicit.domain !== undefined
          if (equalDomain(domain, previous)) return
          const detail: DomainChangeDetail = Object.freeze({
            scale: name,
            handle: binding.scale,
            domain,
            previous,
            explicit,
            source:
              sourceOf(binding.scale) ??
              (binding.scale.following.get() ? 'autoscale' : explicit ? 'api' : 'autoscale'),
          })
          previous = domain
          dispatchPlotEvent('domainchange', detail)
        }),
      )
      domainEffects.set(name, { scale: binding.scale, dispose: () => observer.dispose() })
    }
  }

  function on<K extends keyof PlotEventMap>(
    type: K,
    listener: (detail: PlotEventMap[K]) => void,
    options: { signal?: AbortSignal } = {},
  ): Unsubscribe {
    if (destroyed || options.signal?.aborted) return () => {}
    const listeners = plotListeners.get(type) ?? new Set<(detail: unknown) => void>()
    listeners.add(listener as (detail: unknown) => void)
    plotListeners.set(type, listeners)
    let active = true
    const unsubscribe = () => {
      if (!active) return
      active = false
      options.signal?.removeEventListener('abort', unsubscribe)
      listeners.delete(listener as (detail: unknown) => void)
      if (listeners.size === 0) plotListeners.delete(type)
    }
    options.signal?.addEventListener('abort', unsubscribe, { once: true })
    return unsubscribe
  }

  const ownedSubscriptions = new Set<Unsubscribe>()
  function subscribe<T>(
    source: ReadonlySignal<T>,
    listener: (value: T, previous: T | undefined) => void,
    options?: SubscribeOptions<T>,
  ): Unsubscribe {
    if (destroyed) throw new Error('Cannot subscribe with a destroyed plot.')
    let active = true
    let stop: Unsubscribe = () => {}
    const unsubscribe = () => {
      if (!active) return
      active = false
      ownedSubscriptions.delete(unsubscribe)
      stop()
    }
    ownedSubscriptions.add(unsubscribe)
    try {
      stop = subscribeSignal(source, listener, options)
    } catch (error) {
      ownedSubscriptions.delete(unsubscribe)
      throw error
    }
    if (!active) stop()
    return unsubscribe
  }

  function reconcile() {
    const current = options.get().resolved
    if (alignment?.group !== current.align) {
      alignment?.member.dispose()
      alignment = current.align
        ? { group: current.align, member: connectAlignGroup(current.align) }
        : undefined
    }
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
    reconcileDomainEffects()
    if (!suspended.get()) pluginHost.reconcile(current.plugins)
  }

  function measureAxis(axis: AxisHandle, tokens: ThemeTokens) {
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
  }

  function layoutMargins(current: PlotOptions, tokens: ThemeTokens, cartesianAxes: AxisHandle[]) {
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
    return { margins, insetMargins }
  }

  function renderPolarBackground(current: PlotOptions, plotRegion: PlotLayout['plot']) {
    const polarFill = coordinateSystem === 'polar' && current.background === 'plot'
    background.setAttribute('display', polarFill ? 'none' : '')
    polarBackground.setAttribute('display', polarFill ? '' : 'none')
    if (!polarFill) return
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
    const classicOffset = sign === -1 ? Math.PI : 0
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
        .startAngle(classic ? intercept + start + classicOffset : intercept + sign * start)
        .endAngle(classic ? intercept + end + classicOffset : intercept + sign * end)(null) ?? '',
    )
  }

  function updateBackgroundAndClip(
    current: PlotOptions,
    actualSize: Readonly<Size>,
    plotRegion: PlotLayout['plot'],
    localMarks: boolean,
  ) {
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
  }

  function renderLayout(current: PlotOptions, tokens: ThemeTokens) {
    if (current.axisLayout === 'inset') marksLayer.before(axesLayer)
    else axesLayer.before(marksLayer)
    const actualSize = Object.freeze({
      width: viewportSize.get()?.width ?? current.width ?? measured.get().width,
      height: viewportSize.get()?.height ?? current.height ?? measured.get().height,
    })
    // Equal geometry keeps the previous objects so overlays and plugins do not rerun.
    if (
      !equalSize(
        reactive.untracked(() => size.get()),
        actualSize,
      )
    )
      size.set(actualSize)
    const cartesianAxes = current.axes.filter((axis) =>
      isCartesianSide(axis.options.get().resolved.position),
    )
    const measures = cartesianAxes.map((axis) => measureAxis(axis, tokens))
    const { margins, insetMargins } = layoutMargins(current, tokens, cartesianAxes)
    const naturalRegions = layout(
      actualSize,
      current.axisLayout === 'inset' ? [] : measures,
      current.axisLayout === 'inset' ? insetMargins : margins,
      current.title ? tokens.fontSize * 2 : 0,
    )
    alignment?.member.report(
      actualSize.width,
      naturalRegions.margins.left,
      naturalRegions.margins.right,
    )
    const aligned = alignment?.group.bounds.get()
    const baseMargins = current.axisLayout === 'inset' ? insetMargins : margins
    const nextRegions = aligned
      ? layout(
          actualSize,
          current.axisLayout === 'inset' ? [] : measures,
          {
            ...baseMargins,
            left: baseMargins.left + Math.max(0, aligned.left - naturalRegions.margins.left),
            right:
              baseMargins.right +
              Math.max(0, actualSize.width - naturalRegions.margins.right - aligned.right),
          },
          current.title ? tokens.fontSize * 2 : 0,
        )
      : naturalRegions
    if (
      !identicalLayout(
        reactive.untracked(() => regions.get()),
        nextRegions,
      )
    ) {
      regions.set(nextRegions)
    }
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
    renderPolarBackground(current, plotRegion)
    const localMarks = current.axisLayout === 'inset' && coordinateSystem === 'cartesian'
    if (localMarks)
      marksLayer.setAttribute('transform', `translate(${plotRegion.x},${plotRegion.y})`)
    else marksLayer.removeAttribute('transform')
    updateBackgroundAndClip(current, actualSize, plotRegion, localMarks)
    if (current.title) element.setAttribute('aria-label', current.title)
    else element.removeAttribute('aria-label')
  }

  function updateInsetMargin(
    current: PlotOptions,
    axis: AxisHandle,
    index: number,
    groups: Element[],
  ) {
    if (axis.options.get().resolved.crossAt) return false
    const tickGroup = groups[index]?.querySelector('[data-axis-ticks]')
    if (!tickGroup) return false
    const bounds = tickGroup.getBoundingClientRect()
    const side = axis.options.get().resolved.position
    if (!isCartesianSide(side)) return false
    const extent = side === 'top' || side === 'bottom' ? bounds.height : bounds.width
    const needed = Math.ceil(extent / 10) * 10
    const previous = Math.max(current.margins[side], insetWidths.get(axis) ?? 0)
    if (needed <= previous) return false
    insetWidths.set(axis, needed)
    return true
  }

  function adjustInsetMargins(current: PlotOptions, tokens: ThemeTokens) {
    if (current.axisLayout !== 'inset' || !current.autoMargins) return
    let changed = false
    const groups = [...axesLayer.children]
    current.axes.forEach((axis, index) => {
      if (updateInsetMargin(current, axis, index, groups)) changed = true
    })
    if (!changed) return
    renderLayout(current, tokens)
    renderAxes(axesLayer, gridLayer, current.axes, scaleBindings.scales, regions.get(), tokens)
  }

  function renderAxesForCurrent(current: PlotOptions, tokens: ThemeTokens) {
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
      return
    }
    if (coordinateSystem === 'polar') {
      renderPolarAxes(
        axesLayer,
        gridLayer,
        current.axes,
        scaleBindings.scales,
        regions.get(),
        tokens,
      )
      return
    }

    renderAxes(axesLayer, gridLayer, current.axes, scaleBindings.scales, regions.get(), tokens)
    adjustInsetMargins(current, tokens)
  }

  function render(dirty: DirtyLayers) {
    if (destroyed) return
    deferredDirty |= dirty
    if (suspended.get()) return
    dirty = deferredDirty
    deferredDirty = 0
    const current = options.get().resolved
    const tokens = theme.get()
    if (dirty & DirtyLayer.layout) renderLayout(current, tokens)
    if (dirty & DirtyLayer.style) {
      background.setAttribute('fill', `var(--fews-chart-background, ${tokens.background})`)
      polarBackground.setAttribute('fill', `var(--fews-chart-background, ${tokens.background})`)
      element.style.color = `var(--fews-chart-foreground, ${tokens.foreground})`
      element.style.fontFamily = `var(--fews-chart-font-family, ${tokens.fontFamily})`
      element.style.fontSize = `${tokens.fontSize}px`
      title.setAttribute('fill', 'currentColor')
      gridLayer.setAttribute('stroke', `var(--fews-chart-grid, ${tokens.grid})`)
    }
    if (dirty & (DirtyLayer.layout | DirtyLayer.axes)) renderAxesForCurrent(current, tokens)
    markLayer.render(dirty, current, tokens)
    if (!initialLayoutRendered && dirty & DirtyLayer.layout) {
      layoutPrevious = reactive.untracked(currentLayoutSnapshot)
      initialLayoutRendered = true
    }
  }

  host.append(element)
  const stopVisibility = observeVisibility(host, (next) => {
    if (destroyed) return
    visible = next
    updateSuspension()
  })
  reconcile()
  const stopPixelRatio = watchCanvasPixelRatio(() => markLayer.invalidateAll())
  const stopSize = observeSize(host, (value) => {
    axisWidths.clear()
    measured.set(value)
  })
  scope.run(() => {
    reactive.effect(() => {
      const current = options.get().resolved
      const measuredSize = viewportSize.get() ?? measured.get()
      reconcile()
      const scaleDependencies = scaleBindings.trackDependencies()
      const nextDependencies: PlotDependencySnapshot = {
        layout: {
          size: [
            viewportSize.get()?.width ?? current.width ?? measuredSize.width,
            viewportSize.get()?.height ?? current.height ?? measuredSize.height,
          ],
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
        alignment: [current.align, current.align?.bounds.get()],
      }
      const layoutChanged = dependenciesChanged(dependencySnapshot?.layout, nextDependencies.layout)
      const marksChanged = dependenciesChanged(dependencySnapshot?.marks, nextDependencies.marks)
      const alignmentChanged = nextDependencies.alignment.some(
        (value, index) => value !== dependencySnapshot?.alignment[index],
      )
      dependencySnapshot = nextDependencies
      if (layoutChanged || alignmentChanged) {
        if (layoutChanged) insetWidths.clear()
        requestRender(DirtyLayer.layout | DirtyLayer.axes)
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
      requestRender(DirtyLayer.style | (fontChanged ? DirtyLayer.layout : 0))
    })
    reactive.effect(() => {
      const current = currentLayoutSnapshot()
      const previous = layoutPrevious
      if (!previous) {
        layoutPrevious = current
        return
      }
      if (!initialLayoutRendered) return
      if (
        equalSize(current.size, previous.size) &&
        equalLayout(current.regions, previous.regions)
      ) {
        return
      }
      layoutPrevious = current
      dispatchPlotEvent(
        'layoutchange',
        Object.freeze({
          size: current.size,
          regions: current.regions,
          previous: previous.regions,
        }),
      )
    })
    reactive.effect(() => {
      const entries = legend.entries.get()
      if (entries !== previousLegendEntries) {
        previousLegendEntries = entries
        dispatchPlotEvent('legendchange', Object.freeze({ entries }))
      }
    })
  })
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
    get paused() {
      return suspended.get()
    },
    on,
    subscribe,
    update(patch) {
      apply(patch, false)
    },
    setConfig(next) {
      apply(next, true)
    },
    pause() {
      if (destroyed) throw new Error('Cannot pause a destroyed plot.')
      manuallyPaused = true
      updateSuspension()
    },
    resume() {
      if (destroyed) throw new Error('Cannot resume a destroyed plot.')
      manuallyPaused = false
      updateSuspension()
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      for (const unsubscribe of [...ownedSubscriptions]) unsubscribe()
      alignment?.member.dispose()
      alignment = undefined
      stopVisibility()
      pluginHost.dispose()
      legend.dispose()
      pointerHub.dispose()
      stopSize()
      stopPixelRatio()
      stopTheme()
      markLayer.dispose()
      scaleBindings.dispose()
      scope.dispose()
      domainEffects.clear()
      plotListeners.clear()
      element.removeEventListener('legendtoggle', forwardLegendToggle)
      element.removeEventListener('brush', forwardBrush)
      for (const dispose of axisValidators.values()) dispose()
      axisValidators.clear()
      cancelRender(render)
      deferredDirty = 0
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

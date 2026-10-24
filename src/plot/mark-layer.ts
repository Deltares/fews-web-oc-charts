import { DirtyLayer, type DirtyLayers } from '../core/frame-scheduler.js'
import { reactive } from '../core/runtime.js'
import type { ReactiveScope, ReadonlySignal } from '../core/reactive.js'
import type { PlotLayout } from '../layout/layout.js'
import type { ScaleBinding } from '../scales/scale.js'
import type { ThemeTokens } from '../theme/theme.js'
import type {
  CoordinateSystem,
  MarkDefinition,
  MarkRenderContext,
  MarkRenderer,
} from './mark-definition.js'
import { markDefinition, type PlotMark } from './marks.js'
import { direction, markValidationContext } from './plot-validation.js'
import type { PlotOptions } from './create-plot.js'

export interface MarkLayerContext {
  readonly scope: ReactiveScope
  readonly layer: SVGGElement
  readonly coordinateSystem: CoordinateSystem
  readonly regions: ReadonlySignal<PlotLayout>
  readonly scales: () => Readonly<Record<string, ScaleBinding>>
  readonly options: () => PlotOptions
  /** Schedules a plot frame with the marks layer dirty. */
  readonly requestRender: () => void
}

export interface MarkLayer {
  /** Starts or stops per-mark tracking and update validation for the current membership. */
  reconcile(current: PlotOptions): void
  invalidateAll(): void
  /** Mounts the current marks and repaints those affected by the dirty layers. */
  render(dirty: DirtyLayers, current: PlotOptions, tokens: ThemeTokens): void
  dispose(): void
}

interface MountedMark {
  readonly mark: PlotMark
  readonly definition: MarkDefinition<PlotMark>
  readonly renderer: MarkRenderer<PlotMark>
}

const geometryLayers = DirtyLayer.layout | DirtyLayer.axes | DirtyLayer.marks
const fullRenderLayers = DirtyLayer.layout | DirtyLayer.axes

export function createMarkLayer(context: MarkLayerContext): MarkLayer {
  const { layer, coordinateSystem, regions, scales, options, requestRender } = context
  const scope = context.scope.createScope()
  const watchers = new Map<PlotMark, () => void>()
  let mounted: readonly MountedMark[] = []
  const dirtyMarks = new Set<PlotMark>()
  let allDirty = false

  function invalidateMark(mark: PlotMark) {
    dirtyMarks.add(mark)
    requestRender()
  }

  function watch(mark: PlotMark) {
    const definition = markDefinition(mark)
    if (!definition.track && !definition.validateUpdates) return undefined
    const markScope = scope.createScope()
    const stopValidation = definition.validateUpdates?.(mark, () =>
      markValidationContext(options(), coordinateSystem),
    )
    if (definition.track) {
      markScope.run(() => {
        reactive.effect(() => {
          definition.track?.(mark)
          invalidateMark(mark)
        })
      })
    }
    return () => {
      stopValidation?.()
      markScope.dispose()
    }
  }

  function mount(marks: readonly PlotMark[]) {
    if (
      marks.length === mounted.length &&
      marks.every((mark, index) => mark === mounted[index].mark)
    ) {
      return false
    }
    const remaining = new Map(mounted.map((entry) => [entry.mark.id ?? entry.mark, entry] as const))
    mounted = marks.map((mark) => {
      const definition = markDefinition(mark)
      const key = mark.id ?? mark
      const match = remaining.get(key)
      const renderer =
        match?.definition === definition ? match.renderer : definition.createRenderer()
      if (match?.definition === definition) remaining.delete(key)
      renderer.mount(layer, mark)
      return { mark, definition, renderer }
    })
    for (const entry of remaining.values()) entry.renderer.destroy()
    return true
  }

  function renderGeometry(current: PlotOptions, selected?: ReadonlySet<PlotMark>) {
    const localCartesian = current.axisLayout === 'inset' && coordinateSystem === 'cartesian'
    const renderContext: MarkRenderContext = {
      skew: current.skewT?.skew,
      localCoordinates: current.axisLayout === 'inset',
      coordinateSystem,
      scales: scales(),
      plot: localCartesian ? { ...regions.get().plot, x: 0, y: 0 } : regions.get().plot,
      direction: (name) => direction(current, name, undefined, undefined, coordinateSystem),
    }
    for (const { mark, renderer } of mounted) {
      if (!selected || selected.has(mark)) renderer.geometry(mark, renderContext)
    }
  }

  function renderStyles(tokens: ThemeTokens, selected?: ReadonlySet<PlotMark>) {
    for (const { mark, renderer } of mounted) {
      if (!selected || selected.has(mark)) renderer.style(mark, tokens)
    }
  }

  return {
    reconcile(current) {
      for (const [mark, stop] of watchers) {
        if (!current.marks.includes(mark)) {
          stop()
          watchers.delete(mark)
        }
      }
      for (const mark of current.marks) {
        if (watchers.has(mark)) continue
        const stop = watch(mark)
        if (stop) watchers.set(mark, stop)
      }
    },
    invalidateAll() {
      allDirty = true
      requestRender()
    },
    render(dirty, current, tokens) {
      const fullRender = Boolean(dirty & fullRenderLayers) || allDirty
      const updates = new Set(dirtyMarks)
      dirtyMarks.clear()
      allDirty = false
      const renderAll = mount(current.marks) || fullRender
      if (dirty & geometryLayers) {
        if (renderAll) renderGeometry(current)
        else if (updates.size > 0) renderGeometry(current, updates)
      }
      if (dirty & (geometryLayers | DirtyLayer.style)) {
        if (dirty & (fullRenderLayers | DirtyLayer.style) || renderAll) renderStyles(tokens)
        else if (updates.size > 0) renderStyles(tokens, updates)
      }
    },
    dispose() {
      for (const stop of watchers.values()) stop()
      watchers.clear()
      scope.dispose()
      for (const { renderer } of mounted) renderer.destroy()
      mounted = []
      dirtyMarks.clear()
      allDirty = false
    },
  }
}

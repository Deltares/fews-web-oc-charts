import { reactive } from '../../core/runtime.js'
import type { ReadonlySignal } from '../../core/reactive.js'
import type { ScaleBinding, ScaleValue } from '../../scales/scale.js'
import type { PlotLayout, Size } from '../../layout/layout.js'
import { coordinateAdapter } from '../coordinates/coordinate-system.js'
import type { CoordinateSystem } from '../marks/mark-definition.js'
import { direction } from '../plot-validation.js'
import type { PlotOptions } from '../create-plot.js'

export interface PlotPointer {
  readonly px: number
  readonly py: number
  readonly x: ReadonlyMap<string, ScaleValue>
  readonly inside: boolean
}

/** A client position mapped into SVG and plot-region coordinates. */
export interface PlotPosition {
  readonly svgX: number
  readonly svgY: number
  readonly plotX: number
  readonly plotY: number
  /** Whether the position lies within the plot region, edges included. */
  readonly inside: boolean
}

interface GestureEvents {
  wheel: WheelEvent
  dblclick: MouseEvent
  pointerdown: PointerEvent
  pointermove: PointerEvent
  pointerup: PointerEvent
  pointercancel: PointerEvent
  lostpointercapture: PointerEvent
}

export type GestureType = keyof GestureEvents
export type GestureHandler<K extends GestureType> = (event: GestureEvents[K]) => void

export interface PointerHubContext {
  readonly element: SVGSVGElement
  readonly coordinateSystem: CoordinateSystem
  readonly size: ReadonlySignal<Readonly<Size>>
  readonly regions: ReadonlySignal<PlotLayout>
  readonly scales: () => Readonly<Record<string, ScaleBinding>>
  readonly options: () => PlotOptions
}

export interface PointerHub {
  readonly pointer: ReadonlySignal<PlotPointer>
  onPointer(listener: (pointer: PlotPointer) => void): () => void
  /** Maps client coordinates to plot coordinates; undefined while the plot has no size. */
  locate(event: { readonly clientX: number; readonly clientY: number }): PlotPosition | undefined
  /** Registers a gesture handler; the element listener exists only while handlers do. */
  on<K extends GestureType>(type: K, handler: GestureHandler<K>): () => void
  dispose(): void
}

const outside: PlotPointer = Object.freeze({ px: 0, py: 0, x: new Map(), inside: false })

export function createPointerHub(context: PointerHubContext): PointerHub {
  const { element, coordinateSystem, size, regions, scales, options } = context
  const pointer = reactive.signal<PlotPointer>(outside)
  const pointerConsumers = new Set<(pointer: PlotPointer) => void>()
  const gestures = new Map<GestureType, Set<(event: Event) => void>>()
  const gestureListeners = new Map<GestureType, (event: Event) => void>()
  let frame: number | undefined
  let pending: { clientX: number; clientY: number; entered: boolean } | undefined
  let pressed = false
  let disposed = false

  function locate(event: { readonly clientX: number; readonly clientY: number }) {
    const rect = element.getBoundingClientRect()
    const actualSize = size.get()
    if (rect.width <= 0 || rect.height <= 0 || actualSize.width <= 0 || actualSize.height <= 0) {
      return undefined
    }
    const region = regions.get().plot
    const svgX = ((event.clientX - rect.left) / rect.width) * actualSize.width
    const svgY = ((event.clientY - rect.top) / rect.height) * actualSize.height
    const plotX = svgX - region.x
    const plotY = svgY - region.y
    const inside = plotX >= 0 && plotY >= 0 && plotX <= region.width && plotY <= region.height
    return Object.freeze({ svgX, svgY, plotX, plotY, inside })
  }

  function publish() {
    frame = undefined
    const next = pending
    pending = undefined
    if (!next || disposed) return
    const position = locate(next)
    if (!position) {
      pointer.set(outside)
      for (const listener of pointerConsumers) listener(outside)
      return
    }
    const current = options()
    const values = coordinateAdapter(coordinateSystem).invertPointer({
      svgX: position.svgX,
      svgY: position.svgY,
      plotX: position.plotX,
      plotY: position.plotY,
      region: regions.get().plot,
      scales: scales(),
      skew: current.skewT?.skew,
      direction: (name) => direction(current, name, undefined, undefined, coordinateSystem),
    })
    pointer.set(
      Object.freeze({
        px: position.plotX,
        py: position.plotY,
        x: values,
        inside: next.entered && position.inside && !pressed,
      }),
    )
    for (const listener of pointerConsumers) listener(pointer.get())
  }

  function queue(event: PointerEvent, entered: boolean) {
    if (!event.isPrimary) return
    pending = { clientX: event.clientX, clientY: event.clientY, entered }
    if (frame === undefined) frame = requestAnimationFrame(publish)
  }

  // Hover feedback is suppressed while a button is held, so drag gestures
  // (zoom, brush, pan) do not show tooltips or crosshairs.
  function release(event: PointerEvent, entered: boolean) {
    if (!event.isPrimary) return
    pressed = false
    queue(event, entered)
  }

  const pointerListeners = {
    pointerenter: (event: PointerEvent) => queue(event, true),
    pointermove: (event: PointerEvent) => queue(event, true),
    pointerdown: (event: PointerEvent) => {
      if (event.isPrimary) pressed = true
      queue(event, true)
    },
    pointerup: (event: PointerEvent) => release(event, true),
    lostpointercapture: (event: PointerEvent) => release(event, true),
    pointerleave: (event: PointerEvent) => release(event, false),
    pointercancel: (event: PointerEvent) => release(event, false),
  }
  for (const [type, listener] of Object.entries(pointerListeners)) {
    element.addEventListener(type as keyof typeof pointerListeners, listener)
  }

  function detachGesture(type: GestureType) {
    const listener = gestureListeners.get(type)
    if (listener) element.removeEventListener(type, listener)
    gestureListeners.delete(type)
    gestures.delete(type)
  }

  return {
    pointer,
    onPointer(listener) {
      pointerConsumers.add(listener)
      return () => {
        pointerConsumers.delete(listener)
      }
    },
    locate,
    on(type, handler) {
      if (disposed) throw new Error('Cannot register a gesture on a destroyed plot.')
      let handlers = gestures.get(type)
      if (!handlers) {
        const registered = new Set<(event: Event) => void>()
        const listener = (event: Event) => {
          for (const registeredHandler of [...registered]) registeredHandler(event)
        }
        handlers = registered
        gestures.set(type, registered)
        gestureListeners.set(type, listener)
        element.addEventListener(type, listener, type === 'wheel' ? { passive: false } : undefined)
      }
      const entry = handler as (event: Event) => void
      handlers.add(entry)
      return () => {
        if (!handlers.delete(entry) || handlers.size > 0 || gestures.get(type) !== handlers) return
        detachGesture(type)
      }
    },
    dispose() {
      if (disposed) return
      disposed = true
      for (const [type, listener] of Object.entries(pointerListeners)) {
        element.removeEventListener(type as keyof typeof pointerListeners, listener)
      }
      for (const type of [...gestures.keys()]) detachGesture(type)
      if (frame !== undefined) cancelAnimationFrame(frame)
      frame = undefined
      pending = undefined
      pointerConsumers.clear()
    },
  }
}

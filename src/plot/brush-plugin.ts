import type { ScaleValue } from '../scales/scale.js'
import { matchesModifierKey } from '../Utils/modifierKey.js'
import type { PlotContext, PluginDefinition } from './plugin-definition.js'
import {
  brushEvent,
  isBrushHandle,
  type BrushHandle,
  type BrushMode,
  type BrushSelection,
} from './brush.js'
import { svgElement } from './svg.js'

function installBrush(handle: BrushHandle, context: PlotContext) {
  const layer = svgElement('g', { 'data-layer': 'brush', 'pointer-events': 'none' })
  const selection = svgElement('rect', {
    fill: 'currentColor',
    'fill-opacity': 0.16,
    stroke: 'currentColor',
    'stroke-dasharray': '4 2',
    display: 'none',
  })
  layer.append(selection)
  context.element.append(layer)

  let active:
    | {
        pointerId: number
        mode: BrushMode
        startX: number
        startY: number
        x: number
        y: number
      }
    | undefined
  let captured = false

  function bounds(gesture: NonNullable<typeof active>) {
    const region = context.regions.get().plot
    const x0 = Math.max(region.x, Math.min(gesture.startX, gesture.x))
    const x1 = Math.min(region.x + region.width, Math.max(gesture.startX, gesture.x))
    const y0 = Math.max(region.y, Math.min(gesture.startY, gesture.y))
    const y1 = Math.min(region.y + region.height, Math.max(gesture.startY, gesture.y))
    return { x0, x1, y0, y1 }
  }

  function renderSelection(gesture: NonNullable<typeof active>) {
    const region = context.regions.get().plot
    const { x0, x1, y0, y1 } = bounds(gesture)
    const x = gesture.mode === 'x' ? region.x : x0
    const y = gesture.mode === 'y' ? region.y : y0
    const width = gesture.mode === 'y' ? region.width : x1 - x0
    const height = gesture.mode === 'x' ? region.height : y1 - y0
    selection.setAttribute('x', String(x))
    selection.setAttribute('y', String(y))
    selection.setAttribute('width', String(width))
    selection.setAttribute('height', String(height))
    selection.setAttribute('display', '')
  }

  function selectedScales(mode: BrushMode) {
    return Object.entries(context.scales).flatMap(([name, binding]) => {
      const orientation = context.direction(name)
      if ((orientation !== 'x' && orientation !== 'y') || !mode.includes(orientation)) return []
      return [{ name, binding, orientation }]
    })
  }

  function selectionFor(gesture: NonNullable<typeof active>): BrushSelection | undefined {
    const { x0, x1, y0, y1 } = bounds(gesture)
    const ranges: Record<string, readonly ScaleValue[]> = {}
    for (const { name, binding, orientation } of selectedScales(gesture.mode)) {
      const start = orientation === 'x' ? x0 : y0
      const end = orientation === 'x' ? x1 : y1
      if (binding.scale.kind === 'band') {
        const low = Math.min(start, end)
        const high = Math.max(start, end)
        const categories = binding.scale.domain.get().filter((value) => {
          const bandStart = binding.project(value)
          const bandEnd = bandStart + binding.bandwidth
          return Math.max(bandStart, bandEnd) >= low && Math.min(bandStart, bandEnd) <= high
        })
        if (categories.length) ranges[name] = Object.freeze(categories)
        continue
      }
      const first = binding.invert(start)
      const second = binding.invert(end)
      if (!Number.isFinite(first) || !Number.isFinite(second)) continue
      ranges[name] = Object.freeze([Math.min(first, second), Math.max(first, second)])
    }
    if (!Object.keys(ranges).length) return undefined
    return Object.freeze({ mode: gesture.mode, scales: Object.freeze(ranges) })
  }

  function finish(event?: PointerEvent) {
    if (!active || (event && event.pointerId !== active.pointerId)) return
    const gesture = active
    if (event && event.type === 'pointerup') {
      const position = context.locate(event)
      if (position) {
        gesture.x = position.svgX
        gesture.y = position.svgY
        renderSelection(gesture)
      }
    }
    active = undefined
    selection.setAttribute('display', 'none')
    if (captured && context.element.hasPointerCapture(gesture.pointerId)) {
      context.element.releasePointerCapture(gesture.pointerId)
    }
    captured = false
    if (event?.type !== 'pointerup') return
    const { x0, x1, y0, y1 } = bounds(gesture)
    if ((gesture.mode.includes('x') && x0 === x1) || (gesture.mode.includes('y') && y0 === y1)) {
      return
    }
    const detail = selectionFor(gesture)
    if (!detail) return
    context.element.dispatchEvent(
      new CustomEvent<BrushSelection>(brushEvent, { detail, bubbles: true, composed: true }),
    )
  }

  context.on('pointerdown', (event) => {
    const config = handle.options.get().resolved
    if (
      active ||
      event.defaultPrevented ||
      !event.isPrimary ||
      event.button !== 0 ||
      !matchesModifierKey(event, config.modifier)
    ) {
      return
    }
    const position = context.locate(event)
    if (!position?.inside || selectedScales(config.mode).length === 0) return
    active = {
      pointerId: event.pointerId,
      mode: config.mode,
      startX: position.svgX,
      startY: position.svgY,
      x: position.svgX,
      y: position.svgY,
    }
    renderSelection(active)
    if (event.isTrusted) {
      context.element.setPointerCapture(event.pointerId)
      captured = true
    }
    event.preventDefault()
  })

  context.on('pointermove', (event) => {
    if (!active || event.pointerId !== active.pointerId) return
    const position = context.locate(event)
    if (!position) return
    active.x = position.svgX
    active.y = position.svgY
    renderSelection(active)
    event.preventDefault()
  })

  context.on('pointerup', finish)
  context.on('pointercancel', finish)
  return {
    destroy() {
      finish()
      layer.remove()
    },
  }
}

export const brushDefinition: PluginDefinition<BrushHandle> = {
  name: 'brush',
  is: isBrushHandle,
  validate(_handle, { coordinateSystem, plugins }) {
    if (plugins.filter((plugin) => isBrushHandle(plugin)).length > 1) {
      throw new Error('A plot can install at most one brush plugin.')
    }
    if (coordinateSystem !== 'cartesian') {
      throw new Error('The brush plugin currently supports Cartesian plots only.')
    }
  },
  install: installBrush,
}

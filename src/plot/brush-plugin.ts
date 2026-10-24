import { reactive } from '../core/runtime.js'
import { matchesModifierKey } from '../Utils/modifierKey.js'
import type { PlotContext, PluginDefinition } from './plugin-definition.js'
import {
  brushEvent,
  isBrushHandle,
  validateBrushScaleSelection,
  validateBrushSelections,
  type BrushHandle,
  type BrushOptions,
  type BrushSelection,
  type BrushSelectionMode,
} from './brush.js'
import { svgElement } from './svg.js'
import {
  brushHandleNames as handleNames,
  clamp,
  moveBounds,
  orderedBounds,
  projectSelection,
  resizeBounds,
  selectedScales,
  selectionFor,
  validBounds,
  type BrushBounds as Bounds,
  type BrushHandleName as HandleName,
} from './brush-selection.js'

const minMove = 25
const handleSize = 6
interface Gesture {
  pointerId: number
  kind: 'new' | 'move' | HandleName
  config: Readonly<BrushOptions>
  mode: BrushSelectionMode | undefined
  startX: number
  startY: number
  origin: Bounds
  bounds: Bounds
}

function installBrush(handle: BrushHandle, context: PlotContext) {
  const layer = svgElement('g', { 'data-layer': 'brush', 'pointer-events': 'none' })
  const selection = svgElement('rect', {
    'data-brush-selection': '',
    fill: 'currentColor',
    'fill-opacity': 0.16,
    stroke: 'currentColor',
    'stroke-dasharray': '4 2',
    display: 'none',
  })
  const handles = new Map(
    handleNames.map((name) => {
      const node = svgElement('rect', {
        'data-brush-handle': name,
        fill: 'currentColor',
        display: 'none',
      })
      node.style.cursor =
        name === 'e' || name === 'w'
          ? 'ew-resize'
          : name === 'n' || name === 's'
            ? 'ns-resize'
            : name === 'nw' || name === 'se'
              ? 'nwse-resize'
              : 'nesw-resize'
      return [name, node] as const
    }),
  )
  layer.style.touchAction = 'none'
  layer.append(selection, ...handles.values())
  context.element.append(layer)
  let active: Gesture | undefined
  let captured = false
  let lastPublished = handle.selection.get()

  function regionBounds(): Bounds {
    const region = context.regions.get().plot
    return { x0: region.x, x1: region.x + region.width, y0: region.y, y1: region.y + region.height }
  }

  function hide() {
    selection.setAttribute('display', 'none')
    for (const node of handles.values()) node.setAttribute('display', 'none')
    layer.removeAttribute('data-mode')
  }

  function render(bounds: Bounds, mode: BrushSelectionMode, persistent: boolean) {
    hide()
    layer.setAttribute('data-mode', mode)
    const region = regionBounds()
    const x0 = mode === 'y' ? region.x0 : bounds.x0
    const x1 = mode === 'y' ? region.x1 : bounds.x1
    const y0 = mode === 'x' ? region.y0 : bounds.y0
    const y1 = mode === 'x' ? region.y1 : bounds.y1
    for (const [name, value] of Object.entries({ x: x0, y: y0, width: x1 - x0, height: y1 - y0 })) {
      selection.setAttribute(name, String(value))
    }
    selection.setAttribute('display', '')
    selection.setAttribute('pointer-events', persistent ? 'all' : 'none')
    selection.style.cursor = persistent ? 'move' : ''
    const guideX = active?.kind === 'new' ? active.startX : (x0 + x1) / 2
    const guideY = active?.kind === 'new' ? active.startY : (y0 + y1) / 2
    for (const [name, node] of handles) {
      const horizontal = name === 'e' || name === 'w'
      const vertical = name === 'n' || name === 's'
      if (
        (mode === 'x' && !horizontal) ||
        (mode === 'y' && !vertical) ||
        (mode === 'xy' && !persistent)
      )
        continue
      const guideLeft = clamp(guideX - minMove, x0, x1)
      const guideRight = clamp(guideX + minMove, x0, x1)
      const guideTop = clamp(guideY - minMove, y0, y1)
      const guideBottom = clamp(guideY + minMove, y0, y1)
      const width = vertical ? guideRight - guideLeft : handleSize
      const height = horizontal ? guideBottom - guideTop : handleSize
      const centerX = name.includes('w')
        ? x0
        : name.includes('e')
          ? x1
          : (guideLeft + guideRight) / 2
      const centerY = name.includes('n')
        ? y0
        : name.includes('s')
          ? y1
          : (guideTop + guideBottom) / 2
      for (const [attribute, value] of Object.entries({
        x: centerX - width / 2,
        y: centerY - height / 2,
        width,
        height,
      }))
        node.setAttribute(attribute, String(value))
      node.setAttribute('pointer-events', persistent ? 'all' : 'none')
      node.setAttribute('display', '')
    }
  }

  function renderStoredSelection() {
    const config = handle.options.get().resolved
    const stored = handle.selection.get()
    const bounds =
      stored && config.persistent ? projectSelection(stored, regionBounds(), context) : undefined
    if (bounds && stored) render(bounds, stored.mode, true)
    else hide()
  }

  function publish(gesture: Gesture) {
    if (!gesture.mode || !validBounds(gesture.bounds, gesture.mode)) return
    const detail = selectionFor(gesture.bounds, gesture.mode, context)
    if (!detail) return
    if (gesture.config.persistent) {
      handle.setSelection(detail)
      lastPublished = handle.selection.get()
    }
    context.element.dispatchEvent(
      new CustomEvent<BrushSelection>(brushEvent, { detail, bubbles: true, composed: true }),
    )
  }

  function updateGesture(event: PointerEvent) {
    const gesture = active
    if (!gesture || event.pointerId !== gesture.pointerId) return
    const config = handle.options.get().resolved
    if (
      config.mode !== gesture.config.mode ||
      config.modifier !== gesture.config.modifier ||
      config.persistent !== gesture.config.persistent ||
      handle.selection.get() !== lastPublished
    ) {
      finish()
      return
    }
    const position = context.locate(event)
    if (!position) return
    const region = regionBounds()
    const x = clamp(position.svgX, region.x0, region.x1)
    const y = clamp(position.svgY, region.y0, region.y1)
    const dx = x - gesture.startX
    const dy = y - gesture.startY
    if (gesture.kind === 'new') {
      if (gesture.config.mode === 'auto') {
        gesture.mode =
          Math.abs(dx) <= minMove && Math.abs(dy) <= minMove
            ? undefined
            : Math.abs(dy) <= minMove
              ? 'x'
              : Math.abs(dx) <= minMove
                ? 'y'
                : 'xy'
      }
      gesture.bounds = orderedBounds(gesture.startX, gesture.startY, x, y)
    } else if (gesture.kind === 'move') {
      gesture.bounds = moveBounds(gesture.origin, region, gesture.mode, dx, dy)
    } else {
      gesture.bounds = resizeBounds(gesture.origin, gesture.kind, x, y)
    }
    if (gesture.mode) render(gesture.bounds, gesture.mode, gesture.config.persistent)
    else hide()
  }

  function finish(event?: PointerEvent) {
    if (!active || (event && event.pointerId !== active.pointerId)) return
    if (event?.type === 'pointerup') updateGesture(event)
    if (!active) return
    const gesture = active
    active = undefined
    if (captured && context.element.hasPointerCapture(gesture.pointerId)) {
      context.element.releasePointerCapture(gesture.pointerId)
    }
    captured = false
    if (event?.type === 'pointerup') publish(gesture)
    renderStoredSelection()
  }

  const stopValidation = validateBrushSelections(handle, (value) => {
    validateBrushScaleSelection(value, context.options.get().resolved.scales, (name) =>
      context.direction(name),
    )
  })

  context.scope.run(() =>
    reactive.effect(() => {
      const config = handle.options.get().resolved
      const stored = handle.selection.get()
      context.options.get()
      context.regions.get()
      for (const binding of Object.values(context.scales)) {
        binding.range.get()
        binding.scale.domain.get()
        binding.scale.options.get()
      }
      if (
        active &&
        (config.mode !== active.config.mode ||
          config.modifier !== active.config.modifier ||
          config.persistent !== active.config.persistent ||
          stored !== lastPublished)
      )
        finish()
      if (!active) renderStoredSelection()
    }),
  )

  context.on('pointerdown', (event) => {
    const config = handle.options.get().resolved
    if (
      active ||
      event.defaultPrevented ||
      (event.target instanceof Element && !!event.target.closest('[data-cross-section-handle]')) ||
      !event.isPrimary ||
      event.button !== 0 ||
      !matchesModifierKey(event, config.modifier)
    )
      return
    const position = context.locate(event)
    if (!position) return
    const target = event.target instanceof Element ? event.target : undefined
    const resize = handleNames.find((name) => handles.get(name) === target)
    const stored = handle.selection.get()
    const previous =
      config.persistent && stored ? projectSelection(stored, regionBounds(), context) : undefined
    const kind = previous && resize ? resize : previous && target === selection ? 'move' : 'new'
    const mode =
      kind !== 'new' && stored ? stored.mode : config.mode === 'auto' ? undefined : config.mode
    if ((!position.inside && kind === 'new') || selectedScales(context, mode ?? 'xy').length === 0)
      return
    const origin =
      kind !== 'new' && previous
        ? previous
        : {
            x0: position.svgX,
            x1: position.svgX,
            y0: position.svgY,
            y1: position.svgY,
          }
    active = {
      pointerId: event.pointerId,
      kind,
      config,
      mode,
      startX: position.svgX,
      startY: position.svgY,
      origin,
      bounds: origin,
    }
    lastPublished = stored
    if (mode) render(origin, mode, config.persistent)
    else hide()
    if (event.isTrusted) {
      context.element.setPointerCapture(event.pointerId)
      captured = true
    }
    event.preventDefault()
  })
  context.on('pointermove', (event) => {
    if (!active || event.pointerId !== active.pointerId) return
    updateGesture(event)
    if (active?.config.persistent) publish(active)
    event.preventDefault()
  })
  context.on('pointerup', finish)
  context.on('pointercancel', finish)
  context.on('lostpointercapture', finish)
  return {
    destroy() {
      finish()
      stopValidation()
      layer.remove()
    },
  }
}

export const brushDefinition: PluginDefinition<BrushHandle> = {
  name: 'brush',
  is: isBrushHandle,
  validate(handle, context) {
    const { coordinateSystem, plugins, scales } = context
    if (plugins.filter((plugin) => isBrushHandle(plugin)).length > 1) {
      throw new Error('A plot can install at most one brush plugin.')
    }
    if (coordinateSystem !== 'cartesian') {
      throw new Error('The brush plugin currently supports Cartesian plots only.')
    }
    const selection = handle.selection.get()
    if (selection) validateBrushScaleSelection(selection, scales, (name) => context.direction(name))
  },
  install: installBrush,
}

import type { ScaleBinding, ScaleValue } from '../scales/scale.js'
import { reactive } from '../core/runtime.js'
import { matchesModifierKey } from '../Utils/modifierKey.js'
import { isBrushHandle } from './brush.js'
import type { PlotContext, PluginDefinition } from './plugin-definition.js'
import { isPanHandle, type PanHandle, type PanMode } from './pan.js'

const maxTime = 8.64e15
type Axis = 'x' | 'y'

function installPan(handle: PanHandle, context: PlotContext) {
  const originalTouchAction = context.element.style.getPropertyValue('touch-action')
  const originalTouchActionPriority = context.element.style.getPropertyPriority('touch-action')
  let appliedTouchAction = ''
  let active:
    | {
        pointerId: number
        x: number
        y: number
      }
    | undefined
  let captured = false

  function updateTouchAction(mode: PanMode) {
    appliedTouchAction = mode === 'x' ? 'pan-y' : mode === 'y' ? 'pan-x' : 'none'
    context.element.style.setProperty('touch-action', appliedTouchAction)
  }

  updateTouchAction(handle.options.get().resolved.mode)
  context.scope.run(() =>
    reactive.effect(() => updateTouchAction(handle.options.get().resolved.mode)),
  )

  function selectedScales(mode: PanMode) {
    return Object.entries(context.scales).flatMap(([name, binding]) => {
      const orientation = context.direction(name)
      if (
        (orientation !== 'x' && orientation !== 'y') ||
        !mode.includes(orientation) ||
        binding.scale.kind === 'band'
      ) {
        return []
      }
      return [{ binding, orientation }]
    })
  }

  function finish(event?: PointerEvent) {
    if (!active || (event && event.pointerId !== active.pointerId)) return
    const pointerId = active.pointerId
    active = undefined
    if (captured && context.element.hasPointerCapture(pointerId)) {
      context.element.releasePointerCapture(pointerId)
    }
    captured = false
  }

  context.on('pointerdown', (event) => {
    const brushOwnsGesture = context.options
      .get()
      .resolved.plugins.some(
        (plugin) =>
          isBrushHandle(plugin) &&
          matchesModifierKey(event, plugin.options.get().resolved.modifier),
      )
    if (
      active ||
      event.defaultPrevented ||
      brushOwnsGesture ||
      !event.isPrimary ||
      event.button !== 0 ||
      !matchesModifierKey(event, handle.options.get().resolved.modifier)
    ) {
      return
    }
    const position = context.locate(event)
    if (!position?.inside || selectedScales(handle.options.get().resolved.mode).length === 0) {
      return
    }
    active = { pointerId: event.pointerId, x: position.svgX, y: position.svgY }
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
    const previous = active
    active = { ...previous, x: position.svgX, y: position.svgY }
    const config = handle.options.get().resolved
    for (const { binding, orientation } of selectedScales(config.mode)) {
      panScale(binding, orientation, previous, position.svgX, position.svgY)
    }
    event.preventDefault()
  })

  context.on('pointerup', finish)
  context.on('pointercancel', finish)
  return {
    destroy() {
      finish()
      if (context.element.style.getPropertyValue('touch-action') !== appliedTouchAction) return
      if (originalTouchAction) {
        context.element.style.setProperty(
          'touch-action',
          originalTouchAction,
          originalTouchActionPriority,
        )
      } else {
        context.element.style.removeProperty('touch-action')
      }
    },
  }
}

function panScale(
  binding: ScaleBinding,
  orientation: Axis,
  previous: { x: number; y: number },
  nextX: number,
  nextY: number,
) {
  const pixel = orientation === 'x' ? 'x' : 'y'
  const previousPixel = previous[pixel]
  const nextPixel = orientation === 'x' ? nextX : nextY
  const before = binding.invert(previousPixel)
  const after = binding.invert(nextPixel)
  const domain = binding.scale.domain.get()
  const shiftDomain = (value: number) =>
    binding.scale.kind === 'log' ? value * (before / after) : value + before - after
  const nextDomain = domain.map((value) => shiftDomain(Number(value))) as ScaleValue[]
  if (
    nextDomain.some(
      (value) =>
        !Number.isFinite(value) ||
        (binding.scale.kind === 'log' && Number(value) <= 0) ||
        (binding.scale.kind === 'time' && Math.abs(Number(value)) > maxTime),
    )
  ) {
    return
  }
  binding.scale.update({ domain: nextDomain })
}

export const panDefinition: PluginDefinition<PanHandle> = {
  name: 'pan',
  is: isPanHandle,
  validate(_handle, { coordinateSystem, plugins }) {
    if (plugins.filter((plugin) => isPanHandle(plugin)).length > 1) {
      throw new Error('A plot can install at most one pan plugin.')
    }
    if (coordinateSystem !== 'cartesian') {
      throw new Error('The pan plugin currently supports Cartesian plots only.')
    }
  },
  install: installPan,
}

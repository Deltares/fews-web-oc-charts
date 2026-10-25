import type { ScaleHandle, ScaleValue } from '../../../scales/scale.js'
import { reactive, withSource } from '../../../core/runtime.js'
import { matchesModifierKey } from '../../../Utils/modifierKey.js'
import type { PlotContext, PluginDefinition } from '../plugin-definition.js'
import { isZoomHandle, type ZoomHandle, type ZoomOptions } from './zoom.js'
import { isValidScaleDomain } from '../../scales/scale-domain.js'
import { svgElement } from '../../rendering/svg.js'
import { isBrushHandle } from '../brush/brush.js'
import { clamp, orderedBounds } from '../brush/brush-selection.js'
import { isPanHandle } from '../pan/pan.js'

const autoModeThreshold = 25
type ZoomSelectionMode = Exclude<ZoomOptions['mode'], 'auto'>

function installZoom(handle: ZoomHandle, context: PlotContext) {
  const initialDomains = new Map<
    string,
    { scale: ScaleHandle; domain: readonly ScaleValue[] | undefined }
  >(
    Object.entries(context.options.get().resolved.scales).map(([name, scale]) => [
      name,
      { scale, domain: scale.options.get().explicit.domain },
    ]),
  )
  const toggledDomains = new Map<string, readonly ScaleValue[]>()
  let toggled = false
  const layer = svgElement('g', { 'data-layer': 'zoom', 'pointer-events': 'none' })
  const selection = svgElement('rect', {
    'data-zoom-selection': '',
    'pointer-events': 'none',
    fill: 'currentColor',
    'fill-opacity': 0.16,
    stroke: 'currentColor',
    'stroke-dasharray': '4 2',
    display: 'none',
  })
  const handles = new Map(
    (['w', 'e', 'n', 's'] as const).map((name) => [
      name,
      svgElement('rect', {
        'data-zoom-handle': name,
        fill: 'currentColor',
        display: 'none',
      }),
    ]),
  )
  layer.append(selection, ...handles.values())
  context.element.append(layer)
  let active:
    | {
        pointerId: number
        x: number
        y: number
        config: Readonly<ZoomOptions>
        mode: ZoomSelectionMode | undefined
      }
    | undefined
  let captured = false
  const originalTouchAction = context.element.style.getPropertyValue('touch-action')
  const originalTouchPriority = context.element.style.getPropertyPriority('touch-action')
  let appliedTouchAction: string | undefined

  function hideSelection() {
    selection.setAttribute('display', 'none')
    for (const node of handles.values()) node.setAttribute('display', 'none')
  }

  function finish(event?: PointerEvent) {
    if (!active || (event && event.pointerId !== active.pointerId)) return
    const gesture = active
    active = undefined
    hideSelection()
    if (captured && context.element.hasPointerCapture(gesture.pointerId)) {
      context.element.releasePointerCapture(gesture.pointerId)
    }
    captured = false
  }

  context.scope.run(() =>
    reactive.effect(() => {
      const config = handle.options.get().resolved
      const suspended = context.suspended.get()
      context.regions.get()
      const plugins = context.options.get().resolved.plugins
      if (active) finish()
      if (suspended || plugins.some(isPanHandle)) return
      appliedTouchAction = config.mode === 'x' ? 'pan-y' : config.mode === 'y' ? 'pan-x' : 'none'
      context.element.style.setProperty('touch-action', appliedTouchAction)
    }),
  )

  function zoomableScales(axes: ReadonlySet<'x' | 'y'>) {
    return Object.entries(context.scales).flatMap(([name, binding]) => {
      const orientation = context.direction(name)
      if (
        (orientation !== 'x' && orientation !== 'y') ||
        !axes.has(orientation) ||
        binding.scale.kind === 'band'
      ) {
        return []
      }
      return [{ name, binding, orientation }]
    })
  }

  function dragBounds(event: PointerEvent) {
    hideSelection()
    if (!active) return
    const config = handle.options.get().resolved
    if (config.mode !== active.config.mode || config.modifier !== active.config.modifier) {
      finish()
      return
    }
    const position = context.locate(event)
    if (!position) return
    const region = context.regions.get().plot
    const bounds = orderedBounds(
      active.x,
      active.y,
      clamp(position.svgX, region.x, region.x + region.width),
      clamp(position.svgY, region.y, region.y + region.height),
    )
    const dx = bounds.x1 - bounds.x0
    const dy = bounds.y1 - bounds.y0
    if (active.config.mode === 'auto') {
      active.mode =
        dx <= autoModeThreshold && dy <= autoModeThreshold
          ? undefined
          : dy <= autoModeThreshold
            ? 'x'
            : dx <= autoModeThreshold
              ? 'y'
              : 'xy'
    }
    const mode = active.mode
    if (!mode) {
      selection.setAttribute('display', 'none')
      return
    }
    // Ignore click jitter in each selected direction.
    if (
      (mode.includes('x') && bounds.x1 - bounds.x0 < 3) ||
      (mode.includes('y') && bounds.y1 - bounds.y0 < 3)
    ) {
      selection.setAttribute('display', 'none')
      return
    }
    const x = mode === 'y' ? region.x : bounds.x0
    const y = mode === 'x' ? region.y : bounds.y0
    const width = mode === 'y' ? region.width : bounds.x1 - bounds.x0
    const height = mode === 'x' ? region.height : bounds.y1 - bounds.y0
    for (const [name, value] of Object.entries({ x, y, width, height })) {
      selection.setAttribute(name, String(value))
    }
    selection.setAttribute('display', '')
    for (const [name, node] of handles) {
      const horizontal = name === 'w' || name === 'e'
      if ((mode === 'x' && !horizontal) || (mode === 'y' && horizontal) || mode === 'xy') continue
      const guideStart = horizontal
        ? clamp(active.y - autoModeThreshold, y, y + height)
        : clamp(active.x - autoModeThreshold, x, x + width)
      const guideEnd = horizontal
        ? clamp(active.y + autoModeThreshold, y, y + height)
        : clamp(active.x + autoModeThreshold, x, x + width)
      for (const [attribute, value] of Object.entries({
        x: horizontal ? (name === 'w' ? x : x + width) - 3 : guideStart,
        y: horizontal ? guideStart : (name === 'n' ? y : y + height) - 3,
        width: horizontal ? 6 : guideEnd - guideStart,
        height: horizontal ? guideEnd - guideStart : 6,
      })) {
        node.setAttribute(attribute, String(value))
      }
      node.setAttribute('display', '')
    }
    return bounds
  }

  context.on('pointerdown', (event) => {
    const config = handle.options.get().resolved
    const otherGesture = context.options
      .get()
      .resolved.plugins.some(
        (plugin) =>
          (isBrushHandle(plugin) || isPanHandle(plugin)) &&
          matchesModifierKey(event, plugin.options.get().resolved.modifier),
      )
    if (
      active ||
      event.defaultPrevented ||
      otherGesture ||
      !event.isPrimary ||
      event.button !== 0 ||
      !matchesModifierKey(event, config.modifier) ||
      (event.target instanceof Element && !!event.target.closest('[data-cross-section-handle]'))
    )
      return
    const position = context.locate(event)
    const axes = new Set<'x' | 'y'>()
    if (config.mode === 'auto' || config.mode.includes('x')) axes.add('x')
    if (config.mode === 'auto' || config.mode.includes('y')) axes.add('y')
    if (!position?.inside || !zoomableScales(axes).length) return
    active = {
      pointerId: event.pointerId,
      x: position.svgX,
      y: position.svgY,
      config,
      mode: config.mode === 'auto' ? undefined : config.mode,
    }
    if (event.isTrusted) {
      context.element.setPointerCapture(event.pointerId)
      captured = true
    }
    event.preventDefault()
  })
  context.on('pointermove', (event) => {
    if (!active || event.pointerId !== active.pointerId) return
    dragBounds(event)
    event.preventDefault()
  })
  context.on('pointerup', (event) => {
    if (!active || event.pointerId !== active.pointerId) return
    const bounds = dragBounds(event)
    const mode = active?.mode
    finish(event)
    if (!bounds || !mode) return
    const axes = new Set<'x' | 'y'>()
    if (mode.includes('x')) axes.add('x')
    if (mode.includes('y')) axes.add('y')
    const changes = zoomableScales(axes).flatMap(({ binding, orientation }) => {
      const first = binding.invert(orientation === 'x' ? bounds.x0 : bounds.y0)
      const second = binding.invert(orientation === 'x' ? bounds.x1 : bounds.y1)
      const domain = [Math.min(first, second), Math.max(first, second)]
      return isValidScaleDomain(binding.scale.kind, domain) ? [{ binding, domain }] : []
    })
    withSource('zoom', () => {
      for (const { binding, domain } of changes) binding.scale.update({ domain })
    })
    if (changes.length) toggled = false
    event.preventDefault()
  })
  context.on('pointercancel', finish)
  context.on('lostpointercapture', finish)

  context.on('wheel', (event) => {
    const config = handle.options.get().resolved
    if (config.wheel === 'none' || !matchesModifierKey(event, config.modifier)) return
    const position = context.locate(event)
    if (!position?.inside) return
    const activeAxes = new Set<'x' | 'y'>()
    const mode = config.mode === 'auto' ? 'xy' : config.mode
    if (mode.includes('x') && config.wheel.includes('x')) activeAxes.add('x')
    if (mode.includes('y') && config.wheel.includes('y')) activeAxes.add('y')
    if (activeAxes.size === 0) return
    finish()
    const factor = Math.exp(Math.max(-1, Math.min(1, event.deltaY * 0.002)))
    let changed = false
    for (const { binding, orientation } of zoomableScales(activeAxes)) {
      const anchor = binding.invert(orientation === 'x' ? position.svgX : position.svgY)
      const domain = binding.scale.domain.get()
      const zoomValue =
        binding.scale.kind === 'log'
          ? (value: number) =>
              Math.exp(Math.log(anchor) + (Math.log(value) - Math.log(anchor)) * factor)
          : (value: number) => anchor + (value - anchor) * factor
      const nextDomain = [zoomValue(Number(domain[0])), zoomValue(Number(domain[1]))] as const
      if (!isValidScaleDomain(binding.scale.kind, nextDomain)) continue
      withSource('wheel', () => binding.scale.update({ domain: nextDomain }))
      changed = true
    }
    if (changed) {
      event.preventDefault()
      toggled = false
    }
  })

  context.on('dblclick', (event) => {
    if (event.button !== 0) return
    const config = handle.options.get().resolved
    if (!context.locate(event)?.inside) return
    finish()
    const axes = new Set<'x' | 'y'>()
    const mode = config.mode === 'auto' ? 'xy' : config.mode
    if (mode.includes('x')) axes.add('x')
    if (mode.includes('y')) axes.add('y')
    for (const { name, binding } of zoomableScales(axes)) {
      if (config.reset === 'toggle' && toggled) {
        const previous = toggledDomains.get(name)
        if (previous) withSource('reset', () => binding.scale.update({ domain: previous }))
        toggledDomains.delete(name)
        continue
      }
      if (config.reset === 'toggle') toggledDomains.set(name, binding.scale.domain.get())
      const initial = initialDomains.get(name)
      if (config.reset === 'initial' && initial?.scale === binding.scale) {
        withSource('reset', () => binding.scale.update({ domain: initial.domain }))
      } else {
        withSource('reset', () => binding.scale.update({ domain: undefined }))
      }
    }
    toggled = config.reset === 'toggle' && !toggled
    event.preventDefault()
  })

  return {
    destroy() {
      finish()
      layer.remove()
      if (
        appliedTouchAction === undefined ||
        context.element.style.getPropertyValue('touch-action') !== appliedTouchAction
      )
        return
      if (originalTouchAction) {
        context.element.style.setProperty(
          'touch-action',
          originalTouchAction,
          originalTouchPriority,
        )
      } else {
        context.element.style.removeProperty('touch-action')
      }
    },
  }
}

export const zoomDefinition: PluginDefinition<ZoomHandle> = {
  name: 'zoom',
  is: isZoomHandle,
  validate(_handle, { coordinateSystem, plugins }) {
    if (plugins.filter((plugin) => isZoomHandle(plugin)).length > 1) {
      throw new Error('A plot can install at most one zoom plugin.')
    }
    if (coordinateSystem !== 'cartesian') {
      throw new Error('The zoom plugin currently supports Cartesian plots only.')
    }
  },
  install: installZoom,
}

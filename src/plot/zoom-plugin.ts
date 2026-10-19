import type { ScaleHandle, ScaleValue } from '../scales/scale.js'
import { matchesModifierKey } from '../Utils/modifierKey.js'
import type { PlotContext, PluginDefinition } from './plugin-definition.js'
import { isZoomHandle, type ZoomHandle } from './zoom.js'

const maxTime = 8.64e15

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

  context.on('wheel', (event) => {
    const config = handle.options.get().resolved
    if (config.wheel === 'none' || !matchesModifierKey(event, config.modifier)) return
    const position = context.locate(event)
    if (!position?.inside) return
    const activeAxes = new Set<'x' | 'y'>()
    if (config.mode.includes('x') && config.wheel.includes('x')) activeAxes.add('x')
    if (config.mode.includes('y') && config.wheel.includes('y')) activeAxes.add('y')
    if (activeAxes.size === 0) return
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
      if (
        nextDomain.some((value) => !Number.isFinite(value)) ||
        (binding.scale.kind === 'log' && nextDomain.some((value) => value <= 0)) ||
        (binding.scale.kind === 'time' && nextDomain.some((value) => Math.abs(value) > maxTime))
      ) {
        continue
      }
      binding.scale.update({ domain: nextDomain })
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
    const axes = new Set<'x' | 'y'>()
    if (config.mode.includes('x')) axes.add('x')
    if (config.mode.includes('y')) axes.add('y')
    for (const { name, binding } of zoomableScales(axes)) {
      if (config.reset === 'toggle' && toggled) {
        const previous = toggledDomains.get(name)
        if (previous) binding.scale.update({ domain: previous })
        toggledDomains.delete(name)
        continue
      }
      if (config.reset === 'toggle') toggledDomains.set(name, binding.scale.domain.get())
      const initial = initialDomains.get(name)
      if (config.reset === 'initial' && initial?.scale === binding.scale) {
        binding.scale.update({ domain: initial.domain })
      } else {
        binding.scale.update({ domain: undefined })
      }
    }
    toggled = config.reset === 'toggle' && !toggled
    event.preventDefault()
  })

  return {}
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

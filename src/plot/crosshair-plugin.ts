import { reactive } from '../core/runtime.js'
import type { PluginDefinition, PlotContext } from './plugin-definition.js'
import { isCrosshairHandle, type CrosshairHandle } from './crosshair.js'
import { svgElement } from './svg.js'

function installCrosshair(handle: CrosshairHandle, context: PlotContext) {
  const layer = svgElement('g', {
    'data-layer': 'crosshair',
    'pointer-events': 'none',
    'aria-hidden': 'true',
    display: 'none',
  })
  const vertical = svgElement('line', {
    'data-crosshair-axis': 'x',
    stroke: 'currentColor',
    'stroke-opacity': 0.65,
    'stroke-dasharray': '3 3',
    'vector-effect': 'non-scaling-stroke',
  })
  const horizontal = svgElement('line', {
    'data-crosshair-axis': 'y',
    stroke: 'currentColor',
    'stroke-opacity': 0.65,
    'stroke-dasharray': '3 3',
    'vector-effect': 'non-scaling-stroke',
  })
  layer.append(vertical, horizontal)
  context.element.append(layer)

  context.scope.run(() =>
    reactive.effect(() => {
      const mode = handle.options.get().resolved.mode
      const pointer = context.pointer.get()
      const region = context.regions.get().plot
      const visible = pointer.inside
      layer.setAttribute('transform', `translate(${region.x} ${region.y})`)
      layer.setAttribute('display', visible ? '' : 'none')

      vertical.setAttribute('x1', String(pointer.px))
      vertical.setAttribute('x2', String(pointer.px))
      vertical.setAttribute('y1', '0')
      vertical.setAttribute('y2', String(region.height))
      vertical.setAttribute('display', visible && mode.includes('x') ? '' : 'none')

      horizontal.setAttribute('x1', '0')
      horizontal.setAttribute('x2', String(region.width))
      horizontal.setAttribute('y1', String(pointer.py))
      horizontal.setAttribute('y2', String(pointer.py))
      horizontal.setAttribute('display', visible && mode.includes('y') ? '' : 'none')
    }),
  )

  return {
    destroy() {
      layer.remove()
    },
  }
}

export const crosshairDefinition: PluginDefinition<CrosshairHandle> = {
  name: 'crosshair',
  is: isCrosshairHandle,
  validate(_handle, context) {
    if (context.coordinateSystem !== 'cartesian') {
      throw new Error('The crosshair plugin currently supports Cartesian plots only.')
    }
    if (context.plugins.filter((plugin) => isCrosshairHandle(plugin)).length > 1) {
      throw new Error('A plot can install at most one crosshair plugin.')
    }
  },
  install: installCrosshair,
}

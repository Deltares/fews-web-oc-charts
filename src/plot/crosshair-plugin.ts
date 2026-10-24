import { reactive } from '../core/runtime.js'
import type { PluginDefinition, PlotContext } from './plugin-definition.js'
import {
  isCrosshairHandle,
  validateCrosshairUpdates,
  type CrosshairHandle,
  type CrosshairSnapOptions,
} from './crosshair.js'
import type { ScaleHandle } from '../scales/scale.js'
import type { Orientation } from './mark-definition.js'
import { nearestPoint } from './point-hit-testing.js'
import { svgElement } from './svg.js'

function validateSnapTarget(
  snap: CrosshairSnapOptions | undefined,
  marks: readonly object[],
  scales: Readonly<Record<string, ScaleHandle>>,
  direction: (name: string) => Orientation,
) {
  if (!snap) return
  if (!marks.includes(snap.mark)) {
    throw new Error('crosshair.snap.mark must be included in plot.marks.')
  }
  if (!Object.hasOwn(scales, snap.mark.x) || !Object.hasOwn(scales, snap.mark.y)) {
    throw new Error('crosshair.snap.mark references a missing scale.')
  }
  if (direction(snap.mark.x) !== 'x' || direction(snap.mark.y) !== 'y') {
    throw new Error('crosshair.snap.mark requires Cartesian x and y scales.')
  }
}

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

  const validateSnap = (snap: CrosshairSnapOptions | undefined) => {
    const current = context.options.get().resolved
    validateSnapTarget(snap, current.marks, current.scales, context.direction)
  }
  const stopValidation = validateCrosshairUpdates(handle, validateSnap)
  validateSnap(handle.options.get().resolved.snap)

  context.scope.run(() =>
    reactive.effect(() => {
      const mode = handle.options.get().resolved.mode
      const snap = handle.options.get().resolved.snap
      context.options.get()
      const pointer = context.pointer.get()
      const region = context.regions.get().plot
      const visible = pointer.inside
      const hit =
        visible && snap
          ? nearestPoint(
              snap.mark,
              context.scales,
              { x: pointer.px + region.x, y: pointer.py + region.y },
              snap.axis,
              region,
            )
          : undefined
      const x = hit ? hit.px - region.x : pointer.px
      const y = hit ? hit.py - region.y : pointer.py
      layer.setAttribute('transform', `translate(${region.x} ${region.y})`)
      layer.setAttribute('display', visible ? '' : 'none')

      vertical.setAttribute('x1', String(x))
      vertical.setAttribute('x2', String(x))
      vertical.setAttribute('y1', '0')
      vertical.setAttribute('y2', String(region.height))
      vertical.setAttribute(
        'display',
        visible && (!snap || hit) && mode.includes('x') ? '' : 'none',
      )

      horizontal.setAttribute('x1', '0')
      horizontal.setAttribute('x2', String(region.width))
      horizontal.setAttribute('y1', String(y))
      horizontal.setAttribute('y2', String(y))
      horizontal.setAttribute(
        'display',
        visible && (!snap || hit) && mode.includes('y') ? '' : 'none',
      )
    }),
  )

  return {
    destroy() {
      stopValidation()
      layer.remove()
    },
  }
}

export const crosshairDefinition: PluginDefinition<CrosshairHandle> = {
  name: 'crosshair',
  is: isCrosshairHandle,
  validate(handle, context) {
    if (context.coordinateSystem !== 'cartesian') {
      throw new Error('The crosshair plugin currently supports Cartesian plots only.')
    }
    if (context.plugins.filter((plugin) => isCrosshairHandle(plugin)).length > 1) {
      throw new Error('A plot can install at most one crosshair plugin.')
    }
    const snap = handle.options.get().resolved.snap
    validateSnapTarget(snap, context.marks, context.scales, context.direction)
  },
  install: installCrosshair,
}

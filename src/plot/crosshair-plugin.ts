import { reactive } from '../core/runtime.js'
import type { PluginDefinition, PlotContext } from './plugin-definition.js'
import {
  isCrosshairHandle,
  validateCrosshairUpdates,
  type CrosshairHandle,
  type CrosshairSnapOptions,
  type CrosshairOptions,
} from './crosshair.js'
import type { ScaleHandle } from '../scales/scale.js'
import type { Orientation } from './mark-definition.js'
import { displayInspectionValue } from './inspection.js'
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

function validateLabels(
  options: Readonly<CrosshairOptions>,
  context: {
    readonly scales: Readonly<Record<string, unknown>>
    direction(name: string): Orientation
  },
) {
  for (const axis of ['x', 'y'] as const) {
    const name = options.labels?.[axis]
    if (name && (!Object.hasOwn(context.scales, name) || context.direction(name) !== axis)) {
      throw new Error(`crosshair.labels.${axis} requires a ${axis}-direction scale.`)
    }
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
  const callouts = svgElement('g', { 'data-crosshair-labels': '' })
  layer.append(callouts)
  context.element.append(layer)

  const validateOptions = (options: Readonly<CrosshairOptions>) => {
    const current = context.options.get().resolved
    validateSnapTarget(options.snap, current.marks, current.scales, context.direction)
    validateLabels(options, context)
  }
  const stopValidation = validateCrosshairUpdates(handle, validateOptions)
  validateOptions(handle.options.get().resolved)

  context.scope.run(() =>
    reactive.effect(() => {
      const inspection = context.inspectCrosshair(handle)
      const { mode } = inspection.options
      const region = context.regions.get().plot
      const visible = inspection.visible
      const x = inspection.point.x - region.x
      const y = inspection.point.y - region.y
      layer.setAttribute('transform', `translate(${region.x} ${region.y})`)
      layer.setAttribute('display', visible ? '' : 'none')

      vertical.setAttribute('x1', String(x))
      vertical.setAttribute('x2', String(x))
      vertical.setAttribute('y1', '0')
      vertical.setAttribute('y2', String(region.height))
      vertical.setAttribute('display', visible && mode.includes('x') ? '' : 'none')

      horizontal.setAttribute('x1', '0')
      horizontal.setAttribute('x2', String(region.width))
      horizontal.setAttribute('y1', String(y))
      horizontal.setAttribute('y2', String(y))
      horizontal.setAttribute('display', visible && mode.includes('y') ? '' : 'none')
      callouts.replaceChildren()
      for (const coordinate of inspection.coordinates) {
        const group = svgElement('g', { 'data-crosshair-label': coordinate.axis })
        const background = svgElement('rect', {
          height: 22,
          rx: 3,
          fill: 'var(--fews-chart-tooltip-background, #fff)',
          stroke: 'currentColor',
          'stroke-opacity': 0.4,
        })
        const text = svgElement('text', {
          x: 6,
          y: 15,
          fill: 'var(--fews-chart-tooltip-color, #222)',
          'font-size': 12,
        })
        text.textContent = displayInspectionValue(
          coordinate.value,
          context,
          coordinate.scale,
          coordinate.digits,
        )
        group.append(background, text)
        callouts.append(group)
        const width = text.getComputedTextLength() + 12
        background.setAttribute('width', String(width))
        const size = context.size.get()
        const left = coordinate.axis === 'x' ? x - width / 2 : -width
        const top = coordinate.axis === 'x' ? region.height : y - 11
        const clampedX = Math.max(-region.x, Math.min(size.width - region.x - width, left))
        const clampedY = Math.max(-region.y, Math.min(size.height - region.y - 22, top))
        group.setAttribute('transform', `translate(${clampedX} ${clampedY})`)
      }
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
    validateLabels(handle.options.get().resolved, context)
  },
  install: installCrosshair,
}

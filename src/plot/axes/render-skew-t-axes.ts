import { tickStep } from 'd3'
import type { AxisHandle } from './axis.js'
import type { PlotLayout } from '../../layout/layout.js'
import type { ScaleBinding } from '../../scales/scale.js'
import type { ThemeTokens } from '../../theme/theme.js'
import { renderAxes, svgElement } from './render-axes.js'
import { invertSkewTPoint, projectSkewTPoint } from '../coordinates/skew-t-geometry.js'

export function renderSkewTAxes(
  axesLayer: SVGGElement,
  gridLayer: SVGGElement,
  axes: readonly AxisHandle[],
  bindings: Readonly<Record<string, ScaleBinding>>,
  regions: PlotLayout,
  theme: ThemeTokens,
  skew: number,
) {
  renderAxes(axesLayer, gridLayer, axes, bindings, regions, theme)
  gridLayer.replaceChildren()
  const temperature = Object.values(bindings).find((binding) => binding.scale.kind === 'linear')!
  const pressure = Object.values(bindings).find((binding) => binding.scale.kind === 'log')!
  const region = regions.plot
  const topPressure = pressure.invert(region.y)
  const bottomPressure = pressure.invert(region.y + region.height)
  for (const axis of axes) {
    const options = axis.options.get().resolved
    if (!options.grid) continue
    const binding = bindings[axis.scale]
    if (binding === pressure) {
      for (const value of pressure.ticks(options.tickCount)) {
        const y = pressure.project(value)
        gridLayer.append(
          svgElement('line', {
            'data-isobar': value,
            x1: region.x,
            x2: region.x + region.width,
            y1: y,
            y2: y,
          }),
        )
      }
    } else {
      const [low, high] = temperature.scale.domain.get().map(Number)
      const corners = [
        invertSkewTPoint(temperature, pressure, region.x, region.y, skew).temperature,
        invertSkewTPoint(temperature, pressure, region.x + region.width, region.y, skew)
          .temperature,
        low,
        high,
      ]
      const minimum = Math.min(...corners)
      const maximum = Math.max(...corners)
      const step = Math.max(
        tickStep(low, high, options.tickCount),
        tickStep(minimum, maximum, options.tickCount * 2),
      )
      if (!(step > 0)) throw new Error('Skew-T temperature domain must have a nonzero span.')
      const first = Math.ceil(minimum / step)
      const last = Math.floor(maximum / step)
      for (let index = first; index <= last; index += 1) {
        const value = index * step
        const top = projectSkewTPoint(temperature, pressure, value, topPressure, skew)
        const bottom = projectSkewTPoint(temperature, pressure, value, bottomPressure, skew)
        gridLayer.append(
          svgElement('line', {
            'data-isotherm': value,
            x1: bottom.x,
            x2: top.x,
            y1: bottom.y,
            y2: top.y,
          }),
        )
      }
    }
  }
}

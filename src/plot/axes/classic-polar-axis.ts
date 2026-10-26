import { axisBottom, path, range, scaleLinear, select, tickIncrement } from 'd3'
import type { AxisHandle } from './axis.js'
import type { ScaleBinding } from '../../scales/scale.js'
import type { PlotLayout } from '../../layout/layout.js'
import { niceDegreeSteps } from '../../Utils/niceDegreeSteps.js'
import { svgElement } from '../rendering/svg.js'

export function renderClassicPolarAxes(
  axesLayer: SVGGElement,
  gridLayer: SVGGElement,
  axes: readonly AxisHandle[],
  bindings: Readonly<Record<string, ScaleBinding>>,
  regions: PlotLayout,
) {
  const angularAxis = axes.find((axis) => axis.options.get().resolved.position === 'angular')
  const radialAxis = axes.find((axis) => axis.options.get().resolved.position === 'radial')
  if (!angularAxis || !radialAxis)
    throw new Error('Classic polar plots require angular and radial axes.')
  const angular = bindings[angularAxis.scale]
  const radial = bindings[radialAxis.scale]
  const config = angular.scale.options.get().resolved
  const sign = config.direction === 'anticlockwise' ? -1 : 1
  const intercept = Math.PI / 2 - (config.intercept ?? 0)
  const [rangeStart, rangeEnd] = angular.range.get()
  const [innerRadius, outerRadius] = radial.range.get()
  const degrees = (value: number) => (value * 180) / Math.PI
  const center = `translate(${regions.plot.x + regions.plot.width / 2},${regions.plot.y + regions.plot.height / 2})`
  const radialGrid = svgElement('g', {
    transform: center,
    fill: 'none',
    stroke: 'var(--fews-chart-grid, white)',
    'stroke-dasharray': '2',
  })
  const angularGrid = svgElement('g', {
    transform: center,
    stroke: 'var(--fews-chart-grid, white)',
    'stroke-dasharray': '2',
  })
  gridLayer.append(radialGrid, angularGrid)
  const radialGroup = svgElement('g', { transform: center })
  const radialScale = scaleLinear()
    .domain(radial.scale.domain.get().map(Number))
    .range([innerRadius, outerRadius])
  select(radialGroup).call(
    axisBottom(radialScale).ticks(radialAxis.options.get().resolved.tickCount),
  )
  radialGroup.setAttribute('font-size', '1em')
  radialGroup.setAttribute('font-family', 'inherit')
  radialGroup.querySelector('.domain')?.setAttribute('stroke', 'none')
  axesLayer.append(radialGroup)
  for (const value of radialScale.ticks(radialAxis.options.get().resolved.tickCount)) {
    const arc = path()
    arc.arc(0, 0, value, sign * rangeStart - intercept, sign * rangeEnd - intercept, sign === -1)
    radialGrid.append(svgElement('path', { d: arc.toString() }))
  }
  const domain = angular.scale.domain.get().map(Number)
  const step = niceDegreeSteps(
    tickIncrement(domain[0], domain[1], angularAxis.options.get().resolved.tickCount),
  )
  const ticks = range(
    Math.ceil(domain[0] / step) * step,
    Math.floor(domain[1] / step + 1) * step,
    step,
  )
  if (
    Math.cos(rangeStart) - Math.cos(rangeEnd) < 1e-6 &&
    Math.sin(rangeStart) - Math.sin(rangeEnd) < 1e-6
  ) {
    ticks.shift()
  }
  const angularGroup = svgElement('g', {
    transform: `${center} rotate(${-degrees(intercept)})`,
  })
  axesLayer.append(angularGroup)
  for (const value of ticks) {
    const angle = angular.project(value)
    angularGrid.append(
      svgElement('line', {
        x1: innerRadius,
        y1: 0,
        x2: outerRadius,
        y2: 0,
        transform: `rotate(${degrees(-intercept + sign * angle)})`,
      }),
    )
    const tick = svgElement('g', { transform: `rotate(${degrees(sign * angle)})` })
    const northClockwise = ((degrees(Math.PI / 2 - intercept + sign * angle) % 360) + 360) % 360
    const anchor =
      northClockwise > 0 && northClockwise < 180
        ? 'start'
        : northClockwise > 180 && northClockwise < 360
          ? 'end'
          : 'middle'
    tick.append(
      svgElement('line', {
        x1: outerRadius,
        y1: 0,
        x2: outerRadius + 6,
        y2: 0,
        stroke: 'currentColor',
      }),
    )
    const label = svgElement('text', {
      x: outerRadius + 15,
      y: 0,
      'text-anchor': anchor,
      'alignment-baseline': 'middle',
      fill: 'currentColor',
      transform: `rotate(${degrees(-sign * angle + intercept)},${outerRadius + 15},0)`,
    })
    label.textContent = angularAxis.options.get().resolved.format?.(value) ?? String(value)
    tick.append(label)
    angularGroup.append(tick)
  }
}

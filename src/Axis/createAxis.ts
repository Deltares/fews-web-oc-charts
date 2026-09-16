import * as d3 from 'd3'
import { AxisOrientation } from './axisOrientation.js'

export function createAxis<Domain extends d3.AxisDomain>(
  orientation: AxisOrientation,
  scale: d3.AxisScale<Domain>,
): d3.Axis<Domain> {
  switch (orientation) {
    case 'bottom':
      return d3.axisBottom(scale).ticks(5)
    case 'top':
      return d3.axisTop(scale).ticks(5)
    case 'right':
      return d3.axisRight(scale).ticks(5)
    case 'left':
    default:
      return d3.axisLeft(scale).ticks(5)
  }
}

import * as d3 from 'd3'
import { AxisOrientation } from './axisOrientation.js'

export function createAxis(orientation: AxisOrientation, scale) {
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

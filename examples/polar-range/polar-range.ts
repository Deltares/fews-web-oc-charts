import '@lib/scss/wb-charts.scss'
import '@shared/shared.css'
import './polar-range.css'

import '@shared/theme-button'

import * as d3 from 'd3'

import { type AxisIndex, ChartRange, PolarAxes } from '@lib'

function createAxes(containerId: string): PolarAxes {
  const container = document.getElementById(containerId)
  return new PolarAxes(container, null, null, {
    angular: {}, // Uses default [0, 360] domain
    radial: {},
  })
}

const exampleData = [
  {
    angular: [0, 45],
    radial: [0, 1],
    value: 0,
  },
  {
    angular: [30, 90],
    radial: [2, 4],
    value: 1,
  },
  {
    angular: [120, 210],
    radial: [5, 6],
    value: 3,
  },
]

// Create polar axes with a range chart.
const axesSolid = createAxes('chart-container-solid')
const axisIndexSolid: AxisIndex = {
  angular: { key: 'angular', axisIndex: 0 },
  radial: { key: 'radial', axisIndex: 0 },
}
const rangeSolid = new ChartRange(exampleData, {})
rangeSolid.addTo(axesSolid, axisIndexSolid, 'example-range', { fill: 'skyblue' })
axesSolid.redraw()

// Create polar axes with a colormapped range chart. The color map is specified
// as a function that accepts a value, for example created with d3 here.
const colormap = d3.scaleSequential(d3.interpolateRdYlGn).domain([0, 4])

const axesMapped = createAxes('chart-container-mapped')
const axisIndexMapped: AxisIndex = {
  angular: { key: 'angular', axisIndex: 0 },
  radial: { key: 'radial', axisIndex: 0 },
  color: { key: 'value' },
}
const rangeMapped = new ChartRange(exampleData, { color: { map: colormap } })
rangeMapped.addTo(axesMapped, axisIndexMapped, 'example-range', { fill: 'skyblue' })
axesMapped.redraw()

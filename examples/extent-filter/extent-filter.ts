import '@lib/scss/wb-charts.scss'
import '@shared/shared.css'
import './extent-filter.css'

import '@shared/theme-button'

import { AxisType, CartesianAxes, ChartLine } from '@lib'
import type { DataPoint } from '../../src/Data/types'
import { ExampleEvent, generateExampleTimeSeriesData } from '@shared'

function createAxes(containerId: string): CartesianAxes {
  // Create new axes.
  const container = document.getElementById(containerId)
  return new CartesianAxes(container, null, null, {
    x: [{ type: AxisType.time }],
    y: [{ type: AxisType.value }],
    automargin: true,
  })
}

// Generate simple scalar example data, then add a few outliers.
const startTime = new Date('2025-01-01T12:00Z')
const endTime = new Date('2025-01-05T12:00Z')
const exampleData = generateExampleTimeSeriesData([startTime, endTime], [-2, 4], 100)
exampleData[10].y = 99
exampleData[15].y = 105

const axisIndex = { x: { key: 'x', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } }

// Create chart without extent filter; the y-axis is autoscaled to the full
// extent of the data.
const axesWithout = createAxes('chart-container-without-filter')
// Create line.
const lineWithout = new ChartLine(exampleData, {})
lineWithout.addTo(axesWithout, axisIndex, 'example', {
  fill: 'none',
  stroke: 'skyblue',
  'stroke-width': '2',
})
axesWithout.redraw({ x: { autoScale: true }, y: { autoScale: true } })

// Create chart with extent filter; outliers (as defined by the extent filter
// function) are ignored when determining the autoscaled y-axis extent.
const extentFilter = (event: ExampleEvent<Date>) => event.y < 99
// The type of the extent filter function is inconvenient and needs a cast. See
// issue #142.
const extentFilterTyped = extentFilter as unknown as (event: DataPoint) => boolean

const axesWith = createAxes('chart-container-with-filter')
// Create line.
const lineWith = new ChartLine(exampleData, { y: { extentFilter: extentFilterTyped } })
lineWith.addTo(axesWith, axisIndex, 'example', {
  fill: 'none',
  stroke: 'skyblue',
  'stroke-width': '2',
})
axesWith.redraw({ x: { autoScale: true }, y: { autoScale: true } })

import '@lib/scss/wb-charts.scss'
import '@shared/shared.css'
import './legend.css'

import '@shared/theme-button'

import { AxisIndex, AxisType, CartesianAxes, ChartArea, ChartLine, ChartMarker, Legend } from '@lib'
import { generateExampleData } from '@shared'

// Create new axes.
const container = document.getElementById('chart-container')
const axes = new CartesianAxes(container, null, null, {
  x: [{ type: AxisType.time }],
  y: [{ type: AxisType.value, domain: [-3, 5] }],
  automargin: true,
})

// Generate simple scalar example data.
const startTime = new Date('2025-01-01T12:00Z')
const endTime = new Date('2025-01-02T12:00Z')
const exampleData = generateExampleData([startTime, endTime], [-2, 4], 100)
const exampleDataArea = exampleData.map(({ x, y }) => ({
  x,
  y: [y - 1, y + 1],
}))

const axisIndex: AxisIndex = {
  x: { key: 'x', axisIndex: 0 },
  y: { key: 'y', axisIndex: 0 },
}

// Create area.
const area = new ChartArea(exampleDataArea, {})
area.addTo(axes, axisIndex, 'example-area', {
  fill: 'skyblue',
  opacity: 0.5,
})
// Create solid and dotted line.
const solidLine = new ChartLine(exampleData, {})
solidLine.addTo(axes, axisIndex, 'example-line-solid', {
  fill: 'none',
  stroke: 'blue',
  'stroke-width': '2',
})
const dottedLine = new ChartLine(exampleData, {})
dottedLine.addTo(axes, axisIndex, 'example-line-dotted', {
  fill: 'none',
  stroke: 'red',
  'stroke-width': '4',
  'stroke-dasharray': '10,10',
})
// Create markers.
const markers = new ChartMarker(exampleData, { symbol: { size: 50, skip: 5 } })
markers.addTo(axes, axisIndex, 'example-markers', {
  fill: 'white',
  stroke: 'black',
  'stroke-width': '2',
})

axes.redraw({ x: { autoScale: true }, y: { autoScale: true } })

// Add legend; it will be placed in the specified container element.
const legendContainer = document.getElementById('legend-container')
const legendLabels = [
  {
    selector: 'example-line-solid',
    label: 'Example solid line',
  },
  {
    selector: 'example-line-dotted',
    label: 'Example dotted line',
  },
  {
    selector: 'example-markers',
    label: 'Example markers',
  },
  {
    selector: 'example-area',
    label: 'Example area',
  },
]
const legend = new Legend(legendLabels, legendContainer)
axes.accept(legend)

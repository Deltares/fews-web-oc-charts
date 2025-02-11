import '@lib/scss/wb-charts.scss'
import '@shared/shared.css'
import './marker.css'

import '@shared/theme-button'

import { AxisType, CartesianAxes, ChartMarker } from '@lib'
import { generateExampleData } from '@shared'

function createAxes(containerId: string): CartesianAxes {
  const container = document.getElementById(containerId)
  return new CartesianAxes(container, null, null, {
    x: [{ type: AxisType.time }],
    y: [{ type: AxisType.value, domain: [-3, 5] }],
    automargin: true,
  })
}

// Generate simple scalar example data.
const startTime = new Date('2025-01-01T12:00Z')
const endTime = new Date('2025-01-02T12:00Z')
const exampleData = generateExampleData([startTime, endTime], [-2, 4], 100)

// Plot data with markers on every data point.
const axes = createAxes('chart-container')
const markers = new ChartMarker(exampleData, { symbol: { size: 50 } })
markers.addTo(axes, { x: { key: 'x', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } }, 'example', {
  fill: 'black',
  stroke: 'red',
  'stroke-width': '1',
})
axes.redraw({ x: { autoScale: true }, y: { autoScale: true } })

// Plot data with markers every 5th data point.
const axesSkip = createAxes('chart-container-skip')
const symbolOptions = { size: 100, skip: 5 }
const markersSkip = new ChartMarker(exampleData, { symbol: symbolOptions })
markersSkip.addTo(
  axesSkip,
  { x: { key: 'x', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } },
  'example',
  {
    fill: 'blue',
    stroke: 'none',
  },
)
axesSkip.redraw({ x: { autoScale: true }, y: { autoScale: true } })

import '@lib/scss/wb-charts.scss'
import '@shared/shared.css'
import './polar-line-marker.css'

import '@shared/theme-button'

import { type AxisIndex, ChartLine, ChartMarker, PolarAxes } from '@lib'
import { generateExamplePolarData } from '@shared'

// Create example data: a linearly growing radius as a function of the angular
// coordinate.
const exampleData = generateExamplePolarData([0, 10], [0, 2], 100)

// Create polar axes with a line with markers.
const container = document.getElementById('chart-container')
const axes = new PolarAxes(container, null, null, {
  angular: {
    // The default domain is [0, 360], but can be set otherwise.
    domain: [0, 10],
  },
  radial: {},
})
const axisIndex: AxisIndex = {
  angular: { key: 'angular', axisIndex: 0 },
  radial: { key: 'radial', axisIndex: 0 },
}
const line = new ChartLine(exampleData, {})
const marker = new ChartMarker(exampleData, { symbol: { size: 20 } })
line.addTo(axes, axisIndex, 'example-line', {
  fill: 'none',
  stroke: 'skyblue',
  'stroke-width': '3',
})
marker.addTo(axes, axisIndex, 'example-marker', { fill: 'white', stroke: 'black' })
axes.redraw()

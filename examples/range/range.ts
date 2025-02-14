import '@lib/scss/wb-charts.scss'
import '@shared/shared.css'
import './range.css'

import '@shared/theme-button'

import { AxisIndex, AxisType, CartesianAxes, ChartRange } from '@lib'

// Create example data.
// The color of the range is currently always taken from a data object's
// `color` member for a ChartRange on Cartesian axes; this is not configurable
// and mapped colors do not work. See issue #150.
const exampleData = [
  {
    x: [1, 2],
    y: [2, 3],
    color: 'red',
  },
  {
    x: [0.5, 2.5],
    y: [2.5, 5],
    color: 'blue',
  },
  {
    x: [5, 10],
    y: [10, 12],
    color: 'green',
  },
]

// Create new axes with range chart.
const container = document.getElementById('chart-container')
const axes = new CartesianAxes(container, null, null, {
  x: [{ type: AxisType.value }],
  y: [{ type: AxisType.value }],
  automargin: true,
})
const range = new ChartRange(exampleData, {})
const axisIndex: AxisIndex = {
  x: { key: 'x', axisIndex: 0 },
  y: { key: 'y', axisIndex: 0 },
  color: { key: 'value' },
}
range.addTo(axes, axisIndex, 'example-range', {})
axes.redraw({ x: { autoScale: true }, y: { autoScale: true } })

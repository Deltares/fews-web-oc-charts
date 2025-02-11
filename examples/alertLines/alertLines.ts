import '@lib/scss/wb-charts.scss'
import '@shared/shared.css'
import './alertLines.css'

import { AlertLines, AxisType, CartesianAxes, ChartLine } from '@lib'
import { addListenerById, generateExampleData } from '@shared'

addListenerById('theme-button', 'click', () => document.documentElement.classList.toggle('dark'))

// Create new axes.
const container = document.getElementById('chart-container')
const axes = new CartesianAxes(container, null, null, {
  x: [{ type: AxisType.time }],
  y: [{ type: AxisType.value }],
  automargin: true,
})

// Generate simple scalar example data.
const startTime = new Date('2025-01-01T12:00Z')
const endTime = new Date('2025-01-02T12:00Z')
const exampleData = generateExampleData([startTime, endTime], [-2, 4], 100)

// Create line.
const line = new ChartLine(exampleData, {})
line.addTo(axes, { x: { key: 'x', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } }, 'example', {
  fill: 'none',
  stroke: 'skyblue',
  'stroke-width': '2',
})
axes.redraw({ x: { autoScale: true }, y: { autoScale: true } })

// Create example alert lines.
const alertLines = new AlertLines([
  // Simple alert line that spans the exact date range.
  {
    x1: startTime,
    x2: endTime,
    value: 2,
    description: 'Alert line inside range with full time range',
    yAxisIndex: 0,
    color: 'red',
  },
  // Alert line that spans a wider date range than the axis limits; the alert
  // label will still be drawn within axis limits.
  {
    x1: new Date('2024-12-31T12:00Z'),
    x2: new Date('2025-01-03T12:00Z'),
    value: 1,
    description: 'Alert line inside range with extended time range',
    yAxisIndex: 0,
    color: 'orange',
  },
  // Alert line that spans a narrower date range than the axis limits.
  {
    x1: new Date('2025-01-01T18:00Z'),
    x2: new Date('2025-01-02T06:00Z'),
    value: 0,
    description: 'Alert line inside range with limited time range',
    yAxisIndex: 0,
    color: 'yellow',
  },
  // Alert line outside the y-range; the y-axis limits will not be automatically
  // scaled to include the alert.
  {
    x1: startTime,
    x2: endTime,
    value: 5,
    description: 'Alert line outside range',
    yAxisIndex: 0,
    color: 'green',
  },
])
axes.accept(alertLines)

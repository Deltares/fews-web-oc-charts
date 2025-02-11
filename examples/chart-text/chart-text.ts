import '@lib/scss/wb-charts.scss'
import '@shared/shared.css'
import './chart-text.css'

import '@shared/theme-button'

import { type AxisIndex, AxisType, CartesianAxes, ChartLine, ChartText } from '@lib'
import { generateExampleData } from '@shared'

const container = document.getElementById('chart-container')
const axes = new CartesianAxes(container, null, null, {
  x: [{ type: AxisType.time }],
  y: [{ type: AxisType.value, domain: [-1.5, 1.5] }],
  automargin: true,
})

// Generate simple scalar example data.
const startTime = new Date('2025-01-01T12:00Z')
const endTime = new Date('2025-01-02T12:00Z')
const exampleData = generateExampleData([startTime, endTime], [-1, 1], 100)

// Add a "label" field to every 5th member of the example data.
const exampleDataWithLabels = exampleData.map((entry, index) => ({
  ...entry,
  label: index % 5 === 0 ? entry.y.toFixed(2) : null,
}))

const axisIndex: AxisIndex = {
  x: { key: 'x', axisIndex: 0 },
  y: { key: 'y', axisIndex: 0 },
}

// Create line with example data.
const line = new ChartLine(exampleData, {})
line.addTo(axes, axisIndex, 'line', {
  fill: 'none',
  stroke: 'skyblue',
  'stroke-width': '2',
})

// Add text along the line.
const textAlongLine = new ChartText(exampleDataWithLabels, {
  text: {
    attributes: {
      // Align the text in the middle of the line with <text> CSS properties.
      'text-anchor': 'middle',
      'dominant-baseline': 'middle',
    },
  },
})
// Specifying x, y, and a value key will draw text (specified as the value key)
// along the line.
const axisIndexWithLabels: AxisIndex = {
  ...axisIndex,
  value: { key: 'label' },
}
textAlongLine.addTo(axes, axisIndexWithLabels, 'text-along-line', {})

// Add text along the bottom of the chart.
const textAlongBottom = new ChartText(exampleDataWithLabels, {
  text: {
    position: 'bottom',
    attributes: {
      // Position the text relative to the bottom of the chart with <text> CSS
      // properties.
      dy: '-0.5em',
      'text-anchor': 'middle',
      'dominant-baseline': 'bottom',
    },
  },
})
const axisIndexWithoutY: AxisIndex = {
  x: { key: 'x', axisIndex: 0 },
  value: { key: 'label' },
}
textAlongBottom.addTo(axes, axisIndexWithoutY, 'text-bottom', {})

// Add text along the top of the chart.
const textAlongTop = new ChartText(exampleDataWithLabels, {
  text: {
    // Text can be rotated with the angle key, specified in degrees clockwise
    // rotation.
    angle: 45,
    // Omitting the position key will default to the top of the chart, if used
    // with an axis index without "y".
    attributes: {
      // Position the text relative to the top of the chart with <text> CSS
      // properties.
      dy: '1em',
      'text-anchor': 'middle',
      'dominant-baseline': 'hanging',
    },
  },
})
textAlongTop.addTo(axes, axisIndexWithoutY, 'text-top', {})

axes.redraw({ x: { autoScale: true } })

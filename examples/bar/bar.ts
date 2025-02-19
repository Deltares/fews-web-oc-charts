import '@lib/scss/wb-charts.scss'
import '@shared/shared.css'
import './bar.css'

import '@shared/theme-button'

import * as d3 from 'd3'

import { AxisType, CartesianAxes, ChartBar, ChartLine, TooltipAnchor } from '@lib'
import { generateExampleTimeSeriesData } from '@shared'

function createAxes(
  containerId: string,
  xAxisType: AxisType,
  domain?: [number, number],
): CartesianAxes {
  const container = document.getElementById(containerId)
  return new CartesianAxes(container, null, null, {
    x: [{ type: xAxisType }],
    y: [{ type: AxisType.value, domain }],
    automargin: true,
  })
}

// Generate simple scalar example data.
const startTime = new Date('2025-01-01T12:00Z')
const endTime = new Date('2025-01-02T12:00Z')
const exampleData = generateExampleTimeSeriesData([startTime, endTime], [-2, 4], 100)

const axisIndex = { x: { key: 'x', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } }

// Create simple bar chart.
// Note: `ChartBar` does not espect the `curve` option; it always behaves as if
//       `curve` is set to `stepAfter`.
const axesSimple = createAxes('chart-container-simple', AxisType.time)
const barSimple = new ChartBar(exampleData, {})
const referenceLine = new ChartLine(exampleData, {})
barSimple.addTo(axesSimple, axisIndex, 'example-bar', {
  fill: 'skyblue',
  stroke: 'white',
})
referenceLine.addTo(axesSimple, axisIndex, 'example-line', { fill: 'none', stroke: 'black ' })
axesSimple.redraw({ x: { autoScale: true }, y: { autoScale: true } })

// Create color mapped bar chart.
const axesColormapped = createAxes('chart-container-colormapped', AxisType.time)

// The color map is specified as a function that accepts a value, for example
// created with d3 here.
const colormap = d3.scaleSequential(d3.interpolateRdYlGn).domain([-2, 4])
const barColormapped = new ChartBar(exampleData, { color: { map: colormap } })

const axisIndexColormapped = {
  x: { key: 'x', axisIndex: 0 },
  y: { key: 'y', axisIndex: 0 },
  color: { key: 'y' },
}
barColormapped.addTo(axesColormapped, axisIndexColormapped, 'example', {
  // You can still specify the stroke color for a colormapped bar chart.
  stroke: 'black',
})
axesColormapped.redraw({ x: { autoScale: true }, y: { autoScale: true } })

// Create grouped bar chart based on categorical data.
interface ExampleCategoricalEvent {
  date: string
  model: string
  value: number
}
const exampleCategoricalData = [
  {
    date: '2025-01-01',
    model: 'model A',
    value: 1,
  },
  {
    date: '2025-01-01',
    model: 'model B',
    value: 2,
  },
  {
    date: '2025-01-01',
    model: 'model C',
    value: 3,
  },
  {
    date: '2025-01-02',
    model: 'model A',
    value: 6,
  },
  {
    date: '2025-01-02',
    model: 'model B',
    value: 5,
  },
  {
    date: '2025-01-02',
    model: 'model C',
    value: 4,
  },
]

const colorForModel = (model: string): string => {
  switch (model) {
    case 'model A':
      return 'red'
    case 'model B':
      return 'blue'
    case 'model C':
      return 'green'
    default:
      return 'grey'
  }
}

const axesGrouped = createAxes('chart-container-grouped', AxisType.band, [0, 8])
const barGrouped = new ChartBar(exampleCategoricalData, {
  // Padding can be specified independently for the "main" grouping with `x`,
  // and the sub-grouping with `x1`.
  x: {
    paddingOuter: 0.2,
    paddingInner: 0.1,
  },
  x1: {
    paddingOuter: 0,
    paddingInner: 0.05,
  },
  // If the `text` option is specified, a string is created with the `formatter`
  // function (which is required) and shown above each bar.
  text: {
    formatter: (event: ExampleCategoricalEvent) => `${event.model}: ${event.value}`,
    attributes: { fill: 'black', 'text-anchor': 'middle' },
    dy: -5,
  },
  // If the `tooltip` option is specified, a tooltip is shown on hover above
  // each bar.
  // Note: the anchor must be `TooltipAnchor.Bottom`, other options have not
  //       been implemented.
  tooltip: { anchor: TooltipAnchor.Bottom },
  color: { map: colorForModel },
})

const axisIndexGrouped = {
  // The "main" grouping is done with based on the key specified for `x`.
  x: { key: 'date', axisIndex: 0 },
  // The sub-grouping for each main grouping is based on the key specified for
  // `x1`.
  x1: { key: 'model' },
  y: { key: 'value', axisIndex: 0 },
  color: { key: 'model' },
}
barGrouped.addTo(axesGrouped, axisIndexGrouped, 'example-grouped', {
  fill: 'skyblue',
  stroke: 'none',
})
axesGrouped.redraw({})

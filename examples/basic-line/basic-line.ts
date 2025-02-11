import '@lib/scss/wb-charts.scss'
import '@shared/shared.css'
import './basic-line.css'

import '@shared/theme-button'

import { SvgPropertiesHyphen } from 'csstype'

import { AxisIndex, AxisType, CartesianAxes, CartesianAxesOptions, ChartLine } from '@lib'

// Basic example with scalar values.
const exampleData = [
  { valueX: 0, valueY: 0 },
  { valueX: 1, valueY: 1 },
  { valueX: 2, valueY: 4 },
  { valueX: 3, valueY: 9 },
  { valueX: 4, valueY: 16 },
]

// Create new axes.
const axesOption: CartesianAxesOptions = {
  x: [
    {
      type: AxisType.value,
      label: 'x',
      showGrid: true,
    },
  ],
  y: [
    {
      type: AxisType.value,
      label: 'y',
      unit: '[m]',
      showGrid: true,
      domain: [0, 20],
    },
  ],
  automargin: true,
}
const container = document.getElementById('chart-container')
const axes = new CartesianAxes(container, null, null, axesOption)

// Create new chart line instance.
const line = new ChartLine(exampleData, {})
// The axis index allows you to specify which properties of each data "event"
// object should be used for the x and y axis. In this case, we use the "x"
// property for x and the "y" property for y.
const axisIndex: AxisIndex = {
  x: { key: 'valueX', axisIndex: 0 },
  y: { key: 'valueY', axisIndex: 0 },
}
// The chart ID is a unique identifier for members of an axes.
const chartId = 'example'
// The line style can be specified as CSS properties valid for <path> SVG
// elements.
const chartStyle: SvgPropertiesHyphen = {
  fill: 'none',
  stroke: 'skyblue',
  'stroke-width': '2',
}
line.addTo(axes, axisIndex, chartId, chartStyle)

// Redraw the axes to display the line, using autoscale for x and y to rescale
// the axis extents.
axes.redraw({ x: { autoScale: true }, y: { autoScale: true } })

// Basic example with scalar values and time values on the x-axis.
const exampleDataTime = [
  { date: new Date('2025-01-01T12:00Z'), value: 0 },
  { date: new Date('2025-01-02T12:00Z'), value: 1 },
  { date: new Date('2025-01-03T12:00Z'), value: 0 },
  { date: new Date('2025-01-04T12:00Z'), value: 2 },
  { date: new Date('2025-01-05T12:00Z'), value: 1 },
]

// Create new axes with time values on the x-axis.
const axesOptionsTime: CartesianAxesOptions = {
  x: [
    {
      type: AxisType.time,
      label: 'Date',
      labelAngle: 45,
    },
  ],
  y: [
    {
      type: AxisType.value,
      // You can specify a default domain that will be used for values within
      // this domain, but will be extended if the data values exceed the domain,
      // as demonstrated here.
      defaultDomain: [0, 1.5],
    },
  ],
  automargin: true,
}
const containerTime = document.getElementById('chart-container-time')
const axesTime = new CartesianAxes(containerTime, null, null, axesOptionsTime)

const lineTime = new ChartLine(exampleDataTime, {})
lineTime.addTo(
  axesTime,
  {
    x: { key: 'date', axisIndex: 0 },
    y: { key: 'value', axisIndex: 0 },
  },
  'example-time',
  {
    fill: 'none',
    stroke: 'red',
    'stroke-width': '4',
    'stroke-dasharray': '5,5',
  },
)

axesTime.redraw({ x: { autoScale: true }, y: { autoScale: true } })

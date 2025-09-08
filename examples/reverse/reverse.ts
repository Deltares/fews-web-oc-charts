import '@lib/scss/wb-charts.scss'
import '@shared/shared.css'
import './reverse.css'

import '@shared/theme-button'

import { SvgPropertiesHyphen } from 'csstype'

import { AxisIndex, AxisType, CartesianAxes, CartesianAxesOptions, ChartLine } from '@lib'

const exampleData = [
  { valueX: 0, valueY: 0 },
  { valueX: 1, valueY: 1 },
  { valueX: 2, valueY: 4 },
  { valueX: 3, valueY: 9 },
  { valueX: 4, valueY: 16 },
]

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
      reverse: true,
    },
  ],
  automargin: true,
}
const container = document.getElementById('chart-container')
const axes = new CartesianAxes(container, null, null, axesOption)

const line = new ChartLine(exampleData, {})
const axisIndex: AxisIndex = {
  x: { key: 'valueX', axisIndex: 0 },
  y: { key: 'valueY', axisIndex: 0 },
}
const chartId = 'example'
const chartStyle: SvgPropertiesHyphen = {
  fill: 'none',
  stroke: 'skyblue',
  'stroke-width': '2',
}
line.addTo(axes, axisIndex, chartId, chartStyle)

axes.redraw({ x: { autoScale: true }, y: { autoScale: true } })

const exampleDataTime = [
  { date: new Date('2025-01-01T12:00Z'), value: -1 },
  { date: new Date('2025-01-02T12:00Z'), value: 1 },
  { date: new Date('2025-01-03T12:00Z'), value: 0 },
  { date: new Date('2025-01-04T12:00Z'), value: 2 },
  { date: new Date('2025-01-05T12:00Z'), value: 1 },
]

const axesOptionsTime: CartesianAxesOptions = {
  x: [
    {
      type: AxisType.time,
      label: 'Date',
      labelAngle: 45,
      position: 'atzero'
    },
  ],
  y: [
    {
      type: AxisType.value,
      defaultDomain: [-1.5, 1.5],
      showGrid: true,
      reverse: true,
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

import '@lib/scss/wb-charts.scss'
import '@shared/shared.css'
import './panning.css'

import '@shared/theme-button'

import { SvgPropertiesHyphen } from 'csstype'

import {
  AxisIndex,
  AxisType,
  CartesianAxes,
  CartesianAxesOptions,
  ChartLine,
  ModifierKey,
  PanHandler,
  PanningDirection,
  ZoomHandler,
} from '@lib'

// Chart with numeric data on both x- and y-axis.
const exampleData = [
  { valueX: 0, valueY: 0 },
  { valueX: 1, valueY: 1 },
  { valueX: 2, valueY: 4 },
  { valueX: 3, valueY: 9 },
  { valueX: 4, valueY: 16 },
]
const axesOption: CartesianAxesOptions = {
  x: [{ type: AxisType.value }],
  y: [{ type: AxisType.value }],
  automargin: true,
}
const container = document.getElementById('chart-container')
const axes = new CartesianAxes(container, null, null, axesOption)

const panHandler = new PanHandler({ changeHoveringCursor: false })
axes.accept(panHandler)

// Panning and zooming can interact.
const zoomHandler = new ZoomHandler()
axes.accept(zoomHandler)

const line = new ChartLine(exampleData, {})
const axisIndex: AxisIndex = {
  x: { key: 'valueX', axisIndex: 0 },
  y: { key: 'valueY', axisIndex: 0 },
}
const chartStyle: SvgPropertiesHyphen = {
  fill: 'none',
  stroke: 'skyblue',
  'stroke-width': '2',
}
line.addTo(axes, axisIndex, 'example', chartStyle)
axes.redraw({ x: { autoScale: true }, y: { autoScale: true } })

// Chart with dates on the x-axis and numeric data on the y-axis.
const exampleDataTime = [
  { date: new Date('2025-01-01T12:00Z'), value: 0 },
  { date: new Date('2025-01-02T12:00Z'), value: 1 },
  { date: new Date('2025-01-03T12:00Z'), value: 0 },
  { date: new Date('2025-01-04T12:00Z'), value: 2 },
  { date: new Date('2025-01-05T12:00Z'), value: 1 },
]

// Create new axes with time values on the x-axis.
const axesOptionsTime: CartesianAxesOptions = {
  x: [{ type: AxisType.time, labelAngle: 45 }],
  y: [{ type: AxisType.value }],
  automargin: true,
}
const containerTime = document.getElementById('chart-container-time')
const axesTime = new CartesianAxes(containerTime, null, null, axesOptionsTime)

// The mouse button to pan with and the possible panning directions can be
// configured.
const panHandlerTime = new PanHandler({
  mouseButton: 1,
  direction: PanningDirection.X,
  startEnabled: false,
})
const panHandlerTimeKey = new PanHandler({
  mouseButton: 0,
  modifierKey: ModifierKey.Shift,
  direction: PanningDirection.X,
})
axesTime.accept(panHandlerTimeKey)
axesTime.accept(panHandlerTime)

const zoomHandlerTime = new ZoomHandler()
axesTime.accept(zoomHandlerTime)

document.getElementById('enable-button').addEventListener('click', () => panHandlerTime.enable())
document.getElementById('disable-button').addEventListener('click', () => panHandlerTime.disable())

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

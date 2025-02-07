import '@lib/scss/wb-charts.scss'
import '@shared/shared.css'
import './wheel-zoom.css'

import {
  AxisPosition,
  AxisType,
  CartesianAxes,
  CartesianAxesOptions,
  ChartLine,
  MouseOver,
  WheelMode,
  ZoomHandler,
} from '@lib'
import { addListenerByClassName } from '@shared'

const containerZoomXY = document.getElementById('chart-container-zoom-xy')
const containerZoomX = document.getElementById('chart-container-zoom-x')
const containerZoomY = document.getElementById('chart-container-zoom-y')
const containerNoZoom = document.getElementById('chart-container-no-zoom')

const axisOptions: CartesianAxesOptions = {
  x: [
    {
      type: AxisType.time,
      position: AxisPosition.Bottom,
      showGrid: true,
    },
    {
      type: AxisType.time,
      position: AxisPosition.Top,
      showGrid: true,
      locale: 'es-MX',
      timeZone: 'Mexico/General',
    },
  ],
  y: [
    {
      label: 'Sine',
      position: AxisPosition.Left,
      unit: '-',
      showGrid: true,
      domain: [-1.1, 1.1],
    },
  ],
  margin: {
    left: 50,
    right: 50,
  },
}
const axisZoomXY = new CartesianAxes(containerZoomXY, null, null, axisOptions)
const axisZoomX = new CartesianAxes(containerZoomX, null, null, axisOptions)
const axisZoomY = new CartesianAxes(containerZoomY, null, null, axisOptions)
const axisNoZoom = new CartesianAxes(containerNoZoom, null, null, axisOptions)

// Generate time series with a sine function at every day; generate dates
// in UTC.
const startDate = new Date(2021, 8, 15)
const numDays = 1
const frequency = 3
const step = 0.01 // in days

const data = []
const startTime = startDate.getTime()
const numSteps = numDays / step
for (let i = 0; i < numSteps; i++) {
  const curTime = startTime + i * step * 24 * 60 * 60 * 1000
  data.push({
    x: new Date(curTime),
    y: Math.sin(2 * Math.PI * frequency * i * step),
  })
}
const plot1ZoomXY = new ChartLine(data, {})
const plot2ZoomXY = new ChartLine(data, {})

const plot1ZoomX = new ChartLine(data, {})
const plot2ZoomX = new ChartLine(data, {})

const plot1ZoomY = new ChartLine(data, {})
const plot2ZoomY = new ChartLine(data, {})

const plot1NoZoom = new ChartLine(data, {})
const plot2NoZoom = new ChartLine(data, {})

const style1 = {
  fill: 'none',
  stroke: 'skyblue',
}
const style2 = {
  fill: 'none',
  stroke: 'red',
  'stroke-dasharray': '5,5',
}

plot1ZoomXY.addTo(
  axisZoomXY,
  { x: { key: 'x', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } },
  'local',
  style1
)
plot2ZoomXY.addTo(
  axisZoomXY,
  { x: { key: 'x', axisIndex: 1 }, y: { key: 'y', axisIndex: 0 } },
  'mexico',
  style2
)

plot1ZoomX.addTo(
  axisZoomX,
  { x: { key: 'x', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } },
  'local',
  style1
)
plot2ZoomX.addTo(
  axisZoomX,
  { x: { key: 'x', axisIndex: 1 }, y: { key: 'y', axisIndex: 0 } },
  'mexico',
  style2
)

plot1ZoomY.addTo(
  axisZoomY,
  { x: { key: 'x', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } },
  'local',
  style1
)
plot2ZoomY.addTo(
  axisZoomY,
  { x: { key: 'x', axisIndex: 1 }, y: { key: 'y', axisIndex: 0 } },
  'mexico',
  style2
)

plot1NoZoom.addTo(
  axisNoZoom,
  { x: { key: 'x', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } },
  'local',
  style1
)
plot2NoZoom.addTo(
  axisNoZoom,
  { x: { key: 'x', axisIndex: 1 }, y: { key: 'y', axisIndex: 0 } },
  'mexico',
  style2
)

const mouseOver = new MouseOver(['local', 'mexico'])

const zoomHandlerXY = new ZoomHandler(WheelMode.XY)
axisZoomXY.redraw({ x: { autoScale: true }, y: { autoScale: true } })
axisZoomXY.accept(zoomHandlerXY)
axisZoomXY.accept(mouseOver)

const zoomHandlerX = new ZoomHandler(WheelMode.X)
axisZoomX.redraw({ x: { autoScale: true }, y: { autoScale: true } })
axisZoomX.accept(zoomHandlerX)
axisZoomX.accept(mouseOver)

const zoomHandlerY = new ZoomHandler(WheelMode.Y)
axisZoomY.redraw({ x: { autoScale: true }, y: { autoScale: true } })
axisZoomY.accept(zoomHandlerY)
axisZoomY.accept(mouseOver)

const zoomHandlerNoWheel = new ZoomHandler()
axisNoZoom.redraw({ x: { autoScale: true }, y: { autoScale: true } })
axisNoZoom.accept(zoomHandlerNoWheel)
axisNoZoom.accept(mouseOver)

addListenerByClassName('theme-button', 'click', () =>
  document.documentElement.classList.toggle('dark')
)

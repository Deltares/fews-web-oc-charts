import '../../src/scss/wb-charts.scss'
import '../shared.css'
import './shared-zoom.css'

import { addListenerByClassName } from '../shared'
import {
  AxisPosition,
  AxisType,
  CartesianAxes,
  CartesianAxesOptions,
  ChartLine,
  MouseOver,
  WheelMode,
  ZoomHandler,
  ZoomMode,
} from '../../src'

const containerZoom0 = document.getElementById('chart-container-0')
const containerZoom1 = document.getElementById('chart-container-1')
const containerZoom2 = document.getElementById('chart-container-2')
const containerZoom3 = document.getElementById('chart-container-3')
const containerZoom4 = document.getElementById('chart-container-4')
const containerZoom5 = document.getElementById('chart-container-5')

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
      nice: true,
    },
  ],
  margin: {
    left: 50,
    right: 50,
  },
}
const axisZoom0 = new CartesianAxes(containerZoom0, null, null, axisOptions)
const axisZoom1 = new CartesianAxes(containerZoom1, null, null, axisOptions)
const axisZoom2 = new CartesianAxes(containerZoom2, null, null, axisOptions)
const axisZoom3 = new CartesianAxes(containerZoom3, null, null, axisOptions)
const axisZoom4 = new CartesianAxes(containerZoom4, null, null, axisOptions)
const axisZoom5 = new CartesianAxes(containerZoom5, null, null, axisOptions)
const axes = [axisZoom0, axisZoom1, axisZoom2, axisZoom3, axisZoom4, axisZoom5]

// Generate time series with a sine function at every day; generate dates
// in UTC.
const startDate1 = new Date(2021, 8, 15)
const numDays1 = 1
const frequency1 = 3
const step1 = 0.01 // in days

const data = []
const startTime1 = startDate1.getTime()
const numSteps1 = numDays1 / step1
for (let i = 0; i < numSteps1; i++) {
  const curTime = startTime1 + i * step1 * 24 * 60 * 60 * 1000
  data.push({
    x: new Date(curTime),
    y: Math.sin(2 * Math.PI * frequency1 * i * step1),
  })
}

const startDate2 = new Date(2021, 8, 14)
const numDays2 = 3
const frequency2 = 3
const step2 = 0.01 // in days

const data2 = []
const startTime2 = startDate2.getTime()

const numSteps2 = numDays2 / step2
for (let i = 0; i < numSteps2; i++) {
  const curTime = startTime2 + i * step2 * 24 * 60 * 60 * 1000
  data2.push({
    x: new Date(curTime),
    y: Math.E * Math.sin(2 * Math.PI * frequency2 * i * step2),
  })
}
const style1 = {
  fill: 'none',
  stroke: 'skyblue',
}
const style2 = {
  fill: 'none',
  stroke: 'red',
  'stroke-dasharray': '5,5',
}

axes.forEach((axis, i) => {
  const plot1 = new ChartLine(i % 2 === 0 ? data : data2, {})
  const plot2 = new ChartLine(i % 2 === 0 ? data : data2, {})

  plot1.addTo(
    axis,
    { x: { key: 'x', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } },
    'local',
    style1
  )
  plot2.addTo(
    axis,
    { x: { key: 'x', axisIndex: 1 }, y: { key: 'y', axisIndex: 0 } },
    'mexico',
    style2
  )
})

const zoomHandlerX = new ZoomHandler({
  sharedZoomMode: ZoomMode.X,
  wheelMode: WheelMode.X,
})
axisZoom0.redraw({ x: { autoScale: true }, y: { autoScale: true } })
axisZoom0.accept(zoomHandlerX)
axisZoom0.accept(new MouseOver(['local', 'mexico']))

axisZoom1.redraw({ x: { autoScale: true }, y: { autoScale: true } })
axisZoom1.accept(zoomHandlerX)
axisZoom1.accept(new MouseOver(['local', 'mexico']))

const zoomHandlerY = new ZoomHandler({
  sharedZoomMode: ZoomMode.Y,
  wheelMode: WheelMode.Y,
})
axisZoom2.redraw({ x: { autoScale: true }, y: { autoScale: true } })
axisZoom2.accept(zoomHandlerY)
axisZoom2.accept(new MouseOver(['local', 'mexico']))

axisZoom3.redraw({ x: { autoScale: true }, y: { autoScale: true } })
axisZoom3.accept(zoomHandlerY)
axisZoom3.accept(new MouseOver(['local', 'mexico']))

const zoomHandlerXY = new ZoomHandler({
  sharedZoomMode: ZoomMode.XY,
  wheelMode: WheelMode.XY,
})
axisZoom4.redraw({ x: { autoScale: true }, y: { autoScale: true } })
axisZoom4.accept(zoomHandlerXY)
axisZoom4.accept(new MouseOver(['local', 'mexico']))

axisZoom5.redraw({ x: { autoScale: true }, y: { autoScale: true } })
axisZoom5.accept(zoomHandlerXY)
axisZoom5.accept(new MouseOver(['local', 'mexico']))

addListenerByClassName('theme-button', 'click', () =>
  document.documentElement.classList.toggle('dark')
)

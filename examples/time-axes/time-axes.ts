import '@lib/scss/wb-charts.scss'
import '@shared/shared.css'
import './time-axes.css'

import {
  AxisPosition,
  AxisType,
  CartesianAxes,
  CartesianAxesOptions,
  ChartLine,
  MouseOver,
  ZoomHandler,
} from '@lib'
import { addListenerByClassName } from '@shared'

const container = document.getElementById('chart-container-1')
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
const axis = new CartesianAxes(container, null, null, axisOptions)

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
const plot1 = new ChartLine(data, {})
const plot2 = new ChartLine(data, {})

const style1 = {
  fill: 'none',
  stroke: 'skyblue',
}
const style2 = {
  fill: 'none',
  stroke: 'red',
  'stroke-dasharray': '5,5',
}
plot1.addTo(axis, { x: { key: 'x', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } }, 'local', style1)
plot2.addTo(
  axis,
  { x: { key: 'x', axisIndex: 1 }, y: { key: 'y', axisIndex: 0 } },
  'mexico',
  style2,
)

const mouseOver = new MouseOver(['local', 'mexico'])
const zoomHandler = new ZoomHandler()

axis.redraw({ x: { autoScale: true }, y: { autoScale: true } })
axis.accept(zoomHandler)
axis.accept(mouseOver)

addListenerByClassName('theme-button', 'click', () =>
  document.documentElement.classList.toggle('dark'),
)

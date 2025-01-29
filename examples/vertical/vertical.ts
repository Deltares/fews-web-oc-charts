import '../../src/scss/wb-charts.scss'
import '../shared.css'
import './vertical.css'

import {
  AxisPosition,
  AxisType,
  CartesianAxes,
  CartesianAxesOptions,
  ChartLine,
  LabelOrientation,
  VerticalMouseOver,
  ZoomHandler,
} from '../../src'
import { addListenerByClassName } from '../shared'

function setupVerticalDateTimeMouseover() {
  const container = document.getElementById('chart-container-1')
  const axisOptions: CartesianAxesOptions = {
    x: [
      {
        label: 'Sine',
        position: AxisPosition.Bottom,
        unit: '-',
        showGrid: true,
        domain: [-1.1, 1.1],
      },
    ],
    y: [
      {
        type: AxisType.time,
        position: AxisPosition.Left,
        showGrid: true,
      },
      {
        type: AxisType.time,
        position: AxisPosition.Right,
        showGrid: true,
        locale: 'es-MX',
        timeZone: 'Mexico/General',
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
  const numDays = 5
  const frequency = 0.5
  const step = 0.01 // in days

  const data = []
  const startTime = startDate.getTime()
  const numSteps = numDays / step
  for (let i = 0; i < numSteps; i++) {
    const curTime = startTime + i * step * 24 * 60 * 60 * 1000
    data.push({
      x: Math.sin(2 * Math.PI * frequency * i * step),
      y: new Date(curTime),
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
  plot1.addTo(
    axis,
    { x: { key: 'x', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } },
    'local',
    style1
  )
  plot2.addTo(
    axis,
    { x: { key: 'x', axisIndex: 0 }, y: { key: 'y', axisIndex: 1 } },
    'mexico',
    style2
  )

  const mouseOver = new VerticalMouseOver(['local', 'mexico'])
  const zoomHandler = new ZoomHandler()

  axis.redraw({ x: { autoScale: true }, y: { autoScale: true } })
  axis.accept(zoomHandler)
  axis.accept(mouseOver)
}

function setupVerticalProfileMouseover() {
  const container = document.getElementById('chart-container-2')
  const axisOptions: CartesianAxesOptions = {
    x: [
      {
        label: 'Velocity',
        labelOffset: 10,
        position: AxisPosition.Bottom,
        unit: 'm/s',
        showGrid: true,
      },
    ],
    y: [
      {
        label: 'Height',
        labelOrientation: LabelOrientation.Vertical,
        labelOffset: 20,
        position: AxisPosition.Left,
        showGrid: true,
        domain: [-1000, 0],
      },
      {
        label: 'Depth',
        labelOrientation: LabelOrientation.Vertical,
        labelOffset: 20,
        position: AxisPosition.Right,
        showGrid: true,
        domain: [-1000, 0],
      },
    ],
    margin: {
      left: 50,
      right: 50,
    },
  }
  const axis = new CartesianAxes(container, null, null, axisOptions)

  const data = []
  const yValues = []
  const numSteps = 11
  const startValue = 0
  const endValue = -1000
  const stepSize = (endValue - startValue) / (numSteps - 1)
  for (let i = 0; i < numSteps; i++) {
    yValues.push(startValue + i * stepSize)
  }

  for (const y of yValues) {
    data.push({
      x: Math.log(-y + 1),
      y,
    })
  }

  const plot1 = new ChartLine(data, {})

  const style1 = {
    fill: 'none',
    stroke: 'skyblue',
  }

  plot1.addTo(
    axis,
    { x: { key: 'x', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } },
    'vertical-profile',
    style1
  )

  const mouseOver = new VerticalMouseOver(['vertical-profile'])
  const zoomHandler = new ZoomHandler()

  axis.redraw({ x: { autoScale: true }, y: { autoScale: true } })
  axis.accept(zoomHandler)
  axis.accept(mouseOver)
}

setupVerticalDateTimeMouseover()
setupVerticalProfileMouseover()

addListenerByClassName('theme-button', 'click', () =>
  document.documentElement.classList.toggle('dark')
)

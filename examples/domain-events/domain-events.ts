import '@lib/scss/wb-charts.scss'
import '@shared/shared.css'
import './domain-events.css'

import '@shared/theme-button'

import { SvgPropertiesHyphen } from 'csstype'

import {
  AxisIndex,
  AxisType,
  CartesianAxes,
  CartesianAxesOptions,
  ChartLine,
  ZoomHandler,
} from '@lib'

// Basic example with scalar values.
const exampleData = [
  { valueX: 0, valueY: 0 },
  { valueX: 1, valueY: 1 },
  { valueX: 2, valueY: 4 },
  { valueX: 3, valueY: 9 },
  { valueX: 4, valueY: 16 },
]

// Axes with regular values on the x- and y-axis.
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
const zoomHandler = new ZoomHandler()
axes.accept(zoomHandler)

const span = document.getElementById('event')
const domainToString = (domain: [number, number] | [Date, Date]) =>
  domain.map((value: number | Date) => value.toString()).join(', ')
const callback = (event) => {
  span.textContent = `old: ${domainToString(event.old)}; new: ${domainToString(event.new)}`
}

document.getElementById('add-listener').addEventListener('click', () => {
  span.textContent = 'Added event listener'
  axes.addEventListener('update:x-domain', callback)
})
document.getElementById('remove-listener').addEventListener('click', () => {
  span.textContent = 'Removed event listener'
  axes.removeEventListener('update:x-domain', callback)
})

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

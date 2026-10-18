import '../shared/v5.css'
import './arrows.css'
import { angular, arrows, axis, createPlot, createPolarPlot, linear, radial, time } from '@lib'

function required<T extends HTMLElement>(selector: string) {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`The arrows example is missing ${selector}.`)
  return element
}

const start = Date.UTC(2026, 3, 12)
const hour = 3_600_000
const cartesian = createPlot(required('#cartesian'), {
  title: 'Observed to forecast vectors',
  scales: {
    time: time({ domain: [start, start + 12 * hour], timeZone: 'UTC' }),
    value: linear({ domain: [0, 20], includeZero: true }),
  },
  axes: [
    axis('time', { position: 'bottom', label: 'Time (UTC)', tickCount: 5 }),
    axis('value', { position: 'left', label: 'Flow', unit: 'm³/s', grid: true }),
  ],
  marks: [
    arrows({
      id: 'forecast-vectors',
      x: 'time',
      y: 'value',
      xValues: [start, start + 3 * hour, start + 6 * hour, start + 9 * hour],
      yValues: [4, 7, 6, 12],
      xEndValues: [start + 2 * hour, start + 5 * hour, start + 8 * hour, start + 11 * hour],
      yEndValues: [8, 10, 13, 16],
      color: '#1677a6',
      strokeWidth: 2,
      headSize: 9,
    }),
  ],
})

const polar = createPolarPlot(required('#polar'), {
  title: 'Polar displacement vectors',
  scales: {
    bearing: angular({ domain: [0, 360], direction: 'clockwise', intercept: 0 }),
    distance: radial({ domain: [0, 100], innerRadius: 0.12 }),
  },
  axes: [
    axis('bearing', { position: 'angular', grid: true }),
    axis('distance', { position: 'radial', grid: true, label: 'Distance' }),
  ],
  marks: [
    arrows({
      id: 'polar-vectors',
      x: 'bearing',
      y: 'distance',
      xValues: [0, 60, 150, 240, 310],
      yValues: [20, 35, 25, 45, 30],
      xEndValues: [35, 105, 190, 285, 350],
      yEndValues: [65, 75, 60, 80, 70],
      color: '#d17b0f',
      strokeWidth: 2,
      headSize: 10,
    }),
  ],
})

function dispose() {
  cartesian.destroy()
  polar.destroy()
}

window.addEventListener(
  'pagehide',
  (event) => {
    if (!event.persisted) dispose()
  },
  { once: true },
)
import.meta.hot?.dispose(dispose)

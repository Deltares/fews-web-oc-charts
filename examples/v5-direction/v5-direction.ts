import '../shared/v5.css'
import './direction.css'
import {
  angularScale,
  axis,
  createPlot,
  createPolarPlot,
  direction,
  linearScale,
  radialScale,
  timeScale,
} from '@lib'

function required<T extends HTMLElement>(selector: string) {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`The direction example is missing ${selector}.`)
  return element
}

const start = Date.UTC(2026, 4, 20)
const hour = 3_600_000
const times = Array.from({ length: 12 }, (_, index) => start + index * hour)
const bearings = [350, 5, 28, 55, 82, 110, 138, 164, 195, 225, 270, 315]
const speeds = [8, 10, 9, 13, 15, 11, 8, 6, 7, 12, 14, 10]

const cartesian = createPlot(required('#cartesian'), {
  title: 'Wind direction and speed',
  scales: {
    time: timeScale({ domain: [times[0]!, times.at(-1)!], timeZone: 'UTC' }),
    speed: linearScale({ domain: [0, 20], includeZero: true }),
  },
  axes: [
    axis('time', { position: 'bottom', label: 'Time (UTC)', tickCount: 5 }),
    axis('speed', { position: 'left', label: 'Wind speed', unit: 'm/s', grid: true }),
  ],
  marks: [
    direction({
      id: 'wind-bearing-series',
      x: 'time',
      y: 'speed',
      xValues: times,
      yValues: speeds,
      directionValues: bearings,
      size: 16,
      every: 1,
      color: '#1677a6',
      strokeWidth: 2,
    }),
  ],
})

const polar = createPolarPlot(required('#polar'), {
  title: 'Wind from each bearing',
  scales: {
    bearing: angularScale({ domain: [0, 360], direction: 'clockwise', intercept: 0 }),
    speed: radialScale({ domain: [0, 20], innerRadius: 0.12 }),
  },
  axes: [
    axis('bearing', { position: 'angular', grid: true }),
    axis('speed', { position: 'radial', grid: true, label: 'Wind speed (m/s)' }),
  ],
  marks: [
    direction({
      id: 'wind-compass',
      x: 'bearing',
      y: 'speed',
      xValues: bearings,
      yValues: speeds,
      directionValues: bearings,
      size: 17,
      color: '#b2182b',
      strokeWidth: 2,
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

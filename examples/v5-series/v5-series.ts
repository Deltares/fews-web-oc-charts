import '../shared/v5.css'
import { axis, createPlot, line, linear, time } from '@lib'

const host = document.querySelector<HTMLElement>('#chart')
const showLine = document.querySelector<HTMLInputElement>('#show-line')
const showMarkers = document.querySelector<HTMLInputElement>('#show-markers')
const showArea = document.querySelector<HTMLInputElement>('#show-area')
if (!host || !showLine || !showMarkers || !showArea) {
  throw new Error('The series example is missing required elements.')
}

const hour = 3_600_000
const start = Date.UTC(2026, 1, 12)
const times = Float64Array.from({ length: 19 }, (_, index) => start + index * hour)
const discharge = Float64Array.from(
  { length: 19 },
  (_, index) => 24 + 13 * Math.sin(index / 2.3) + index * 1.8,
)
discharge[8] = Number.NaN
discharge[9] = Number.NaN

const events = new AbortController()
const createSeriesMark = () =>
  line({
    id: 'observed-discharge',
    x: 't',
    y: 'q',
    xValues: times,
    yValues: discharge,
    stroke: '#1677a6',
    strokeWidth: 2,
    line: showLine.checked,
    markers: showMarkers.checked
      ? { size: 4, fill: '#ffffff', stroke: '#1677a6', strokeWidth: 1.5 }
      : false,
    area: showArea.checked ? { to: 0, fill: '#1677a6', opacity: 0.18 } : undefined,
  })

const plot = createPlot(host, {
  title: 'Observed discharge',
  scales: {
    t: time({ domain: [start, start + 18 * hour], timeZone: 'UTC' }),
    q: linear({ domain: [0, 80], includeZero: true }),
  },
  axes: [
    axis('t', { position: 'bottom', label: 'Time (UTC)', tickCount: 5 }),
    axis('q', { position: 'left', label: 'Discharge', unit: 'm³/s', grid: true }),
  ],
  marks: [createSeriesMark()],
})

for (const control of [showLine, showMarkers, showArea]) {
  control.addEventListener('change', () => plot.update({ marks: [createSeriesMark()] }), events)
}

function dispose() {
  events.abort()
  plot.destroy()
}

window.addEventListener(
  'pagehide',
  (event) => {
    if (!event.persisted) dispose()
  },
  events,
)
import.meta.hot?.dispose(dispose)

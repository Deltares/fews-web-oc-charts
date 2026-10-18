import '../shared/v5.css'
import { axis, createPlot, line, linearScale, timeScale } from '@lib'

const host = document.querySelector<HTMLElement>('#chart')
if (!host) throw new Error('The basic-line example is missing its chart host.')

const hour = 3_600_000
const start = Date.UTC(2026, 0, 1)
const times = Float64Array.from({ length: 13 }, (_, index) => start + index * hour)
const discharge = Float64Array.from(
  { length: 13 },
  (_, index) => 32 + 18 * Math.sin(index / 2) + index * 1.7,
)
const rainfall = Float64Array.from(
  { length: 13 },
  (_, index) => 2 + 1.5 * Math.cos(index / 2.4) + index * 0.35,
)
const plot = createPlot(host, {
  title: 'Discharge and rainfall',
  scales: {
    t: timeScale({ domain: [start, start + 12 * hour], timeZone: 'UTC' }),
    q: linearScale({ domain: [0, 80], includeZero: true }),
    rain: linearScale({ domain: [0, 10], includeZero: true }),
  },
  axes: [
    axis('t', { position: 'bottom', label: 'Time (UTC)', tickCount: 5 }),
    axis('q', { position: 'left', label: 'Discharge', unit: 'm³/s', grid: true }),
    axis('rain', { position: 'right', label: 'Rainfall', unit: 'mm' }),
  ],
  marks: [
    line({
      id: 'discharge',
      x: 't',
      y: 'q',
      xValues: times,
      yValues: discharge,
      stroke: '#1677a6',
      strokeWidth: 2,
    }),
    line({
      id: 'rainfall',
      x: 't',
      y: 'rain',
      xValues: times,
      yValues: rainfall,
      stroke: '#d17b0f',
      strokeWidth: 2,
    }),
  ],
})

function dispose() {
  plot.destroy()
}

window.addEventListener(
  'pagehide',
  (event) => {
    if (!event.persisted) dispose()
  },
  { once: true },
)
import.meta.hot?.dispose(dispose)

import '../shared/v5.css'
import { axis, createPlot, line, linearScale, rule, timeScale } from '@lib'

const host = document.querySelector<HTMLElement>('#chart')
if (!host) throw new Error('The rule example is missing its chart host.')

const hour = 3_600_000
const start = Date.UTC(2026, 0, 1)
const times = Float64Array.from({ length: 25 }, (_, index) => start + index * hour)
const values = Float64Array.from(
  { length: 25 },
  (_, index) => 35 + 23 * Math.sin(index / 3) + index * 0.8,
)
const eventTime = start + 14 * hour

const plot = createPlot(host, {
  title: 'Discharge threshold and event time',
  scales: {
    t: timeScale({ domain: [start, start + 24 * hour], timeZone: 'UTC' }),
    q: linearScale({ domain: [0, 100] }),
  },
  axes: [
    axis('t', { position: 'bottom', label: 'Time (UTC)', tickCount: 6 }),
    axis('q', { position: 'left', label: 'Discharge', unit: 'm³/s', grid: true }),
  ],
  marks: [
    line({
      id: 'discharge',
      x: 't',
      y: 'q',
      xValues: times,
      yValues: values,
      stroke: '#1677a6',
      strokeWidth: 2,
    }),
    rule({ id: 'threshold', scale: 'q', value: 60, stroke: '#c45508', strokeWidth: 2 }),
    rule({ id: 'event', scale: 't', value: eventTime, stroke: '#7556a8', strokeWidth: 2 }),
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

import '../shared/v5.css'
import { axis, createPlot, linearScale, range, timeScale } from '@lib'

const host = document.querySelector<HTMLElement>('#chart')
if (!host) throw new Error('The cartesian range example is missing its chart host.')

const hour = 3_600_000
const start = Date.UTC(2026, 2, 1)
const xValues = Array.from({ length: 12 }, (_, index) => {
  const middle = start + index * hour
  return index === 7 ? null : ([middle - hour * 0.4, middle + hour * 0.4] as const)
})
const lowerValues = Array.from({ length: 12 }, (_, index) => {
  const middle = 35 + 12 * Math.sin(index / 2.2) + index * 1.1
  return index === 4 ? null : ([middle - 5 - index * 0.15, middle + 3 + index * 0.2] as const)
})
const upperValues = Array.from({ length: 12 }, (_, index) => {
  const middle = 42 + 10 * Math.sin(index / 2.2) + index * 0.9
  return index === 9 ? null : ([middle - 4 - index * 0.1, middle + 5 + index * 0.15] as const)
})

const plot = createPlot(host, {
  title: 'Forecast ranges',
  scales: {
    t: timeScale({ timeZone: 'UTC' }),
    q: linearScale({ includeZero: true, nice: true }),
  },
  axes: [
    axis('t', { position: 'bottom', label: 'Time (UTC)', tickCount: 5 }),
    axis('q', { position: 'left', label: 'Discharge', unit: 'm³/s', grid: true }),
  ],
  marks: [
    range({
      id: 'upstream-range',
      x: 't',
      y: 'q',
      xValues,
      yValues: lowerValues,
      fill: '#1677a6',
      opacity: 0.3,
    }),
    range({
      id: 'downstream-range',
      x: 't',
      y: 'q',
      xValues,
      yValues: upperValues,
      fill: '#d17b0f',
      opacity: 0.3,
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

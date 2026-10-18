import '../shared/v5.css'
import { axis, createPlot, line, linearScale, text, timeScale } from '@lib'

const host = document.querySelector<HTMLElement>('#chart')
if (!host) throw new Error('The text example is missing its chart host.')

const hour = 3_600_000
const start = Date.UTC(2026, 0, 1)
const times = Float64Array.from({ length: 5 }, (_, index) => start + index * 6 * hour)
const values = Float64Array.from([18, 42, 76, 51, 64])
const labels = ['Low', 'Rising', 'Peak', 'Falling', 'Recovered']

const plot = createPlot(host, {
  title: 'Observation labels',
  scales: {
    t: timeScale({ domain: [start, start + 24 * hour], timeZone: 'UTC' }),
    q: linearScale({ domain: [0, 100] }),
  },
  axes: [
    axis('t', { position: 'bottom', label: 'Time (UTC)', tickCount: 5 }),
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
    text({
      id: 'observation-labels',
      x: 't',
      y: 'q',
      xValues: times,
      yValues: values,
      textValues: labels,
      dy: -12,
      fill: '#7556a8',
      fontWeight: 600,
      textAnchor: 'middle',
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

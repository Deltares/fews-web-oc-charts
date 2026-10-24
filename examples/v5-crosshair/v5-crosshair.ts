import '../shared/v5.css'
import { axis, createPlot, crosshair, line, linearScale, timeScale } from '@lib'

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`The crosshair example is missing "${selector}".`)
  return element
}

const host = required<HTMLElement>('#chart')
const mode = required<HTMLSelectElement>('#mode')
const status = required<HTMLElement>('#status')
const events = new AbortController()
const start = Date.UTC(2026, 0, 1)
const hour = 3_600_000
const times = Float64Array.from({ length: 49 }, (_, index) => start + index * hour)
const values = Float64Array.from(
  { length: 49 },
  (_, index) => 44 + 22 * Math.sin(index / 3) + 13 * Math.cos(index / 7),
)
const interaction = crosshair({ mode: 'xy' })
const plot = createPlot(host, {
  title: 'Hourly observations',
  scales: {
    t: timeScale({ domain: [start, start + 48 * hour], timeZone: 'UTC' }),
    q: linearScale({ domain: [0, 100] }),
  },
  axes: [
    axis('t', { position: 'bottom', label: 'Time (UTC)', tickCount: 6 }),
    axis('q', { position: 'left', label: 'Value', grid: true }),
  ],
  marks: [
    line({
      x: 't',
      y: 'q',
      xValues: times,
      yValues: values,
      stroke: '#1677a6',
      strokeWidth: 2,
    }),
  ],
  plugins: [interaction],
})

function updateStatus() {
  status.textContent = `Showing ${mode.value === 'xy' ? 'both' : mode.value === 'x' ? 'vertical' : 'horizontal'} guide${mode.value === 'xy' ? 's' : ''}.`
}

mode.addEventListener(
  'change',
  () => {
    if (mode.value !== 'x' && mode.value !== 'y' && mode.value !== 'xy') {
      throw new Error(`Unknown crosshair mode "${mode.value}".`)
    }
    interaction.update({ mode: mode.value })
    updateStatus()
  },
  events,
)
updateStatus()
window.addEventListener(
  'pagehide',
  () => {
    events.abort()
    plot.destroy()
  },
  { once: true },
)

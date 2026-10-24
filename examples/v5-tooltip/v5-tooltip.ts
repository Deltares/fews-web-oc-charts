import '../shared/v5.css'
import { axis, createPlot, line, linearScale, timeScale, tooltip } from '@lib'

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`The tooltip example is missing "${selector}".`)
  return element
}

const host = required<HTMLElement>('#chart')
const axisOption = required<HTMLSelectElement>('#axis')
const positionOption = required<HTMLSelectElement>('#position')
const events = new AbortController()
const start = Date.UTC(2026, 0, 1)
const hour = 3_600_000
const times = Float64Array.from({ length: 49 }, (_, index) => start + index * hour)
const observed = line({
  id: 'observed',
  x: 't',
  y: 'q',
  xValues: times,
  yValues: Float64Array.from(
    { length: times.length },
    (_, index) => 44 + 22 * Math.sin(index / 3) + 13 * Math.cos(index / 7),
  ),
  digits: 2,
  stroke: '#1677a6',
  strokeWidth: 2,
})
const forecast = line({
  id: 'forecast',
  x: 't',
  y: 'q',
  xValues: times,
  yValues: Float64Array.from(
    { length: times.length },
    (_, index) => 47 + 18 * Math.sin(index / 3.5) + 10 * Math.cos(index / 8),
  ),
  digits: 2,
  stroke: '#d55e00',
  strokeWidth: 2,
})
const interaction = tooltip({ marks: [observed, forecast] })
const plot = createPlot(host, {
  title: 'Observed and forecast values',
  scales: {
    t: timeScale({ domain: [start, start + 48 * hour], timeZone: 'UTC' }),
    q: linearScale({ domain: [0, 100] }),
  },
  axes: [
    axis('t', { position: 'bottom', label: 'Time (UTC)', tickCount: 6 }),
    axis('q', { position: 'left', label: 'Value', grid: true }),
  ],
  marks: [observed, forecast],
  plugins: [interaction],
})

axisOption.addEventListener(
  'change',
  () => {
    if (axisOption.value !== 'x' && axisOption.value !== 'xy') {
      throw new Error(`Unknown tooltip axis "${axisOption.value}".`)
    }
    interaction.update({ axis: axisOption.value })
  },
  events,
)
positionOption.addEventListener(
  'change',
  () => {
    if (!['bottom', 'left', 'right', 'top'].includes(positionOption.value)) {
      throw new Error(`Unknown tooltip position "${positionOption.value}".`)
    }
    interaction.update({
      position: positionOption.value as 'bottom' | 'left' | 'right' | 'top',
    })
  },
  events,
)
window.addEventListener(
  'pagehide',
  () => {
    events.abort()
    plot.destroy()
  },
  { once: true },
)

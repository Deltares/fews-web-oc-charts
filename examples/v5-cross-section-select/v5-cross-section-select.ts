import '../shared/v5.css'
import { axis, createPlot, crossSectionSelect, line, linearScale, timeScale } from '@lib'

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`The cross-section example is missing "${selector}".`)
  return element
}

const host = required<HTMLElement>('#chart')
const draggable = required<HTMLInputElement>('#draggable')
const traces = required<HTMLSelectElement>('#traces')
const status = required<HTMLElement>('#status')
const start = Date.UTC(2026, 0, 1)
const hour = 3_600_000
const times = Float64Array.from({ length: 49 }, (_, index) => start + index * hour)
const observedTimes = times.filter((time) => time <= Date.UTC(2026, 0, 2))
const observed = line({
  id: 'observed',
  x: 'time',
  y: 'level',
  xValues: observedTimes,
  yValues: Float64Array.from(
    { length: observedTimes.length },
    (_, index) => 45 + 18 * Math.sin(index / 3) + 12 * Math.cos(index / 7),
  ),
  digits: 2,
  stroke: '#1677a6',
  strokeWidth: 2,
})
const forecast = line({
  id: 'forecast',
  x: 'time',
  y: 'level',
  xValues: times,
  yValues: Float64Array.from(
    { length: times.length },
    (_, index) => 48 + 16 * Math.sin(index / 3 + 0.5) + 9 * Math.cos(index / 7),
  ),
  digits: 2,
  stroke: '#d55e00',
  strokeWidth: 2,
})
const selection = crossSectionSelect(
  start + 24 * hour,
  (value) => {
    status.textContent = `Released at ${new Date(value).toISOString()}`
  },
  { x: 'time', draggable: true },
)
const plot = createPlot(host, {
  title: 'Observed and forecast levels',
  scales: {
    time: timeScale({ domain: [start, start + 48 * hour], timeZone: 'UTC' }),
    level: linearScale({ domain: [0, 100] }),
  },
  axes: [
    axis('time', { position: 'bottom', label: 'Time (UTC)', tickCount: 6 }),
    axis('level', { position: 'left', label: 'Level', grid: true }),
  ],
  marks: [observed, forecast],
  plugins: [selection],
})

function updateStatus() {
  const series = traces.selectedOptions[0].textContent?.toLowerCase() ?? 'selected series'
  status.textContent = `${series} at ${new Date(selection.value.get()).toISOString()}`
}

draggable.addEventListener('change', () => selection.update({ draggable: draggable.checked }))
traces.addEventListener('change', () => {
  if (traces.value === 'all') selection.update({ marks: 'all' })
  else if (traces.value === 'observed') selection.update({ marks: [observed] })
  else if (traces.value === 'forecast') selection.update({ marks: [forecast] })
  else throw new Error(`Unknown series filter "${traces.value}".`)
  updateStatus()
})
updateStatus()
window.addEventListener('pagehide', () => plot.destroy(), { once: true })

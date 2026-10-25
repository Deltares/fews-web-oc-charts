import '../shared/v5.css'
import { axis, createPlot, effect, line, linearScale, ModifierKey, timeScale, pan } from '@lib'

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`The pan example is missing "${selector}".`)
  return element
}
const host = required<HTMLElement>('#chart')
const mode = required<HTMLSelectElement>('#mode')
const modifier = required<HTMLSelectElement>('#modifier')
const enabled = required<HTMLInputElement>('#enabled')
const reset = required<HTMLButtonElement>('#reset')
const status = required<HTMLElement>('#status')
const snapshot = required<HTMLElement>('#snapshot')

const hour = 3_600_000
const start = Date.UTC(2026, 0, 1)
const end = start + 48 * hour
const times = Float64Array.from({ length: 49 }, (_, index) => start + index * hour)
const values = Float64Array.from(
  { length: 49 },
  (_, index) => 44 + 22 * Math.sin(index / 3) + 13 * Math.cos(index / 7),
)
const t = timeScale({ domain: [start, end], timeZone: 'UTC' })
const q = linearScale({ domain: [0, 100] })
const interaction = pan({ mode: 'x', modifier: ModifierKey.None })
const plot = createPlot(host, {
  title: 'Hourly observations',
  scales: { t, q },
  axes: [
    axis('t', { position: 'bottom', label: 'Time (UTC)', tickCount: 6 }),
    axis('q', { position: 'left', label: 'Value', grid: true }),
  ],
  marks: [
    line({
      id: 'observations',
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
const events = new AbortController()

const snapshotEffect = effect(() => {
  snapshot.textContent = JSON.stringify(
    {
      time: t.domain.get().map((value) => new Date(Number(value)).toISOString()),
      value: q.domain.get(),
    },
    null,
    2,
  )
})

function updateStatus() {
  status.textContent = enabled.checked
    ? `${modifier.value === 'none' ? 'No modifier' : `${modifier.value} required`}; drag pans ${mode.value}.`
    : 'Pan disabled; dragging leaves the domains unchanged.'
}

function selectedMode(value: string): 'x' | 'y' | 'xy' {
  if (value === 'x' || value === 'y' || value === 'xy') return value
  throw new Error(`Unknown pan mode "${value}".`)
}

function selectedModifier(value: string): ModifierKey {
  switch (value) {
    case 'none':
      return ModifierKey.None
    case 'ctrl':
      return ModifierKey.Ctrl
    case 'shift':
      return ModifierKey.Shift
    default:
      throw new Error(`Unknown modifier "${value}".`)
  }
}

function updateOptions() {
  interaction.update({ mode: selectedMode(mode.value), modifier: selectedModifier(modifier.value) })
  updateStatus()
}

for (const control of [mode, modifier]) {
  control.addEventListener('change', updateOptions, events)
}
enabled.addEventListener(
  'change',
  () => {
    plot.update({ plugins: enabled.checked ? [interaction] : [] })
    updateStatus()
  },
  events,
)
reset.addEventListener(
  'click',
  () => {
    t.domain.set([start, end])
    q.domain.set([0, 100])
  },
  events,
)
updateStatus()

function dispose() {
  events.abort()
  snapshotEffect.dispose()
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

import '../shared/v5.css'
import { axis, createPlot, line, linearScale, ModifierKey, timeScale, pan } from '@lib'

const host = document.querySelector<HTMLElement>('#chart')
const mode = document.querySelector<HTMLSelectElement>('#mode')
const modifier = document.querySelector<HTMLSelectElement>('#modifier')
const reset = document.querySelector<HTMLButtonElement>('#reset')
const status = document.querySelector<HTMLElement>('#status')
const snapshot = document.querySelector<HTMLElement>('#snapshot')
if (!host || !mode || !modifier || !reset || !status || !snapshot) {
  throw new Error('The pan example is missing required elements.')
}

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

function updateStatus() {
  snapshot.textContent = JSON.stringify(
    {
      time: t.domain.get().map((value) => new Date(Number(value)).toISOString()),
      value: q.domain.get(),
    },
    null,
    2,
  )
  status.textContent = `${modifier.value === 'none' ? 'No modifier' : `${modifier.value} required`}; drag pans ${mode.value}.`
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
reset.addEventListener(
  'click',
  () => {
    t.domain.set([start, end])
    q.domain.set([0, 100])
    updateStatus()
  },
  events,
)
plot.element.addEventListener('pointerup', updateStatus, events)
updateStatus()

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

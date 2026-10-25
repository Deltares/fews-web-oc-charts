import '../shared/v5.css'
import { axis, createPlot, line, linearScale, ModifierKey, timeScale, zoom } from '@lib'

const host = document.querySelector<HTMLElement>('#chart')
const mode = document.querySelector<HTMLSelectElement>('#mode')
const wheelEnabled = document.querySelector<HTMLInputElement>('#wheel-enabled')
const modifier = document.querySelector<HTMLSelectElement>('#modifier')
const reset = document.querySelector<HTMLButtonElement>('#reset')
const status = document.querySelector<HTMLElement>('#status')
const snapshot = document.querySelector<HTMLElement>('#snapshot')
if (!host || !mode || !wheelEnabled || !modifier || !reset || !status || !snapshot) {
  throw new Error('The zoom example is missing required elements.')
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
const q = linearScale({ autoscale: 'visible', defaultDomain: [0, 100] })
const interaction = zoom({
  mode: 'x',
  wheel: 'x',
  modifier: ModifierKey.None,
  reset: 'initial',
})
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
  const xDomain = t.domain.get().map((value) => new Date(Number(value)).toISOString())
  const yDomain = q.domain.get()
  snapshot.textContent = JSON.stringify({ time: xDomain, value: yDomain }, null, 2)
  const modifierDescription =
    modifier.value === 'none' ? 'No modifier' : `${modifier.value} required`
  const scaleDescription = q.options.get().explicit.domain
    ? 'has a manual domain'
    : 'autoscale is following visible data'
  status.textContent = !wheelEnabled.checked
    ? 'Wheel zoom is disabled.'
    : `${modifierDescription}; wheel zoom affects ${mode.value}. The y scale ${scaleDescription}.`
}

function selectedMode(value: string, name: string): 'x' | 'y' | 'xy' {
  if (value === 'x' || value === 'y' || value === 'xy') return value
  throw new Error(`Unknown ${name} "${value}".`)
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
  const selected = selectedMode(mode.value, 'zoom mode')
  interaction.update({
    mode: selected,
    wheel: wheelEnabled.checked ? selected : 'none',
    modifier: selectedModifier(modifier.value),
  })
  updateStatus()
}

plot.on(
  'domainchange',
  () => {
    const xDomain = t.domain.get().map((value) => new Date(Number(value)).toISOString())
    snapshot.textContent = JSON.stringify({ time: xDomain, value: q.domain.get() }, null, 2)
  },
  { signal: events.signal },
)

for (const control of [mode, wheelEnabled, modifier]) {
  control.addEventListener('change', updateOptions, events)
}
reset.addEventListener(
  'click',
  () => {
    t.domain.set([start, end])
    q.update({ domain: undefined })
    updateStatus()
  },
  events,
)
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

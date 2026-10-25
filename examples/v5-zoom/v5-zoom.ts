import '../shared/v5.css'
import { axis, createPlot, effect, line, linearScale, ModifierKey, timeScale, zoom } from '@lib'

function required<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`The zoom example is missing "${selector}".`)
  return element
}

const host = required('#chart')
const mode = required<HTMLSelectElement>('#mode')
const wheelEnabled = required<HTMLInputElement>('#wheel-enabled')
const modifier = required<HTMLSelectElement>('#modifier')
const resetMode = required<HTMLSelectElement>('#reset-mode')
const reset = required<HTMLButtonElement>('#reset')
const status = required('#status')
const eventStatus = required('#event-status')
const snapshot = required('#snapshot')

const hour = 3_600_000
const start = Date.UTC(2026, 0, 1)
const end = start + 48 * hour
const times = Float64Array.from({ length: 97 }, (_, index) => start + index * hour)
const values = Float64Array.from(
  { length: 97 },
  (_, index) => 44 + 22 * Math.sin(index / 3) + 13 * Math.cos(index / 7) + (index > 48 ? 100 : 0),
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
const latestChanges = new Map<string, string>()

function updateStatus() {
  const xDomain = t.domain.get().map((value) => new Date(Number(value)).toISOString())
  const yDomain = q.domain.get()
  snapshot.textContent = JSON.stringify(
    {
      time: xDomain,
      value: yDomain,
      valueDomain: q.options.get().explicit.domain ? 'manual' : 'visible autoscale',
    },
    null,
    2,
  )
  const modifierDescription =
    modifier.value === 'none' ? 'No modifier' : `${modifier.value} required`
  const scaleDescription = q.options.get().explicit.domain
    ? 'has a manual domain'
    : 'autoscale is following visible data'
  const wheelDescription = wheelEnabled.checked
    ? `${modifierDescription}; wheel zoom affects ${mode.value}.`
    : 'Wheel zoom is disabled.'
  status.textContent = `${wheelDescription} Double-click reset: ${resetMode.value}, affecting ${mode.value}. The y scale ${scaleDescription}.`
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
  const policy = resetMode.value
  if (policy !== 'initial' && policy !== 'full' && policy !== 'toggle') {
    throw new Error(`Unknown reset policy "${policy}".`)
  }
  interaction.update({
    mode: selected,
    wheel: wheelEnabled.checked ? selected : 'none',
    modifier: selectedModifier(modifier.value),
    reset: policy,
  })
  updateStatus()
}

plot.on(
  'domainchange',
  ({ scale, source, explicit }) => {
    latestChanges.set(
      scale,
      `domainchange: ${scale}; source: ${source}; ${explicit ? 'manual domain' : 'autoscale'}.`,
    )
    eventStatus.textContent = [...latestChanges.values()].join(' ')
  },
  { signal: events.signal },
)

for (const control of [mode, wheelEnabled, modifier, resetMode]) {
  control.addEventListener('change', updateOptions, events)
}
reset.addEventListener(
  'click',
  () => {
    latestChanges.clear()
    t.domain.set([start, end])
    q.update({ domain: undefined })
    eventStatus.textContent = 'Initial view restored by the application (API).'
  },
  events,
)
eventStatus.textContent = 'Waiting for a domainchange event.'
const statusEffect = effect(updateStatus)

function dispose() {
  events.abort()
  statusEffect.dispose()
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

import '../shared/v5.css'
import { axis, createPlot, linearScale, timeScale } from '@lib'

const host = document.querySelector<HTMLElement>('#plot')
const period = document.querySelector<HTMLSelectElement>('#period')
const timeZone = document.querySelector<HTMLSelectElement>('#time-zone')
const locale = document.querySelector<HTMLSelectElement>('#locale')
const status = document.querySelector<HTMLElement>('#status')
if (!host || !period || !timeZone || !locale || !status) {
  throw new Error('The time-axis example is missing required elements.')
}

const windows: Record<string, readonly [number, number]> = {
  spring: [Date.UTC(2026, 2, 29), Date.UTC(2026, 2, 29, 6)],
  fall: [Date.UTC(2026, 9, 25), Date.UTC(2026, 9, 25, 5)],
  week: [Date.UTC(2026, 2, 23), Date.UTC(2026, 2, 30)],
} as const
const t = timeScale({ domain: windows.spring, timeZone: 'UTC' })
const q = linearScale({ domain: [0, 10] })
const tAxis = axis('t', {
  position: 'bottom',
  label: 'Local time',
  tickCount: 6,
  grid: true,
  timeZone: timeZone.value,
  locale: locale.value,
})
const qAxis = axis('q', { position: 'left', label: 'Example scale', grid: true })
const plot = createPlot(host, {
  title: 'Civil-calendar time ticks',
  scales: { t, q },
  axes: [tAxis, qAxis],
})
const events = new AbortController()

const describe = () => {
  const [from, to] = t.domain.get().map(Number)
  status.textContent =
    `Axis zone: ${tAxis.options.get().resolved.timeZone}; locale: ${tAxis.options.get().resolved.locale}. ` +
    `Displayed domain: ${new Date(from).toISOString()} to ${new Date(to).toISOString()}.`
}

const update = () => {
  const domain = windows[period.value]
  if (!domain) throw new Error(`Unknown time window "${period.value}".`)
  t.domain.set(domain)
  tAxis.update({ timeZone: timeZone.value, locale: locale.value })
  describe()
}

period.addEventListener('change', update, events)
timeZone.addEventListener('change', update, events)
locale.addEventListener('change', update, events)
describe()

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

import '../shared/v5.css'
import {
  axis,
  batch,
  createPlot,
  crosshair,
  effect,
  linearScale,
  pan,
  subscribe,
  sharedPointer,
  timeScale,
  zoom,
  type Plot,
} from '@lib'

const overviewHost = document.querySelector<HTMLElement>('#overview')
const detailHost = document.querySelector<HTMLElement>('#detail')
const detailWidth = document.querySelector<HTMLElement>('#detail-width-container')
const startHour = document.querySelector<HTMLInputElement>('#start-hour')
const maximum = document.querySelector<HTMLSelectElement>('#maximum')
const width = document.querySelector<HTMLInputElement>('#detail-width')
const startValue = document.querySelector<HTMLOutputElement>('#start-value')
const widthValue = document.querySelector<HTMLOutputElement>('#width-value')
const gestureMode = document.querySelector<HTMLSelectElement>('#gesture-mode')
const toggle = document.querySelector<HTMLButtonElement>('#toggle-overview')
const reset = document.querySelector<HTMLButtonElement>('#reset')
const status = document.querySelector<HTMLElement>('#status')
const subscriptionStatus = document.querySelector<HTMLElement>('#subscription-status')
const snapshot = document.querySelector<HTMLElement>('#snapshot')
if (
  !overviewHost ||
  !detailHost ||
  !detailWidth ||
  !startHour ||
  !maximum ||
  !width ||
  !startValue ||
  !widthValue ||
  !gestureMode ||
  !toggle ||
  !reset ||
  !status ||
  !subscriptionStatus ||
  !snapshot
) {
  throw new Error('The shared-scale example is missing required elements.')
}

const start = Date.UTC(2026, 0, 1)
const hour = 3_600_000
const t = timeScale({ domain: [start, start + 6 * hour], timeZone: 'UTC' })
const q = linearScale({ domain: [0, 100] })
const panning = pan({ mode: 'x' })
const zooming = zoom({ mode: 'x', wheel: 'x' })
const pointer = sharedPointer({ by: 'xy' })
const guides = crosshair({ pointer, labels: { x: 't', y: 'q' } })
const events = new AbortController()
const timeLabel = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

function mount(element: HTMLElement, title: string): Plot {
  return createPlot(element, {
    title,
    scales: { t, q },
    axes: [
      axis('t', {
        position: 'bottom',
        label: 'Time (UTC)',
        tickCount: 3,
        grid: true,
        format: (value) => timeLabel.format(Number(value)),
      }),
      axis('q', { position: 'left', label: 'Discharge', unit: 'm3/s', grid: true }),
    ],
    plugins: [panning, zooming, guides],
  })
}

let overview = mount(overviewHost, 'Overview')
const detail = mount(detailHost, 'Detail')
let subscriptionNotifications = 0

subscribe(
  t.domain,
  (domain) => {
    subscriptionNotifications += 1
    const [from, to] = domain.map(Number)
    subscriptionStatus.textContent =
      `Shared time subscription notified ${subscriptionNotifications} time(s): ` +
      `${new Date(from).toISOString()} to ${new Date(to).toISOString()}. ` +
      'One subscription observes the scale shared by both plots.'
  },
  { signal: events.signal },
)

const snapshotEffect = effect(() => {
  snapshot.textContent = JSON.stringify(
    {
      time: t.domain.get().map((value) => new Date(Number(value)).toISOString()),
      discharge: q.domain.get(),
    },
    null,
    2,
  )
})

function selectedMode(value: string): 'x' | 'y' | 'xy' {
  if (value === 'x' || value === 'y' || value === 'xy') return value
  throw new Error(`Unknown gesture direction "${value}".`)
}

gestureMode.addEventListener(
  'change',
  () => {
    const mode = selectedMode(gestureMode.value)
    panning.update({ mode })
    zooming.update({ mode, wheel: mode })
  },
  events,
)

const describe = () => {
  const [from, to] = t.domain.get().map(Number)
  status.textContent =
    `Shared UTC window: ${new Date(from).toISOString()} to ${new Date(to).toISOString()}. ` +
    `Discharge: ${q.domain.get().join(' to ')} m3/s. Overview ${overview.destroyed ? 'destroyed' : 'mounted'}; detail mounted.`
}

const updateDomains = () => {
  const offset = Number(startHour.value)
  batch(() => {
    t.domain.set([start + offset * hour, start + (offset + 6) * hour])
    q.update({ domain: [0, Number(maximum.value)] })
  })
  startValue.value = `${String(offset).padStart(2, '0')}:00`
  describe()
}

startHour.addEventListener('input', updateDomains, events)
maximum.addEventListener('change', updateDomains, events)
width.addEventListener(
  'input',
  () => {
    detailWidth.style.width = `${width.value}%`
    widthValue.value = `${width.value}%`
  },
  events,
)
toggle.addEventListener(
  'click',
  () => {
    if (overview.destroyed) overview = mount(overviewHost, 'Overview')
    else overview.destroy()
    toggle.textContent = overview.destroyed ? 'Recreate overview' : 'Destroy overview'
    describe()
  },
  events,
)
reset.addEventListener(
  'click',
  () => {
    startHour.value = '0'
    maximum.value = '100'
    updateDomains()
  },
  events,
)
describe()

function dispose() {
  events.abort()
  snapshotEffect.dispose()
  overview.destroy()
  detail.destroy()
}
window.addEventListener(
  'pagehide',
  (event) => {
    if (!event.persisted) dispose()
  },
  events,
)
import.meta.hot?.dispose(dispose)

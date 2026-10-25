import '@lib/scss/wb-charts.scss'
import '@shared/shared.css'
import '../shared/v5.css'
import '../shared/v5-parity.css'
import './zoom.css'
import {
  AxisType,
  CartesianAxes,
  ChartLine,
  ModifierKey,
  ResetZoom,
  WheelMode,
  ZoomHandler,
  axis,
  line,
  linearScale,
  timeScale,
  zoom,
} from '@lib'
import { parityPlot } from '../shared/v5-parity'

function required<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`The zoom parity example is missing "${selector}".`)
  return element
}

const mode = required<HTMLSelectElement>('#mode')
const wheelEnabled = required<HTMLInputElement>('#wheel-enabled')
const modifier = required<HTMLSelectElement>('#modifier')
const resetMode = required<HTMLSelectElement>('#reset-mode')
const reset = required<HTMLButtonElement>('#reset')
const optionsStatus = required<HTMLElement>('#options-status')
const v4Status = required<HTMLElement>('#v4-status')
const v5Status = required<HTMLElement>('#v5-status')
const v4Snapshot = required<HTMLElement>('#v4-snapshot')
const v5Snapshot = required<HTMLElement>('#v5-snapshot')

const hour = 3_600_000
const start = Date.UTC(2026, 0, 1)
const initialDomain: [number, number] = [start, start + 48 * hour]
const times = Float64Array.from({ length: 97 }, (_, i) => start + i * hour)
const values = Float64Array.from(
  { length: 97 },
  (_, i) => 44 + 22 * Math.sin(i / 3) + 13 * Math.cos(i / 7) + (i > 48 ? 100 : 0),
)
const v4InitialDomain: [Date, Date] = [new Date(initialDomain[0]), new Date(initialDomain[1])]
const v4 = new CartesianAxes(required('#v4-chart'), null, null, {
  x: [{ type: AxisType.time, resetZoom: ResetZoom.initial }],
  y: [{ type: AxisType.value, defaultDomain: [0, 100], resetZoom: ResetZoom.initial }],
  automargin: true,
})
const v4Data = Array.from(times, (time, i) => ({ x: new Date(time), y: values[i] }))
// v4 full reset includes traces excluded from initial autoscaling.
for (const [index, data] of [v4Data.slice(0, 49), v4Data.slice(48)].entries()) {
  new ChartLine(data, {
    x: { includeInAutoScale: index === 0 },
    y: { includeInAutoScale: index === 0 },
  }).addTo(
    v4,
    { x: { key: 'x', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } },
    `observations-${index}`,
    { fill: 'none', stroke: '#1677a6', 'stroke-width': '2' },
  )
}
v4.redraw({ x: { autoScale: true }, y: { autoScale: true } })
const v4Zoom = new ZoomHandler(WheelMode.X)
v4.accept(v4Zoom)

const t = timeScale({ domain: initialDomain, timeZone: 'UTC', locale: 'en-GB' })
const q = linearScale({ autoscale: 'visible', defaultDomain: [0, 100] })
const interaction = zoom({ mode: 'x', wheel: 'x', reset: 'initial' })
const v5 = parityPlot('v5-chart', {
  scales: { t, q },
  axes: [
    axis('t', { style: 'classic', position: 'bottom', label: 'Time (UTC)', tickCount: 5 }),
    axis('q', { style: 'classic', position: 'left', label: 'Value', grid: true }),
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

function updateSnapshots() {
  v4Snapshot.textContent = JSON.stringify(
    { time: v4.xScalesDomains[0], value: v4.yScalesDomains[0] },
    null,
    2,
  )
  v5Snapshot.textContent = JSON.stringify(
    {
      time: t.domain.get().map((value) => new Date(Number(value)).toISOString()),
      value: q.domain.get(),
      valueDomain: q.options.get().explicit.domain ? 'manual' : 'visible autoscale',
    },
    null,
    2,
  )
}

function updateOptions() {
  const direction = mode.value
  if (direction !== 'x' && direction !== 'y' && direction !== 'xy') {
    throw new Error(`Unknown zoom direction "${direction}".`)
  }
  const modifierKey = Object.values(ModifierKey).find((key) => key === modifier.value)
  if (modifierKey === undefined) throw new Error(`Unknown modifier "${modifier.value}".`)
  const resetPolicy = Object.values(ResetZoom).find((policy) => policy === resetMode.value)
  if (resetPolicy === undefined) throw new Error(`Unknown reset policy "${resetMode.value}".`)

  const wheelModes = { x: WheelMode.X, y: WheelMode.Y, xy: WheelMode.XY }
  v4Zoom.updateOptions({
    wheelMode: wheelEnabled.checked ? wheelModes[direction] : WheelMode.NONE,
    scrollModifierKey: modifierKey,
  })
  v4.setOptions({ x: [{ resetZoom: resetPolicy }], y: [{ resetZoom: resetPolicy }] })
  interaction.update({
    mode: direction,
    wheel: wheelEnabled.checked ? direction : 'none',
    modifier: modifierKey,
    reset: resetPolicy,
  })
  optionsStatus.textContent = `Wheel: ${wheelEnabled.checked ? direction : 'disabled'}; modifier: ${modifierKey}; double-click reset: ${resetPolicy}. Options apply immediately.`
}

const onV4Zoom = ({ mode }: { mode: string }) => {
  v4Status.textContent = `Zoomed: ${mode} (v4 zoom callback).`
  updateSnapshots()
}
const onV4Reset = () => {
  v4Status.textContent = 'Zoom reset (v4 reset-zoom callback).'
  updateSnapshots()
}
v4Zoom.addEventListener('zoom', onV4Zoom)
v4Zoom.addEventListener('reset-zoom', onV4Reset)
v5.on(
  'domainchange',
  ({ scale, source, explicit }) => {
    latestChanges.set(
      scale,
      `domainchange: ${scale}; source: ${source}; ${explicit ? 'manual domain' : 'autoscale'}.`,
    )
    v5Status.textContent = [...latestChanges.values()].join(' ')
    updateSnapshots()
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
    v4.redraw({
      x: { domain: v4InitialDomain },
      y: { autoScale: true },
    })
    t.domain.set(initialDomain)
    q.update({ domain: undefined })
    v4Status.textContent = 'Initial view restored by the application.'
    v5Status.textContent = 'Initial view restored by the application (API).'
    updateSnapshots()
  },
  events,
)
v4Status.textContent = 'Waiting for a zoom or reset callback.'
v5Status.textContent = 'Waiting for a domainchange event; y uses visible-data autoscaling.'
updateOptions()
updateSnapshots()

function dispose() {
  events.abort()
  v4Zoom.removeEventListener('zoom', onV4Zoom)
  v4Zoom.removeEventListener('reset-zoom', onV4Reset)
  v4.observer.disconnect()
  v5.destroy()
}
window.addEventListener(
  'pagehide',
  (event) => {
    if (!event.persisted) dispose()
  },
  events,
)
import.meta.hot?.dispose(dispose)

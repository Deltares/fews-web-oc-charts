import '@lib/scss/wb-charts.scss'
import '@shared/shared.css'
import '../shared/v5.css'
import '../shared/v5-parity.css'
import './v5-parity-brush.css'

import {
  AxisType,
  BrushHandler,
  CartesianAxes,
  CartesianAxesOptions,
  ChartLine,
  ModifierKey as V4ModifierKey,
  MouseButton,
  PanHandler,
  PanningDirection,
  WheelMode,
  ZoomHandler,
  axis,
  brush,
  brushEvent,
  createPlot,
  effect,
  line,
  linearScale,
  ModifierKey,
  pan,
  timeScale,
  type DataPoint,
  zoom,
  type BrushSelection,
} from '@lib'
import { generateExampleTimeSeriesData } from '../shared/data'
import { parityPlot } from '../shared/v5-parity'

const fullDomain: [Date, Date] = [
  new Date('2025-01-01T00:00:00Z'),
  new Date('2025-01-08T00:00:00Z'),
]
const initialDomain: [Date, Date] = [
  new Date('2025-01-04T00:00:00Z'),
  new Date('2025-01-05T00:00:00Z'),
]
const data = generateExampleTimeSeriesData(fullDomain, [-1, 1], 169)
const v4Data: DataPoint[] = data.map(({ x, y }) => ({ x, y }))
const values = Float64Array.from(data, ({ y }) => y)
const timestamps = Float64Array.from(data, ({ x }) => x.getTime())

function requiredHost(id: string): HTMLElement {
  const host = document.getElementById(id)
  if (!host) throw new Error(`The brush parity example is missing "${id}".`)
  return host
}

const v4Status = document.querySelector<HTMLElement>('#v4-status')
const v5Status = document.querySelector<HTMLElement>('#v5-status')
const v5Snapshot = document.querySelector<HTMLElement>('#v5-snapshot')
if (!v4Status || !v5Status || !v5Snapshot) {
  throw new Error('The brush parity example is missing its status elements.')
}

const v4Main = new CartesianAxes(requiredHost('v4-main'), null, null, {
  x: [{ type: AxisType.time, domain: initialDomain }],
  y: [{ type: AxisType.value }],
  automargin: true,
} satisfies CartesianAxesOptions)
new ChartLine(v4Data, {}).addTo(
  v4Main,
  { x: { key: 'x', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } },
  'observations',
  { fill: 'none', stroke: '#1677a6', 'stroke-width': '2' },
)
v4Main.redraw({ x: { autoScale: true }, y: { autoScale: true } })

const v4Zoom = new ZoomHandler(WheelMode.X)
v4Main.accept(v4Zoom)
v4Main.accept(
  new PanHandler({
    direction: PanningDirection.X,
    mouseButton: MouseButton.Left,
    modifierKey: V4ModifierKey.Shift,
  }),
)
const v4Brush = new BrushHandler({
  brushMode: 'X',
  domain: { x: initialDomain },
  labelFormatter: (date) => (date instanceof Date ? date.toISOString() : String(date)),
})
const v4Overview = new CartesianAxes(requiredHost('v4-overview'), null, null, {
  x: [{ type: AxisType.time, domain: fullDomain }],
  y: [{ type: AxisType.value, showAxis: false }],
  automargin: true,
} satisfies CartesianAxesOptions)
new ChartLine(v4Data, {}).addTo(
  v4Overview,
  { x: { key: 'x', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } },
  'observations',
  { fill: 'none', stroke: '#1677a6', 'stroke-width': '2' },
)
v4Overview.redraw({ x: { autoScale: true }, y: { autoScale: true } })
v4Overview.accept(v4Brush)
v4Brush.addEventListener('update:x-brush-domain', ({ new: domain }) => {
  v4Main.redraw({ x: { domain } })
  v4Status.textContent = 'Overview brush selection updated the v4 main chart.'
})
v4Main.addEventListener('update:x-domain', ({ new: domain }) => {
  v4Brush.setBrushDomain({ x: domain })
})

function toTimestampDomain([start, end]: [Date, Date]): [number, number] {
  return [start.getTime(), end.getTime()]
}
const v5InitialDomain = toTimestampDomain(initialDomain)
const v5FullDomain = toTimestampDomain(fullDomain)
const v5Time = timeScale({
  domain: v5InitialDomain,
  timeZone: 'UTC',
  locale: 'en-GB',
})
const v5Value = linearScale({ domain: [-1.1, 1.1] })
const v5Marks = () => [
  line({
    id: 'observations',
    x: 't',
    y: 'q',
    xValues: timestamps,
    yValues: values,
    stroke: '#1677a6',
    strokeWidth: 2,
  }),
]
const v5Brush = brush({ mode: 'auto' })
const v5Main = parityPlot('v5-main', {
  scales: { t: v5Time, q: v5Value },
  axes: [
    axis('t', { style: 'classic', position: 'bottom', label: 'Time (UTC)', tickCount: 6 }),
    axis('q', { style: 'classic', position: 'left', label: 'Value', grid: true }),
  ],
  marks: v5Marks(),
  plugins: [v5Brush, zoom({ mode: 'x', wheel: 'x', reset: 'full' }), pan({ mode: 'x' })],
})
const v5Navigator = brush({ mode: 'x', persistent: true, modifier: ModifierKey.None })
v5Navigator.setSelection({ mode: 'x', scales: { t: v5Time.domain.get() } })
const v5Overview = createPlot(requiredHost('v5-overview'), {
  height: 160,
  scales: {
    t: timeScale({ domain: v5FullDomain, timeZone: 'UTC', locale: 'en-GB' }),
    q: linearScale({ domain: [-1.1, 1.1] }),
  },
  axes: [
    axis('t', {
      style: 'classic',
      position: 'bottom',
      label: 'Full time range (UTC)',
      tickCount: 6,
    }),
  ],
  marks: v5Marks(),
  plugins: [v5Navigator],
})

const v4Reset = document.querySelector<HTMLButtonElement>('#v4-reset')
const v5Reset = document.querySelector<HTMLButtonElement>('#v5-reset')
if (!v4Reset || !v5Reset) {
  throw new Error('The brush parity example is missing required controls.')
}

const events = new AbortController()
function syncV5Navigator() {
  v5Navigator.setSelection({ mode: 'x', scales: { t: v5Time.domain.get() } })
}

v5Main.element.addEventListener(
  brushEvent,
  (event: Event) => {
    const selection = (event as CustomEvent<BrushSelection>).detail
    const selectedTime = selection.scales.t
    if (!selectedTime) return
    v5Time.domain.set(selectedTime)
    syncV5Navigator()
    v5Status.textContent = 'Main-chart brush selection updated the overview navigator.'
  },
  events,
)
v5Overview.element.addEventListener(
  brushEvent,
  (event: Event) => {
    const selection = (event as CustomEvent<BrushSelection>).detail
    const selectedTime = selection.scales.t
    if (!selectedTime) return
    v5Time.domain.set(selectedTime)
    v5Status.textContent = 'Overview brush selection updated the main chart.'
  },
  events,
)
for (const type of ['wheel', 'dblclick', 'pointerup']) {
  v5Main.element.addEventListener(type, syncV5Navigator, events)
}
v5Main.element.addEventListener(
  'pointermove',
  (event: PointerEvent) => {
    if (event.buttons === 1 && !event.shiftKey) syncV5Navigator()
  },
  events,
)

v4Reset.addEventListener(
  'click',
  () => {
    v4Main.redraw({ x: { domain: initialDomain } })
    v4Brush.setBrushDomain({ x: initialDomain })
    v4Status.textContent = 'v4 domains reset.'
  },
  events,
)
v5Reset.addEventListener(
  'click',
  () => {
    v5Time.domain.set(v5InitialDomain)
    v5Navigator.setSelection({ mode: 'x', scales: { t: v5InitialDomain } })
    v5Status.textContent = 'v5 domains reset.'
  },
  events,
)
v4Status.textContent =
  'Drag the overview brush to update the main chart; main-domain changes sync back.'
v5Status.textContent = 'Brush either chart to update and synchronize its time domain.'

const toIso = (range: readonly (number | string)[] | undefined) =>
  range?.map((value) => new Date(Number(value)).toISOString()) ?? null
const snapshotEffect = effect(() => {
  v5Snapshot.textContent = JSON.stringify(
    {
      time: toIso(v5Time.domain.get()),
      value: v5Value.domain.get(),
      navigator: toIso(v5Navigator.selection.get()?.scales.t),
    },
    null,
    2,
  )
})

function dispose() {
  events.abort()
  snapshotEffect.dispose()
  v5Overview.destroy()
}
window.addEventListener(
  'pagehide',
  (event) => {
    if (!event.persisted) dispose()
  },
  events,
)
import.meta.hot?.dispose(dispose)

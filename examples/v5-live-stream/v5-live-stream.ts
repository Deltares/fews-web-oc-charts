import '../shared/v5.css'
import {
  axis,
  bar,
  batch,
  brush,
  createPlot,
  createSeries,
  createTable,
  crosshair,
  effect,
  linearScale,
  pan,
  series,
  sharedPointer,
  sharedSelection,
  stackedArea,
  timeScale,
  zoom,
  type Plot,
  type PlotConfig,
} from '@lib'

function required<T extends HTMLElement>(selector: string) {
  const node = document.querySelector<T>(selector)
  if (!node) throw new Error(`The live-stream example is missing ${selector}.`)
  return node
}
const overviewHost = required('#overview')
const detailHost = required('#detail')
const appendButton = required<HTMLButtonElement>('#append')
const streamButton = required<HTMLButtonElement>('#stream')
const followButton = required<HTMLButtonElement>('#follow')
const pauseButton = required<HTMLButtonElement>('#pause-detail')
const toggleButton = required<HTMLButtonElement>('#toggle-detail')
const clearButton = required<HTMLButtonElement>('#clear-selection')
const snapshot = required('#snapshot')

const minute = 60_000
const start = Date.UTC(2026, 0, 1)
const batchSize = 4
const seriesRetention = 1440
const tableRetention = 720
// Deterministic samples: sample index i is also the table's sample ID.
const sample = {
  t: (i: number) => start + i * minute,
  level: (i: number) => 5 + 2 * Math.sin(i / 40),
  inflow: (i: number) => 2.5 + Math.sin(i / 17),
  lateral: (i: number) => (i % 97 === 0 ? Number.NaN : 1.5 * Math.sin(i / 11)),
  abstraction: (i: number) => -0.6 - 0.4 * Math.cos(i / 23),
}
function rows(from: number, count: number) {
  const index = Array.from({ length: count }, (_, offset) => from + offset)
  return {
    t: index.map(sample.t),
    inflow: index.map(sample.inflow),
    lateral: index.map(sample.lateral),
    abstraction: index.map(sample.abstraction),
  }
}

let next = tableRetention
let appended = 0
const history = rows(0, next)
const level = createSeries(
  { x: history.t, y: history.t.map((_, i) => sample.level(i)) },
  { maxPoints: seriesRetention },
)
const flows = createTable(history, { x: 't', maxPoints: tableRetention })

const t = timeScale({ timeZone: 'UTC', follow: { window: '2h' } })
const q = linearScale({ domain: [-3, 10] })
const pointer = sharedPointer({ by: 'xy' })
const selection = sharedSelection()
const panning = pan({ mode: 'x' })
const zooming = zoom({ mode: 'x', wheel: 'x' })
const layers = [
  { id: 'inflow', y: 'inflow', label: 'Inflow', fill: '#4477aa' },
  { id: 'lateral', y: 'lateral', label: 'Lateral', fill: '#228833' },
  { id: 'abstraction', y: 'abstraction', label: 'Abstraction', fill: '#cc6677' },
]
const timeLabel = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})
const events = new AbortController()

function levelMark() {
  return series(level, { id: 'level', x: 't', y: 'q', line: { stroke: '#ee7733', width: 2 } })
}

function mount(element: HTMLElement, title: string, marks: PlotConfig['marks']) {
  return createPlot(element, {
    title,
    scales: { t, q },
    axes: [
      axis('t', {
        position: 'bottom',
        label: 'Time (UTC)',
        tickCount: 5,
        grid: true,
        format: (value) => timeLabel.format(Number(value)),
      }),
      axis('q', { position: 'left', label: 'Flow', unit: 'm3/s', grid: true }),
    ],
    marks,
    plugins: [
      panning,
      zooming,
      crosshair({ pointer, labels: { x: 't', y: 'q' } }),
      brush({ mode: 'x', persistent: true, selection }),
    ],
  })
}

const overview = mount(overviewHost, 'Overview', [
  stackedArea(flows, { id: 'stack', x: 't', scales: { x: 't', y: 'q' }, layers, opacity: 0.75 }),
  levelMark(),
])
function mountDetail() {
  return mount(detailHost, 'Detail', [
    bar(flows, {
      id: 'bars',
      x: 't',
      scales: { x: 't', y: 'q' },
      layers,
      layout: 'grouped',
      width: 4,
    }),
    levelMark(),
  ])
}
let detail: Plot | undefined = mountDetail()

function append(batches = 1) {
  for (let count = 0; count < batches; count += 1) {
    const incoming = rows(next, batchSize)
    const index = incoming.t.map((_, offset) => next + offset)
    // One batch: a single follow/domain update for both stores.
    batch(() => {
      level.append({ x: incoming.t, y: index.map(sample.level) })
      flows.append(incoming)
    })
    next += batchSize
  }
  appended += batches
}

const iso = (value: unknown) => new Date(Number(value)).toISOString()
const scaleName = (scale: unknown) => (scale === t ? 't' : scale === q ? 'q' : 'other')
function write() {
  const current = selection.selection.get()
  const state = pointer.state.get()
  snapshot.textContent = JSON.stringify(
    {
      following: t.following.get(),
      domain: t.domain.get().map(iso),
      series: {
        length: level.length,
        first: iso(level.xAt(0)),
        last: iso(level.xAt(level.length - 1)),
      },
      table: {
        length: flows.length,
        firstId: flows.sampleId(0),
        lastId: flows.sampleId(flows.length - 1),
      },
      selection:
        current?.ranges.map((entry) => ({
          scale: scaleName(entry.scale),
          range: entry.range.map(iso),
        })) ?? null,
      pointer: {
        active: state.active,
        values: state.values.map((entry) => ({
          scale: scaleName(entry.scale),
          value: entry.scale === t ? iso(entry.value) : entry.value,
        })),
      },
      overview: { paused: overview.paused },
      detail: detail ? { mounted: true, paused: detail.paused } : { mounted: false },
      batches: appended,
    },
    null,
    2,
  )
  followButton.textContent = t.following.get() ? 'Pause follow' : 'Resume follow'
}
// Tracks shared state and both plots' suspension; appends call write() explicitly.
let snapshotEffect = effect(write)
function refresh() {
  snapshotEffect.dispose()
  snapshotEffect = effect(write)
}

let timer: ReturnType<typeof setInterval> | undefined
function setStreaming(on: boolean) {
  if (timer !== undefined) clearInterval(timer)
  timer = on
    ? setInterval(() => {
        append()
        write()
      }, 250)
    : undefined
  streamButton.textContent = on ? 'Stop stream' : 'Start stream'
  streamButton.setAttribute('aria-pressed', String(on))
}

appendButton.addEventListener(
  'click',
  () => {
    append()
    write()
  },
  events,
)
streamButton.addEventListener('click', () => setStreaming(timer === undefined), events)
followButton.addEventListener(
  'click',
  () => (t.following.get() ? t.pauseFollow() : t.resumeFollow()),
  events,
)
pauseButton.addEventListener(
  'click',
  () => {
    if (!detail) return
    const pause = pauseButton.getAttribute('aria-pressed') !== 'true'
    if (pause) detail.pause()
    else detail.resume()
    pauseButton.textContent = pause ? 'Resume detail' : 'Pause detail'
    pauseButton.setAttribute('aria-pressed', String(pause))
  },
  events,
)
toggleButton.addEventListener(
  'click',
  () => {
    if (detail) {
      detail.destroy()
      detail = undefined
    } else {
      detail = mountDetail()
    }
    pauseButton.disabled = !detail
    pauseButton.textContent = 'Pause detail'
    pauseButton.setAttribute('aria-pressed', 'false')
    toggleButton.textContent = detail ? 'Destroy detail' : 'Recreate detail'
    refresh()
  },
  events,
)
clearButton.addEventListener('click', () => selection.setSelection(undefined), events)

// Exposed for console inspection and the acceptance runner (scripts/phase4-live-stream.mjs).
const liveStream = {
  t,
  q,
  pointer,
  selection,
  level,
  flows,
  layers,
  sample,
  batchSize,
  get next() {
    return next
  },
  get overview() {
    return overview
  },
  get detail() {
    return detail
  },
  append(batches = 1) {
    append(batches)
    write()
  },
}
declare global {
  interface Window {
    liveStream: typeof liveStream
  }
}
window.liveStream = liveStream

function dispose() {
  setStreaming(false)
  events.abort()
  snapshotEffect.dispose()
  overview.destroy()
  detail?.destroy()
}
window.addEventListener(
  'pagehide',
  (event) => {
    if (!event.persisted) dispose()
  },
  events,
)
import.meta.hot?.dispose(dispose)

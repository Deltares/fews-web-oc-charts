import '../shared/spike.css'
import { createColumnarSeries } from '../../src/spike/data/columnar-series.js'
import { createSvgLineRenderer } from '../../src/spike/render/svg-line.js'
import type { SvgLineRenderer } from '../../src/spike/render/svg-line.js'
import { findTransitions, zoneOffset, zonedTicks } from '../../src/spike/time/zoned-time.js'

const svg = document.querySelector<SVGSVGElement>('#chart')
const scenario = document.querySelector<HTMLSelectElement>('#scenario')
const description = document.querySelector<HTMLParagraphElement>('#description')
const caption = document.querySelector<HTMLElement>('#domain')
const ticksBody = document.querySelector<HTMLTableSectionElement>('#ticks')
if (!svg || !scenario || !description || !caption || !ticksBody) {
  throw new Error('The time-zone spike example is missing required elements.')
}

const scenarios = new Map([
  ['spring', { zone: 'Europe/Amsterdam', start: '2024-03-30T23:00:00Z' }],
  ['fall', { zone: 'Europe/Amsterdam', start: '2024-10-26T22:00:00Z' }],
  ['lord-howe', { zone: 'Australia/Lord_Howe', start: '2024-10-05T13:30:00Z' }],
  ['mexico', { zone: 'America/Mexico_City', start: '2024-04-07T06:00:00Z' }],
  ['kolkata', { zone: 'Asia/Kolkata', start: '2024-03-30T18:30:00Z' }],
  ['utc', { zone: 'UTC', start: '2024-03-31T00:00:00Z' }],
])
const hour = 3_600_000
const events = new AbortController()
let renderer: SvgLineRenderer | undefined

function offsetLabel(offset: number) {
  const absolute = Math.abs(offset)
  return (
    `UTC${offset < 0 ? '-' : '+'}` +
    `${String(Math.floor(absolute / 60)).padStart(2, '0')}:` +
    String(absolute % 60).padStart(2, '0')
  )
}

const render = () => {
  const selected = scenarios.get(scenario.value)
  if (!selected) throw new Error(`Unknown time-zone scenario: ${scenario.value}`)
  const { zone } = selected
  const start = Date.parse(selected.start)
  const end = start + 6 * hour
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  const ticks = zonedTicks(zone, start, end, 'hour')
  const rows = ticks.map((instant) => {
    const row = document.createElement('tr')
    for (const text of [
      formatter.format(instant),
      offsetLabel(zoneOffset(zone, instant)),
      new Date(instant).toISOString(),
    ]) {
      const cell = document.createElement('td')
      cell.textContent = text
      row.append(cell)
    }
    return row
  })
  ticksBody.replaceChildren(...rows)
  const transitions = findTransitions(zone, start, end)
  description.textContent =
    `${zone}: ${ticks.length} local-hour ticks. ` +
    (transitions.length === 0
      ? 'No offset transition in this window.'
      : transitions
          .map(
            (transition) =>
              `${offsetLabel(transition.fromOffset)} to ${offsetLabel(transition.toOffset)} ` +
              `at ${new Date(transition.instant).toISOString()}.`,
          )
          .join(' '))
  caption.textContent = `${new Date(start).toISOString()} to ${new Date(end).toISOString()}`

  renderer?.destroy()
  const series = createColumnarSeries({
    x: Float64Array.from({ length: 361 }, (_, index) => start + index * 60_000),
    y: Float64Array.from({ length: 361 }, (_, index) => Math.sin(index / 25)),
  })
  renderer = createSvgLineRenderer(svg, series, {
    domain: [start, end],
    yDomain: [-1.2, 1.2],
    range: [0, 1000, 0, 240],
    stroke: '#168aad',
  })
}

scenario.addEventListener('change', render, events)
render()

function dispose() {
  events.abort()
  renderer?.destroy()
}

window.addEventListener(
  'pagehide',
  (event) => {
    if (!event.persisted) dispose()
  },
  events,
)
import.meta.hot?.dispose(dispose)

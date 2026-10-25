import './legend.css'
import {
  axis,
  createPlot,
  createSeries,
  createTable,
  createLegendSwatch,
  linearScale,
  legend,
  series,
  stackedArea,
  timeScale,
  type LegendEntry,
  type LegendPosition,
} from '@lib'
import { reactive } from '../../src/core/runtime.js'

const legendPositions = [
  'top',
  'bottom',
  'left',
  'right',
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
] as const

function isLegendPosition(value: string): value is LegendPosition {
  return legendPositions.some((candidate) => candidate === value)
}

function required<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`The legend example is missing "${selector}".`)
  return element
}

const events = new AbortController()
const scope = reactive.createScope()
const legendHost = required('#legend')
const status = required('#legend-status')
const renderer = required<HTMLSelectElement>('#renderer')
const legendPosition = required<HTMLSelectElement>('#legend-position')
const showGroups = required<HTMLInputElement>('#legend-groups')
const builtInLegend = legend({ position: 'top' })
const start = Date.UTC(2026, 0, 1)
const hour = 3_600_000
const times = Array.from({ length: 49 }, (_, index) => start + index * hour)
const upstream = times.map((_, index) => 25 + 8 * Math.sin(index / 5))
const lateral = times.map((_, index) => 12 + 5 * Math.cos(index / 7))
const forecastUpstream = upstream.map((value) => value * 1.15)
const forecastLateral = lateral.map((value) => value * 1.3)
const flows = createTable({ t: times, upstream, lateral, forecastUpstream, forecastLateral })
const observed = series(
  createSeries({ x: times, y: upstream.map((value, index) => value + lateral[index]) }),
  {
    id: 'observed',
    x: 't',
    y: 'q',
    label: 'Observed total',
    legendGroup: 'Observed',
    line: { stroke: '#222222', width: 2, strokeDasharray: '6 3' },
    markers: { fill: 'white', stroke: '#222222', strokeWidth: 1, size: 3 },
  },
)
const observedAreas = stackedArea(flows, {
  id: 'observed-contributions',
  label: 'Contributions',
  legendGroup: 'Observed',
  x: 't',
  scales: { x: 't', y: 'q' },
  opacity: 0.55,
  layers: [
    { id: 'upstream', y: 'upstream', label: 'Upstream', fill: '#4477aa' },
    { id: 'lateral', y: 'lateral', label: 'Lateral', fill: '#228833' },
  ],
})
const forecast = series(
  createSeries({
    x: times,
    y: forecastUpstream.map((value, index) => value + forecastLateral[index]),
  }),
  {
    id: 'forecast',
    x: 't',
    y: 'q',
    label: 'Forecast total',
    legendGroup: 'Forecast',
    line: { stroke: '#cc3311', width: 2 },
  },
)
const forecastAreas = stackedArea(flows, {
  id: 'forecast-contributions',
  label: 'Contributions',
  legendGroup: 'Forecast',
  x: 't',
  scales: { x: 't', y: 'q' },
  opacity: 0.55,
  layers: [
    { id: 'upstream', y: 'forecastUpstream', label: 'Upstream', fill: '#ee7733' },
    { id: 'lateral', y: 'forecastLateral', label: 'Lateral', fill: '#aa3377' },
  ],
})
const areas = [observedAreas, forecastAreas]
const plot = createPlot(required('#chart'), {
  title: 'Observed and forecast flow',
  scales: {
    t: timeScale({ domain: [start, start + 48 * hour], timeZone: 'UTC' }),
    q: linearScale({ nice: true }),
  },
  axes: [
    axis('t', { position: 'bottom', label: 'Time (UTC)', tickCount: 6 }),
    axis('q', { position: 'left', label: 'Flow', grid: true }),
  ],
  marks: [observedAreas, forecastAreas, observed, forecast],
})

function renderEntries(entries: readonly LegendEntry[]): HTMLUListElement {
  const list = document.createElement('ul')
  list.className = 'legend-list'
  for (const entry of entries) {
    const item = document.createElement('li')
    const row = document.createElement('div')
    row.className = 'legend-row'
    row.dataset.visibility = entry.visibility
    const label = document.createElement('label')
    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.id = `visibility-${entry.id}`
    checkbox.checked = entry.visibility === 'visible'
    checkbox.indeterminate = entry.visibility === 'mixed'
    checkbox.disabled = entry.disabled
    checkbox.dataset.entryId = entry.id
    checkbox.dataset.action = 'toggle'
    const swatch = createLegendSwatch(entry.symbol, { width: 36, height: 20 })
    swatch.classList.add('legend-swatch')
    label.append(checkbox, swatch, document.createTextNode(entry.label))
    const visibility = document.createElement('span')
    visibility.className = 'legend-visibility'
    visibility.textContent = entry.visibility
    const isolate = document.createElement('button')
    isolate.type = 'button'
    isolate.id = `isolate-${entry.id}`
    isolate.textContent = 'Isolate'
    isolate.setAttribute('aria-label', `Isolate ${entry.label}`)
    isolate.disabled = entry.disabled
    isolate.dataset.entryId = entry.id
    isolate.dataset.action = 'isolate'
    row.append(label, visibility, isolate)
    item.append(row)
    if (entry.children.length) item.append(renderEntries(entry.children))
    list.append(item)
  }
  return list
}

scope.run(() => {
  reactive.effect(() => {
    const focusedId = legendHost.contains(document.activeElement)
      ? document.activeElement?.id
      : undefined
    legendHost.replaceChildren(renderEntries(plot.legend.entries.get()))
    if (focusedId) document.getElementById(focusedId)?.focus()
  })
})

legendHost.addEventListener(
  'click',
  (event) => {
    if (!(event.target instanceof HTMLElement)) return
    const id = event.target.dataset.entryId
    if (!id) return
    if (event.target.dataset.action === 'toggle') plot.legend.toggle(id, 'external')
    else if (event.target.dataset.action === 'isolate') plot.legend.isolate(id, 'external')
  },
  events,
)
required('#show-all').addEventListener('click', () => plot.legend.showAll('external'), events)
required('#toggle-built-in').addEventListener(
  'click',
  (event) => {
    const button = event.currentTarget
    if (!(button instanceof HTMLButtonElement)) throw new Error('Expected a button.')
    const enabled = button.dataset.enabled !== 'true'
    button.dataset.enabled = String(enabled)
    button.textContent = enabled ? 'Remove built-in SVG legend' : 'Add built-in SVG legend'
    plot.update({ plugins: enabled ? [builtInLegend] : [] })
  },
  events,
)
legendPosition.addEventListener(
  'change',
  () => {
    const position = legendPosition.value
    if (!isLegendPosition(position)) {
      throw new Error(`Unknown legend position "${position}".`)
    }
    builtInLegend.update({ position })
  },
  events,
)
showGroups.addEventListener(
  'change',
  () => builtInLegend.update({ showGroups: showGroups.checked }),
  events,
)
required('#toggle-observed').addEventListener(
  'click',
  () => observed.update({ visible: !observed.visible }),
  events,
)
renderer.addEventListener(
  'change',
  () => {
    if (renderer.value !== 'svg' && renderer.value !== 'canvas') {
      throw new Error(`Unknown area renderer "${renderer.value}".`)
    }
    for (const mark of areas) mark.update({ renderer: renderer.value })
  },
  events,
)
plot.element.addEventListener(
  'legendtoggle',
  (event) => {
    if (!(event instanceof CustomEvent)) throw new Error('Expected a legendtoggle CustomEvent.')
    status.textContent = JSON.stringify(event.detail)
  },
  events,
)

function dispose() {
  events.abort()
  scope.dispose()
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

import '../shared/v5.css'
import {
  axis,
  bar,
  createPlot,
  createTable,
  linear,
  time,
  type BarLayer,
  type BarMark,
  type Plot,
} from '@lib'

function required<T extends HTMLElement>(selector: string) {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`The bars example is missing ${selector}.`)
  return element
}
const lateral = required<HTMLInputElement>('#lateral')
const forecast = required<HTMLInputElement>('#forecast')
const reverse = required<HTMLInputElement>('#reverse')
const events = new AbortController()
const hour = 3_600_000
const start = Date.UTC(2026, 1, 12)
const initial = {
  t: [0, 1, 3, 4, 7].map((offset) => start + offset * hour),
  end: [1, 3, 4, 7, 8].map((offset) => start + offset * hour),
  upstream: [3, 4, 5, 2, 6],
  lateral: [2, -2, NaN, 3, -1],
  forecastUpstream: [4, 3, 6, 4, 7],
  forecastLateral: [1, -1, 2, -2, 2],
}
const data = createTable(initial, { maxPoints: 8 })
const descriptors: readonly BarLayer[] = [
  { id: 'upstream', y: 'upstream', label: 'Observed upstream', fill: '#4477aa', stack: 'observed' },
  { id: 'lateral', y: 'lateral', label: 'Observed lateral', fill: '#228833', stack: 'observed' },
  {
    id: 'forecast-upstream',
    y: 'forecastUpstream',
    label: 'Forecast upstream',
    fill: '#66ccee',
    stack: 'forecast',
  },
  {
    id: 'forecast-lateral',
    y: 'forecastLateral',
    label: 'Forecast lateral',
    fill: '#aa3377',
    stack: 'forecast',
  },
]
let reversedOrder = false
function layers(named: boolean, observedOnly: boolean) {
  const entries = (reversedOrder ? [...descriptors].reverse() : descriptors).filter(
    (layer) => !observedOnly || layer.stack === 'observed',
  )
  return entries.map(({ stack, ...layer }) => ({
    ...layer,
    ...(named ? { stack } : {}),
    visible:
      (layer.id !== 'lateral' || lateral.checked) && (stack !== 'forecast' || forecast.checked),
  }))
}

const plots: Plot[] = []
const marks: { mark: BarMark; named: boolean; observedOnly: boolean }[] = []
const timeScales: ReturnType<typeof time>[] = []
for (const [id, layout, named, horizontal] of [
  ['grouped', 'grouped', false, false],
  ['stacked', 'stacked', false, false],
  ['named', 'stacked', true, false],
  ['horizontal', 'stacked', true, true],
] as const) {
  const observedOnly = id === 'stacked'
  const t = time({ timeZone: 'UTC' })
  timeScales.push(t)
  const mark = bar(data, {
    id,
    x: 't',
    scales: { x: 't', y: 'q' },
    layout,
    layers: layers(named, observedOnly),
    interval: { start: 't', end: 'end' },
    orientation: horizontal ? 'horizontal' : 'vertical',
  })
  marks.push({ mark, named, observedOnly })
  plots.push(
    createPlot(required(`#${id}`), {
      title: `${id[0].toUpperCase()}${id.slice(1)} bars`,
      scales: { t, q: linear({ nice: true }) },
      axes: [
        axis('t', { position: horizontal ? 'left' : 'bottom', label: 'Time (UTC)', tickCount: 5 }),
        axis('q', { position: horizontal ? 'bottom' : 'left', label: 'Flow', grid: true }),
      ],
      marks: [mark],
    }),
  )
}

function updateLayers() {
  for (const { mark, named, observedOnly } of marks)
    mark.update({ layers: layers(named, observedOnly) })
}
for (const control of [lateral, forecast]) control.addEventListener('change', updateLayers, events)
reverse.addEventListener(
  'change',
  () => {
    for (const t of timeScales) t.update({ reverse: reverse.checked })
  },
  events,
)
required('#reorder').addEventListener(
  'click',
  () => {
    reversedOrder = !reversedOrder
    updateLayers()
  },
  events,
)
required('#append').addEventListener(
  'click',
  () => {
    const next = Number(data.valueAt('end', data.length - 1))
    const index = (next - start) / hour
    data.append({
      t: [next],
      end: [next + ((index % 3) + 1) * hour],
      upstream: [3 + (index % 5)],
      lateral: [index % 2 ? -2 : 2],
      forecastUpstream: [4 + (index % 4)],
      forecastLateral: [(index % 3) - 1],
    })
  },
  events,
)
required('#reset').addEventListener('click', () => data.replace(initial), events)

function dispose() {
  events.abort()
  plots.forEach((plot) => plot.destroy())
}
window.addEventListener(
  'pagehide',
  (event) => {
    if (!event.persisted) dispose()
  },
  events,
)
import.meta.hot?.dispose(dispose)

import '../shared/v5.css'
import {
  axis,
  createPlot,
  createTable,
  linear,
  stackedArea,
  time,
  type Plot,
  type StackedAreaLayer,
  type StackedAreaMark,
} from '@lib'

function required<T extends HTMLElement>(selector: string) {
  const node = document.querySelector<T>(selector)
  if (!node) throw new Error(`The stacked area example is missing ${selector}.`)
  return node
}
const lateral = required<HTMLInputElement>('#lateral')
const forecast = required<HTMLInputElement>('#forecast')
const step = required<HTMLInputElement>('#step')
const reverse = required<HTMLInputElement>('#reverse')
const renderer = required<HTMLSelectElement>('#renderer')
renderer.value =
  new URLSearchParams(location.search).get('renderer') === 'canvas' ? 'canvas' : 'svg'
const events = new AbortController()
const hour = 3_600_000
const start = Date.UTC(2026, 1, 12)
const initial = {
  t: [0, 1, 2, 3, 5, 6, 7, 9].map((offset) => start + offset * hour),
  upstream: [3, 4, 5, 2, 6, 4, 3, 5],
  lateral: [2, -2, NaN, 3, -1, 2, -2, 1],
  forecastUpstream: [4, 3, 6, 4, 7, 5, 4, 6],
  forecastLateral: [1, -1, 2, -2, 2, 1, -1, 2],
}
const data = createTable(initial, { maxPoints: 12 })
const descriptors: readonly StackedAreaLayer[] = [
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
function layers(named: boolean) {
  return (reversedOrder ? [...descriptors].reverse() : descriptors)
    .filter((layer) => named || layer.stack === 'observed')
    .map(({ stack, ...layer }) => ({
      ...layer,
      ...(named ? { stack } : {}),
      visible:
        (layer.id !== 'lateral' || lateral.checked) && (stack !== 'forecast' || forecast.checked),
    }))
}
const plots: Plot[] = []
const marks: { mark: StackedAreaMark; named: boolean }[] = []
const timeScales: ReturnType<typeof time>[] = []
for (const named of [false, true]) {
  const id = named ? 'named' : 'implicit'
  const t = time({ timeZone: 'UTC' })
  timeScales.push(t)
  const mark = stackedArea(data, {
    renderer: renderer.value === 'canvas' ? 'canvas' : 'svg',
    id,
    x: 't',
    scales: { x: 't', y: 'q' },
    layers: layers(named),
    opacity: named ? 0.65 : 0.85,
  })
  marks.push({ mark, named })
  plots.push(
    createPlot(required(`#${id}`), {
      title: named ? 'Independent named stacks (overlaid)' : 'One implicit stack',
      scales: { t, q: linear({ nice: true }) },
      axes: [
        axis('t', { position: 'bottom', label: 'Time (UTC)', tickCount: 6 }),
        axis('q', { position: 'left', label: 'Flow', grid: true }),
      ],
      marks: [mark],
    }),
  )
}
function updateLayers() {
  for (const { mark, named } of marks) mark.update({ layers: layers(named) })
}
renderer.addEventListener(
  'change',
  () => {
    for (const { mark } of marks)
      mark.update({ renderer: renderer.value === 'canvas' ? 'canvas' : 'svg' })
  },
  events,
)
for (const control of [lateral, forecast]) control.addEventListener('change', updateLayers, events)
step.addEventListener(
  'change',
  () => {
    for (const { mark } of marks) mark.update({ curve: step.checked ? 'step' : 'linear' })
  },
  events,
)
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
    const next = Number(data.valueAt('t', data.length - 1)) + hour
    const index = (next - start) / hour
    data.append({
      t: [next],
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

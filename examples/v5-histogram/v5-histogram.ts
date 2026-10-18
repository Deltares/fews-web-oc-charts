import '../shared/v5.css'
import { axis, createPlot, createTable, histogram, linear } from '@lib'

function required<T extends HTMLElement>(selector: string) {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`The histogram example is missing ${selector}.`)
  return element
}
const initial = [3, 0, 1, 1, 2, 0.5, 4, 6, 7, 8, 8, 10, NaN, -1, 11]
const rows = (values: number[]) => ({
  row: values.map((_, index) => index),
  sample: values,
})
const data = createTable(rows(initial))
const renderer = required<HTMLSelectElement>('#renderer')
renderer.value =
  new URLSearchParams(location.search).get('renderer') === 'canvas' ? 'canvas' : 'svg'
let mark = histogram(data, {
  id: 'distribution',
  x: 'sample',
  scales: { x: 'sample', y: 'frequency' },
  bins: [0, 1, 3, 6, 10],
  renderer: renderer.value === 'canvas' ? 'canvas' : 'svg',
  fill: '#4477aa',
})
const sample = linear()
const frequency = linear({ nice: true })
let sampleAxis = axis('sample', { position: 'bottom', label: 'Sample' })
let frequencyAxis = axis('frequency', { position: 'left', label: 'Count', grid: true })
const plot = createPlot(required('#histogram'), {
  title: 'Sample distribution',
  scales: { sample, frequency },
  axes: [sampleAxis, frequencyAxis],
  marks: [mark],
})
function summary() {
  required('#summary').textContent = mark.bins
    .map(
      (bin, index, bins) =>
        `[${bin.start}, ${bin.end}${index === bins.length - 1 ? ']' : ')'}: ${bin.count}`,
    )
    .join('; ')
}
const events = new AbortController()
renderer.addEventListener(
  'change',
  () => {
    mark.update({ renderer: renderer.value === 'canvas' ? 'canvas' : 'svg' })
  },
  events,
)
required<HTMLSelectElement>('#normalization').addEventListener(
  'change',
  (event) => {
    const value = (event.currentTarget as HTMLSelectElement).value
    if (value !== 'count' && value !== 'probability' && value !== 'density')
      throw new Error('Invalid histogram normalization.')
    mark.update({ normalization: value })
    frequencyAxis.update({ label: value })
  },
  events,
)
const horizontal = required<HTMLInputElement>('#horizontal')
horizontal.addEventListener(
  'change',
  () => {
    const replacement = histogram(data, {
      ...mark.options.get().resolved,
      orientation: horizontal.checked ? 'horizontal' : 'vertical',
    })
    const nextSampleAxis = axis('sample', {
      position: horizontal.checked ? 'left' : 'bottom',
      label: 'Sample',
    })
    const nextFrequencyAxis = axis('frequency', {
      position: horizontal.checked ? 'bottom' : 'left',
      label: mark.options.get().resolved.normalization,
      grid: true,
    })
    plot.update({ marks: [replacement], axes: [nextSampleAxis, nextFrequencyAxis] })
    mark = replacement
    sampleAxis = nextSampleAxis
    frequencyAxis = nextFrequencyAxis
  },
  events,
)
const reverse = required<HTMLInputElement>('#reverse')
reverse.addEventListener('change', () => sample.update({ reverse: reverse.checked }), events)
required('#append').addEventListener(
  'click',
  () => {
    const start = data.length
    data.append({ row: [start, start + 1, start + 2], sample: [1, 3, 10] })
    summary()
  },
  events,
)
let equal = false
required('#rebin').addEventListener(
  'click',
  () => {
    equal = !equal
    mark.update({ bins: equal ? 5 : [0, 1, 3, 6, 10], domain: equal ? [0, 10] : undefined })
    summary()
  },
  events,
)
required('#clear').addEventListener(
  'click',
  () => {
    data.clear()
    summary()
  },
  events,
)
required('#reset').addEventListener(
  'click',
  () => {
    data.replace(rows(initial))
    summary()
  },
  events,
)
summary()
window.addEventListener(
  'pagehide',
  () => {
    events.abort()
    plot.destroy()
  },
  { once: true },
)

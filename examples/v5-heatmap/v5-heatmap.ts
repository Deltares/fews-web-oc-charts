import '../shared/v5.css'
import {
  axis,
  colorScale,
  createGrid,
  createPlot,
  crosshair,
  heatmap,
  linearScale,
  timeScale,
  tooltip,
} from '@lib'

function required<T extends HTMLElement>(selector: string) {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`The heatmap example is missing ${selector}.`)
  return element
}
const start = Date.UTC(2026, 0, 1)
const hour = 3600000
const xEdges = [0, 1, 3, 6, 10, 16, 24].map((hourOffset) => start + hourOffset * hour)
const yEdges = [0, 1, 3, 7, 12]
const color = colorScale({ domain: [0, 20], colors: ['#2166ac', '#f7f7f7', '#b2182b'] })
const values = Array.from({ length: 24 }, (_, i) => (i === 8 ? NaN : (i * 5) % 21))
const data = createGrid({ xEdges, yEdges, values })
const comparison = createGrid({ xEdges, yEdges, values: values.map((value) => value * 0.6) })
const renderer = required<HTMLSelectElement>('#renderer')
renderer.value =
  new URLSearchParams(location.search).get('renderer') === 'canvas' ? 'canvas' : 'svg'
const marks = [data, comparison].map((grid) =>
  heatmap(grid, {
    scales: { x: 'time', y: 'level' },
    color,
    renderer: renderer.value === 'canvas' ? 'canvas' : 'svg',
  }),
)
const levels = [linearScale(), linearScale()]
const plots = marks.map((mark, index) => {
  const guide = crosshair({
    mode: 'xy',
    snap: { mark, axis: 'xy' },
    labels: { x: 'time', y: 'level' },
  })
  return createPlot(required(index ? '#comparison' : '#heatmap'), {
    height: 300,
    scales: { time: timeScale(), level: levels[index] },
    axes: [
      axis('time', { position: 'bottom' }),
      axis('level', { position: 'left', label: 'Level' }),
    ],
    marks: [mark],
    plugins: [guide, tooltip({ crosshair: guide })],
  })
})
const events = new AbortController()
renderer.addEventListener(
  'change',
  () => {
    marks.forEach((mark) =>
      mark.update({ renderer: renderer.value === 'canvas' ? 'canvas' : 'svg' }),
    )
  },
  events,
)
const reverse = required<HTMLInputElement>('#reverse')
reverse.addEventListener(
  'change',
  () => levels.forEach((level) => level.update({ reverse: reverse.checked })),
  events,
)
let alternate = false
required('#palette').addEventListener(
  'click',
  () => {
    alternate = !alternate
    color.update({
      colors: alternate ? ['#ffffcc', '#41b6c4', '#253494'] : ['#2166ac', '#f7f7f7', '#b2182b'],
    })
  },
  events,
)
let offset = 0
required('#replace').addEventListener(
  'click',
  () => {
    offset++
    data.replace({ xEdges, yEdges, values: values.map((value) => (value + offset * 3) % 21) })
  },
  events,
)
required<HTMLInputElement>('#visible').addEventListener(
  'change',
  (event) => marks[0].update({ visible: (event.currentTarget as HTMLInputElement).checked }),
  events,
)
window.addEventListener(
  'pagehide',
  () => {
    events.abort()
    plots.forEach((plot) => plot.destroy())
  },
  { once: true },
)

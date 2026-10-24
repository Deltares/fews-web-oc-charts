import '../shared/v5.css'
import {
  axis,
  bar,
  bandScale,
  createPlot,
  createTable,
  crosshair,
  line,
  linearScale,
  stackedArea,
  timeScale,
  tooltip,
} from '@lib'

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`The crosshair example is missing "${selector}".`)
  return element
}

const host = required<HTMLElement>('#chart')
const mode = required<HTMLSelectElement>('#mode')
const snapAxis = required<HTMLSelectElement>('#snap-axis')
const status = required<HTMLElement>('#status')
const events = new AbortController()
const start = Date.UTC(2026, 0, 1)
const hour = 3_600_000
const times = Float64Array.from({ length: 49 }, (_, index) => start + index * hour)
const values = Float64Array.from(
  { length: 49 },
  (_, index) => 44 + 22 * Math.sin(index / 3) + 13 * Math.cos(index / 7),
)
const observations = line({
  x: 't',
  y: 'q',
  xValues: times,
  yValues: values,
  stroke: '#1677a6',
  strokeWidth: 2,
})
const interaction = crosshair({ mode: 'xy' })
const barMark = bar(
  createTable({
    t: ['01:00', '02:00', '03:00', '04:00', '05:00'],
    observed: [4, 6, 3, 5, 4],
    forecast: [2, 1, 4, 3, 5],
  }),
  {
    id: 'hourly-flow',
    x: 't',
    scales: { x: 't', y: 'q' },
    layout: 'stacked',
    layers: [
      { id: 'observed', y: 'observed', label: 'Observed', fill: '#1677a6' },
      { id: 'forecast', y: 'forecast', label: 'Forecast', fill: '#d17b0f' },
    ],
  },
)
const areaMark = stackedArea(
  createTable({
    t: [0, 1, 2, 3, 4],
    observed: [4, 5, 3, 6, 4],
    forecast: [2, 1, 3, 2, 4],
  }),
  {
    id: 'hourly-flow-area',
    x: 't',
    scales: { x: 't', y: 'q' },
    layers: [
      { id: 'observed', y: 'observed', label: 'Observed', fill: '#1677a6' },
      { id: 'forecast', y: 'forecast', label: 'Forecast', fill: '#d17b0f' },
    ],
  },
)
const barCrosshair = crosshair({ mode: 'xy', labels: { x: 't', y: 'q' } })
const areaCrosshair = crosshair({ mode: 'xy', labels: { x: 't', y: 'q' } })
const crosshairs = [interaction, barCrosshair, areaCrosshair]
const snapMarks = [observations, barMark, areaMark]
const plot = createPlot(host, {
  title: 'Hourly observations',
  scales: {
    t: timeScale({ domain: [start, start + 48 * hour], timeZone: 'UTC' }),
    q: linearScale({ domain: [0, 100] }),
  },
  axes: [
    axis('t', { position: 'bottom', label: 'Time (UTC)', tickCount: 6 }),
    axis('q', { position: 'left', label: 'Value', grid: true }),
  ],
  marks: [observations],
  plugins: [interaction],
})
const barPlot = createPlot(required<HTMLElement>('#bar-chart'), {
  title: 'Stacked hourly flow',
  scales: {
    t: bandScale({ domain: ['01:00', '02:00', '03:00', '04:00', '05:00'] }),
    q: linearScale({ domain: [0, 10] }),
  },
  axes: [
    axis('t', { position: 'bottom', label: 'Hour' }),
    axis('q', { position: 'left', label: 'Flow', grid: true }),
  ],
  marks: [barMark],
  plugins: [barCrosshair, tooltip({ marks: [barMark], crosshair: barCrosshair })],
})
const areaPlot = createPlot(required<HTMLElement>('#area-chart'), {
  title: 'Observed and forecast flow',
  scales: {
    t: linearScale({ domain: [0, 4] }),
    q: linearScale({ domain: [0, 10] }),
  },
  axes: [
    axis('t', { position: 'bottom', label: 'Sample' }),
    axis('q', { position: 'left', label: 'Flow', grid: true }),
  ],
  marks: [areaMark],
  plugins: [areaCrosshair, tooltip({ marks: [areaMark], crosshair: areaCrosshair })],
})

function updateStatus() {
  status.textContent = `Showing ${mode.value === 'xy' ? 'both' : mode.value === 'x' ? 'vertical' : 'horizontal'} guide${mode.value === 'xy' ? 's' : ''}.`
}

mode.addEventListener(
  'change',
  () => {
    if (mode.value !== 'x' && mode.value !== 'y' && mode.value !== 'xy') {
      throw new Error(`Unknown crosshair mode "${mode.value}".`)
    }
    for (const guide of crosshairs) guide.update({ mode: mode.value })
    updateStatus()
  },
  events,
)
updateStatus()
snapAxis.addEventListener(
  'change',
  () => {
    const axis = snapAxis.value
    if (axis !== 'none' && axis !== 'x' && axis !== 'y' && axis !== 'xy') {
      throw new Error(`Unknown crosshair snap axis "${axis}".`)
    }
    for (let index = 0; index < crosshairs.length; index += 1) {
      crosshairs[index].update({
        snap: axis === 'none' ? undefined : { mark: snapMarks[index], axis },
      })
    }
  },
  events,
)
window.addEventListener(
  'pagehide',
  () => {
    events.abort()
    plot.destroy()
    barPlot.destroy()
    areaPlot.destroy()
  },
  { once: true },
)

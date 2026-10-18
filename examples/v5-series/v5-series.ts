import '../shared/v5.css'
import { axis, createPlot, createSeries, linear, series, time } from '@lib'

const host = document.querySelector<HTMLElement>('#chart')
const showLine = document.querySelector<HTMLInputElement>('#show-line')
const showMarkers = document.querySelector<HTMLInputElement>('#show-markers')
const showArea = document.querySelector<HTMLInputElement>('#show-area')
const appendButton = document.querySelector<HTMLButtonElement>('#append')
const replaceButton = document.querySelector<HTMLButtonElement>('#replace')
if (!host || !showLine || !showMarkers || !showArea || !appendButton || !replaceButton) {
  throw new Error('The series example is missing required elements.')
}

const hour = 3_600_000
const start = Date.UTC(2026, 1, 12)
const times = Float64Array.from({ length: 19 }, (_, index) => start + index * hour)
const discharge = Float64Array.from(
  { length: 19 },
  (_, index) => 24 + 13 * Math.sin(index / 2.3) + index * 1.8,
)
discharge[8] = Number.NaN
discharge[9] = Number.NaN

const events = new AbortController()
const data = createSeries({ x: times, y: discharge }, { maxPoints: 48 })
const observed = series(data, {
  id: 'observed-discharge',
  x: 't',
  y: 'q',
  line: { stroke: '#1677a6', width: 2 },
  markers: showMarkers.checked
    ? { size: 4, fill: '#ffffff', stroke: '#1677a6', strokeWidth: 1.5 }
    : false,
  area: showArea.checked ? { to: 0, fill: '#1677a6', opacity: 0.18 } : false,
})

const t = time({ domain: [start, start + 18 * hour], timeZone: 'UTC' })
const plot = createPlot(host, {
  title: 'Observed discharge',
  scales: {
    t,
    q: linear({ domain: [0, 80], includeZero: true }),
  },
  axes: [
    axis('t', { position: 'bottom', label: 'Time (UTC)', tickCount: 5 }),
    axis('q', { position: 'left', label: 'Discharge', unit: 'm³/s', grid: true }),
  ],
  marks: [observed],
})

for (const control of [showLine, showMarkers, showArea]) {
  control.addEventListener(
    'change',
    () =>
      observed.update({
        line: showLine.checked ? { stroke: '#1677a6', width: 2 } : false,
        markers: showMarkers.checked
          ? { size: 4, fill: '#ffffff', stroke: '#1677a6', strokeWidth: 1.5 }
          : false,
        area: showArea.checked ? { to: 0, fill: '#1677a6', opacity: 0.18 } : false,
      }),
    events,
  )
}

appendButton.addEventListener(
  'click',
  () => {
    const next = data.xAt(data.length - 1) + hour
    const index = (next - start) / hour
    data.append({ x: [next], y: [24 + 13 * Math.sin(index / 2.3) + index * 0.6] })
    t.domain.set([data.xAt(0), next])
  },
  events,
)
replaceButton.addEventListener(
  'click',
  () => {
    data.replace({ x: times, y: discharge })
    t.domain.set([start, start + 18 * hour])
  },
  events,
)

function dispose() {
  events.abort()
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

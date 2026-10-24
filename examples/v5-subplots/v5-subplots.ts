import '../shared/v5.css'
import './v5-subplots.css'
import { axis, bar, createPlot, createTable, line, linearScale, timeScale } from '@lib'

const dischargeHost = document.querySelector<HTMLElement>('#discharge')
const rainfallHost = document.querySelector<HTMLElement>('#rainfall')
if (!dischargeHost || !rainfallHost) {
  throw new Error('The subplots example is missing required chart hosts.')
}

const hour = 3_600_000
const start = Date.UTC(2026, 0, 1)
const end = start + 24 * hour
const times = Float64Array.from({ length: 25 }, (_, index) => start + index * hour)
const discharge = Float64Array.from(
  { length: 25 },
  (_, index) => 32 + 18 * Math.sin(index / 3) + index * 0.8,
)
const rainfall = Float64Array.from(
  { length: 24 },
  (_, index) => 2 + 1.5 * Math.cos(index / 2.4) + index * 0.15,
)
const t = timeScale({ domain: [start, end], timeZone: 'UTC' })
const q = linearScale({ domain: [0, 80] })
const rain = linearScale({ domain: [0, 10], reverse: true })
const rainfallData = createTable({
  start: times.slice(0, -1),
  end: times.slice(1),
  rainfall,
})

// Classic inset axes with identical horizontal margins align both time projections,
// even when the independent y-axes have differently sized tick labels.
const top = createPlot(dischargeHost, {
  axisLayout: 'inset',
  margins: { left: 80, right: 24, top: 16, bottom: 16 },
  directions: { t: 'x' },
  scales: { t, q },
  axes: [
    axis('q', {
      style: 'classic',
      position: 'left',
      label: 'Discharge',
      unit: 'm3/s',
      grid: true,
    }),
  ],
  marks: [
    line({
      id: 'discharge',
      x: 't',
      y: 'q',
      xValues: times,
      yValues: discharge,
      stroke: '#1677a6',
      strokeWidth: 2,
    }),
  ],
})
const bottom = createPlot(rainfallHost, {
  axisLayout: 'inset',
  margins: { left: 80, right: 24, top: 16, bottom: 56 },
  scales: { t, rain },
  axes: [
    axis('t', { style: 'classic', position: 'bottom', label: 'Time (UTC)', tickCount: 4 }),
    axis('rain', {
      style: 'classic',
      position: 'left',
      label: 'Rainfall',
      unit: 'mm',
      grid: true,
    }),
  ],
  marks: [
    bar(rainfallData, {
      id: 'rainfall',
      x: 'start',
      y: 'rainfall',
      scales: { x: 't', y: 'rain' },
      interval: { start: 'start', end: 'end' },
      fill: '#d17b0f',
    }),
  ],
})

function dispose() {
  top.destroy()
  bottom.destroy()
}

window.addEventListener(
  'pagehide',
  (event) => {
    if (!event.persisted) dispose()
  },
  { once: true },
)
import.meta.hot?.dispose(dispose)

import '../shared/v5.css'
import { axis, createSkewTPlot, line, linearScale, logScale } from '@lib'

const host = document.querySelector<HTMLElement>('#chart')
const skew = document.querySelector<HTMLInputElement>('#skew')
const skewNumber = document.querySelector<HTMLInputElement>('#skew-number')
const readout = document.querySelector<HTMLOutputElement>('#readout')
if (!host || !skew || !skewNumber || !readout) {
  throw new Error('The skew-T example is missing its controls.')
}

const pressure = [1000, 925, 850, 700, 600, 500, 400, 300, 250, 200, 150, 100]
const temperature = [24, 19, 14, 4, -4, -14, -25, -40, -49, -56, -62, -66]
const dewPoint = [18, 15, 10, -2, -12, -24, -38, -50, -58, -65, -72, -76]

const plot = createSkewTPlot(host, {
  title: 'Synthetic weather sounding',
  background: 'plot',
  scales: {
    temperature: linearScale({ domain: [-40, 50] }),
    pressure: logScale({ domain: [100, 1000], reverse: true }),
  },
  axes: [
    axis('temperature', {
      position: 'bottom',
      label: 'Temperature',
      unit: 'C',
      grid: true,
      tickCount: 9,
    }),
    axis('pressure', { position: 'left', label: 'Pressure', unit: 'hPa', grid: true }),
  ],
  marks: [
    line({
      id: 'temperature',
      x: 'temperature',
      y: 'pressure',
      xValues: temperature,
      yValues: pressure,
      stroke: '#d33',
      strokeWidth: 2,
      markers: { size: 2.5 },
    }),
    line({
      id: 'dew-point',
      x: 'temperature',
      y: 'pressure',
      xValues: dewPoint,
      yValues: pressure,
      stroke: '#198754',
      strokeWidth: 2,
      strokeDasharray: '6 3',
    }),
  ],
})

const events = new AbortController()
for (const input of [skew, skewNumber]) {
  input.addEventListener(
    'input',
    () => {
      if (!input.reportValidity()) return
      const value = input.valueAsNumber
      plot.update({ skewT: { skew: value } })
      skew.value = skewNumber.value = String(value)
    },
    events,
  )
}
plot.element.addEventListener(
  'pointermove',
  (event) => {
    const bounds = plot.element.getBoundingClientRect()
    const size = plot.size.get()
    const x = ((event.clientX - bounds.left) / bounds.width) * size.width
    const y = ((event.clientY - bounds.top) / bounds.height) * size.height
    const region = plot.regions.get().plot
    if (
      x < region.x ||
      x > region.x + region.width ||
      y < region.y ||
      y > region.y + region.height
    ) {
      readout.value = 'Move over the sounding.'
      return
    }
    const value = plot.invert(x, y)
    readout.value = `${value.temperature.toFixed(1)} C / ${value.pressure.toFixed(0)} hPa`
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

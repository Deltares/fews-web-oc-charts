import '../shared/v5.css'
import { axis, createPlot, crosshair, line, linearScale, timeScale, tooltip } from '@lib'

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`The tooltip example is missing "${selector}".`)
  return element
}

const host = required<HTMLElement>('#chart')
const axisOption = required<HTMLSelectElement>('#axis')
const positionOption = required<HTMLSelectElement>('#position')
const modeOption = required<HTMLSelectElement>('#mode')
const snapOption = required<HTMLSelectElement>('#snap')
const calloutsOption = required<HTMLInputElement>('#callouts')
const status = required<HTMLElement>('#status')
const events = new AbortController()
const start = Date.UTC(2026, 0, 1)
const hour = 3_600_000
const times = Float64Array.from({ length: 49 }, (_, index) => start + index * hour)
const observed = line({
  id: 'observed',
  x: 't',
  y: 'q',
  xValues: times,
  yValues: Float64Array.from(
    { length: times.length },
    (_, index) => 44 + 22 * Math.sin(index / 3) + 13 * Math.cos(index / 7),
  ),
  digits: 2,
  stroke: '#1677a6',
  strokeWidth: 2,
  markers: { size: 3.5, fill: '#1677a6', stroke: '#fff', strokeWidth: 1, skip: 4 },
})
const forecast = line({
  id: 'forecast',
  x: 't',
  y: 'q',
  xValues: times,
  yValues: Float64Array.from(
    { length: times.length },
    (_, index) => 47 + 18 * Math.sin(index / 3.5) + 10 * Math.cos(index / 8),
  ),
  digits: 2,
  stroke: '#d55e00',
  strokeWidth: 2,
  markers: { size: 3.5, fill: '#d55e00', stroke: '#fff', strokeWidth: 1, skip: 4 },
})
const guide = crosshair({
  mode: 'x',
  snap: { mark: observed, axis: 'x' },
  labels: { x: 't', y: 'q' },
})
const interaction = tooltip({ marks: [observed, forecast], crosshair: guide })
const plot = createPlot(host, {
  title: 'Observed and forecast values',
  scales: {
    t: timeScale({ domain: [start, start + 48 * hour], timeZone: 'UTC' }),
    q: linearScale({ domain: [0, 100] }),
  },
  axes: [
    axis('t', { position: 'bottom', label: 'Time (UTC)', tickCount: 6 }),
    axis('q', { position: 'left', label: 'Value', grid: true }),
  ],
  marks: [observed, forecast],
  plugins: [guide, interaction],
})

function updateStatus() {
  const linked = modeOption.value !== 'none'
  axisOption.disabled = linked && snapOption.value !== 'none'
  snapOption.disabled = !linked
  calloutsOption.disabled = !linked
  status.textContent = !linked
    ? 'Standalone tooltip: every entry includes its sample coordinates.'
    : `${snapOption.value === 'none' ? 'Free pointer' : 'Snapped to an observed sample'}. ${
        calloutsOption.checked
          ? 'Axis callouts replace only matching coordinates; differing sample values stay in each entry.'
          : 'Callouts are hidden, so all sample coordinates remain in the tooltip.'
      }`
}

modeOption.addEventListener(
  'change',
  () => {
    const mode = modeOption.value
    if (mode !== 'none' && mode !== 'x' && mode !== 'y' && mode !== 'xy') {
      throw new Error(`Unknown crosshair mode "${mode}".`)
    }
    if (mode === 'none') {
      interaction.update({ crosshair: undefined })
      plot.update({ plugins: [interaction] })
    } else {
      guide.update({ mode })
      plot.update({ plugins: [guide, interaction] })
      interaction.update({ crosshair: guide })
    }
    updateStatus()
  },
  events,
)
snapOption.addEventListener(
  'change',
  () => {
    const axis = snapOption.value
    if (axis !== 'none' && axis !== 'x' && axis !== 'y' && axis !== 'xy') {
      throw new Error(`Unknown crosshair snap axis "${axis}".`)
    }
    guide.update({ snap: axis === 'none' ? undefined : { mark: observed, axis } })
    updateStatus()
  },
  events,
)
calloutsOption.addEventListener(
  'change',
  () => {
    guide.update({ labels: calloutsOption.checked ? { x: 't', y: 'q' } : undefined })
    updateStatus()
  },
  events,
)
updateStatus()

axisOption.addEventListener(
  'change',
  () => {
    if (axisOption.value !== 'x' && axisOption.value !== 'y' && axisOption.value !== 'xy') {
      throw new Error(`Unknown tooltip axis "${axisOption.value}".`)
    }
    interaction.update({ axis: axisOption.value })
  },
  events,
)
positionOption.addEventListener(
  'change',
  () => {
    if (!['bottom', 'left', 'right', 'top'].includes(positionOption.value)) {
      throw new Error(`Unknown tooltip position "${positionOption.value}".`)
    }
    interaction.update({
      position: positionOption.value as 'bottom' | 'left' | 'right' | 'top',
    })
  },
  events,
)
window.addEventListener(
  'pagehide',
  () => {
    events.abort()
    plot.destroy()
  },
  { once: true },
)

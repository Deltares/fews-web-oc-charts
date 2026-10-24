import '../shared/v5.css'
import './v5-tooltip.css'
import {
  axis,
  bar,
  createPlot,
  createTable,
  crosshair,
  highlight,
  line,
  linearScale,
  stackedArea,
  timeScale,
  tooltip,
} from '@lib'

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
const emphasis = highlight({ marks: [observed, forecast], crosshair: guide })
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
  plugins: [guide, interaction, emphasis],
})

const end = start + 48 * hour
const flowHost = required<HTMLElement>('#flow-chart')
const rainHost = required<HTMLElement>('#rain-chart')
const storageHost = required<HTMLElement>('#storage-chart')
const sharedTime = timeScale({ domain: [start, end], timeZone: 'UTC' })
const sharedFlowValues = Float64Array.from(
  { length: times.length },
  (_, index) => 36 + 12 * Math.sin(index / 4) + 5 * Math.cos(index / 8),
)
const rainValues = Float64Array.from({ length: times.length - 1 }, (_, index) =>
  Math.max(0, 2.4 + 1.8 * Math.sin(index / 3) + 1.1 * Math.cos(index / 6)),
)
const rainData = createTable({
  start: times.slice(0, -1),
  end: times.slice(1),
  rainfall: rainValues,
})
const flowData = createTable({
  t: times,
  observed: Float64Array.from(
    { length: times.length },
    (_, index) => 18 + 7 * Math.sin(index / 4) + 2 * Math.cos(index / 7),
  ),
  forecast: Float64Array.from(
    { length: times.length },
    (_, index) => 9 + 4 * Math.cos(index / 5) + 1.5 * Math.sin(index / 3),
  ),
})
const flowMark = line({
  id: 'discharge',
  x: 't',
  y: 'q',
  xValues: times,
  yValues: sharedFlowValues,
  stroke: '#1677a6',
  strokeWidth: 2,
  markers: { size: 3, fill: '#1677a6', skip: 4 },
})
const rainMark = bar(rainData, {
  id: 'rainfall',
  x: 'start',
  y: 'rainfall',
  scales: { x: 't', y: 'rain' },
  interval: { start: 'start', end: 'end' },
  fill: '#d17b0f',
})
const flowAreas = stackedArea(flowData, {
  id: 'inflow',
  x: 't',
  scales: { x: 't', y: 'flow' },
  layers: [
    { id: 'observed-inflow', y: 'observed', label: 'Observed inflow', fill: '#168c70' },
    { id: 'forecast-inflow', y: 'forecast', label: 'Forecast inflow', fill: '#8abf4d' },
  ],
  opacity: 0.85,
})
const subplotCrosshair = crosshair({ mode: 'x', labels: { x: 't' } })
const subplotMargins = { left: 80, right: 24, top: 12 }
const flowTooltip = tooltip({
  marks: [flowMark],
  crosshair: subplotCrosshair,
  showX: false,
  digits: 2,
})
const flowPlot = createPlot(flowHost, {
  axisLayout: 'inset',
  margins: { ...subplotMargins, bottom: 16 },
  directions: { t: 'x' },
  scales: { t: sharedTime, q: linearScale({ domain: [0, 70] }) },
  axes: [
    axis('q', { style: 'classic', position: 'left', label: 'Discharge', unit: 'm3/s', grid: true }),
  ],
  marks: [flowMark],
  plugins: [subplotCrosshair, flowTooltip, highlight({ crosshair: subplotCrosshair })],
})
const rainTooltip = tooltip({
  marks: [rainMark],
  crosshair: subplotCrosshair,
  showX: false,
  digits: 2,
})
const rainPlot = createPlot(rainHost, {
  axisLayout: 'inset',
  margins: { ...subplotMargins, bottom: 16 },
  directions: { t: 'x' },
  scales: { t: sharedTime, rain: linearScale({ domain: [0, 7], reverse: true }) },
  axes: [
    axis('rain', { style: 'classic', position: 'left', label: 'Rainfall', unit: 'mm', grid: true }),
  ],
  marks: [rainMark],
  plugins: [subplotCrosshair, rainTooltip, highlight({ crosshair: subplotCrosshair })],
})
const storageTooltip = tooltip({
  marks: [flowAreas],
  crosshair: subplotCrosshair,
  showX: false,
  digits: 2,
})
const storagePlot = createPlot(storageHost, {
  axisLayout: 'inset',
  margins: { ...subplotMargins, bottom: 56 },
  directions: { t: 'x' },
  scales: { t: sharedTime, flow: linearScale({ domain: [0, 45] }) },
  axes: [
    axis('t', { style: 'classic', position: 'bottom', label: 'Time (UTC)', tickCount: 5 }),
    axis('flow', { style: 'classic', position: 'left', label: 'Inflow', unit: 'm3/s', grid: true }),
  ],
  marks: [flowAreas],
  plugins: [subplotCrosshair, storageTooltip, highlight({ crosshair: subplotCrosshair })],
})
const advancedPlots = [flowPlot, rainPlot, storagePlot]
let relayingPointer = false

function relayPointer(source: (typeof advancedPlots)[number], event: PointerEvent) {
  if (relayingPointer || !event.isPrimary) return
  const sourceRect = source.element.getBoundingClientRect()
  const sourceSize = source.size.get()
  if (sourceRect.width <= 0 || sourceRect.height <= 0 || !sourceSize.width || !sourceSize.height) {
    return
  }
  const svgX = ((event.clientX - sourceRect.left) / sourceRect.width) * sourceSize.width
  const svgY = ((event.clientY - sourceRect.top) / sourceRect.height) * sourceSize.height
  const region = source.regions.get().plot
  const inside =
    svgX >= region.x &&
    svgX <= region.x + region.width &&
    svgY >= region.y &&
    svgY <= region.y + region.height

  relayingPointer = true
  try {
    for (const target of advancedPlots) {
      if (target === source) continue
      if (event.type === 'pointerleave' || !inside) {
        target.element.dispatchEvent(new PointerEvent('pointerleave', { isPrimary: true }))
        continue
      }
      const time = source.scales.t.invert(svgX)
      const targetRect = target.element.getBoundingClientRect()
      const targetSize = target.size.get()
      if (
        targetRect.width <= 0 ||
        targetRect.height <= 0 ||
        !targetSize.width ||
        !targetSize.height
      ) {
        continue
      }
      const targetRegion = target.regions.get().plot
      const targetSvgX = target.scales.t.project(time)
      const targetSvgY = targetRegion.y + targetRegion.height / 2
      target.element.dispatchEvent(
        new PointerEvent('pointermove', {
          clientX: targetRect.left + (targetSvgX / targetSize.width) * targetRect.width,
          clientY: targetRect.top + (targetSvgY / targetSize.height) * targetRect.height,
          isPrimary: true,
        }),
      )
    }
  } finally {
    relayingPointer = false
  }
}

for (const subplot of advancedPlots) {
  subplot.element.addEventListener('pointermove', (event) => relayPointer(subplot, event), events)
  subplot.element.addEventListener('pointerleave', (event) => relayPointer(subplot, event), events)
}

function updateStatus() {
  const linked = modeOption.value !== 'none'
  axisOption.disabled = linked && snapOption.value !== 'none'
  snapOption.disabled = !linked
  calloutsOption.disabled = !linked
  const snapDescription =
    snapOption.value === 'none' ? 'Free pointer' : 'Snapped to an observed sample'
  const calloutDescription = calloutsOption.checked
    ? 'Axis callouts replace only matching coordinates; differing sample values stay in each entry.'
    : 'Callouts are hidden, so all sample coordinates remain in the tooltip.'
  status.textContent = !linked
    ? 'Standalone tooltip: every entry includes its sample coordinates.'
    : `${snapDescription}. ${calloutDescription}`
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
      emphasis.update({ crosshair: undefined })
      plot.update({ plugins: [interaction, emphasis] })
    } else {
      guide.update({ mode })
      plot.update({ plugins: [guide, interaction, emphasis] })
      interaction.update({ crosshair: guide })
      emphasis.update({ crosshair: guide })
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
    emphasis.update({ axis: axisOption.value })
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
function dispose() {
  events.abort()
  plot.destroy()
  for (const subplot of advancedPlots) subplot.destroy()
}

window.addEventListener('pagehide', dispose, { once: true })
import.meta.hot?.dispose(dispose)

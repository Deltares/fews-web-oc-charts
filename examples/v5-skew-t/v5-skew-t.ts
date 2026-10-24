import '../shared/v5.css'
import { axis, createSkewTPlot, line, linearScale, logScale } from '@lib'
import { TooltipPosition } from '../../src/Tooltip/tooltip'
import { calculateTooltipPlacement } from '../../src/Utils/tooltipPlacement'

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
      unit: '°C',
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

const svgNS = 'http://www.w3.org/2000/svg'
const overlay = document.createElementNS(svgNS, 'g')
overlay.setAttribute('data-layer', 'skew-t-crosshair')
overlay.setAttribute('pointer-events', 'none')
overlay.setAttribute('display', 'none')
overlay.setAttribute('aria-hidden', 'true')

const clip = document.createElementNS(svgNS, 'clipPath')
clip.id = `skew-t-crosshair-${crypto.randomUUID()}`
const clipRect = document.createElementNS(svgNS, 'rect')
clip.append(clipRect)
overlay.append(clip)

const guides = document.createElementNS(svgNS, 'path')
guides.setAttribute('fill', 'none')
guides.setAttribute('stroke', 'currentColor')
guides.setAttribute('stroke-opacity', '0.65')
guides.setAttribute('stroke-dasharray', '3 3')
guides.setAttribute('vector-effect', 'non-scaling-stroke')
guides.setAttribute('clip-path', `url(#${clip.id})`)
overlay.append(guides)

function createPressureCallout() {
  const group = document.createElementNS(svgNS, 'g')
  group.setAttribute('data-crosshair-label', 'y')
  const background = document.createElementNS(svgNS, 'rect')
  background.setAttribute('height', '22')
  background.setAttribute('rx', '3')
  background.setAttribute('fill', 'var(--fews-chart-tooltip-background, #fff)')
  background.setAttribute('stroke', 'currentColor')
  background.setAttribute('stroke-opacity', '0.4')
  const text = document.createElementNS(svgNS, 'text')
  text.setAttribute('x', '6')
  text.setAttribute('y', '15')
  text.setAttribute('fill', 'var(--fews-chart-tooltip-color, #222)')
  text.setAttribute('font-size', '12')
  group.append(background, text)
  overlay.append(group)

  return (value: string, x: number, y: number) => {
    text.textContent = value
    const width = text.getComputedTextLength() + 12
    background.setAttribute('width', String(width))
    const size = plot.size.get()
    const left = x - width
    const top = y - 11
    const clampedX = Math.max(0, Math.min(size.width - width, left))
    const clampedY = Math.max(0, Math.min(size.height - 22, top))
    group.setAttribute('transform', `translate(${clampedX} ${clampedY})`)
  }
}

const showPressure = createPressureCallout()
plot.element.append(overlay)

const tooltip = document.createElement('div')
tooltip.id = `skew-t-tooltip-${crypto.randomUUID()}`
tooltip.className = 'fews-chart-tooltip'
tooltip.dataset.layer = 'tooltip'
tooltip.setAttribute('role', 'tooltip')
tooltip.setAttribute('aria-hidden', 'true')
Object.assign(tooltip.style, {
  position: 'fixed',
  zIndex: '1000',
  display: 'block',
  visibility: 'hidden',
  pointerEvents: 'none',
  padding: '6px 8px',
  borderRadius: '3px',
  background: 'var(--fews-chart-tooltip-background, #fff)',
  color: 'var(--fews-chart-tooltip-color, #222)',
  boxShadow: '0 1px 5px rgb(0 0 0 / 25%)',
  font: '12px/1.4 sans-serif',
  whiteSpace: 'nowrap',
})
const describedBy = plot.element.getAttribute('aria-describedby')
plot.element.setAttribute('aria-describedby', [describedBy, tooltip.id].filter(Boolean).join(' '))
document.body.append(tooltip)

function createTooltipRow(label: string, color: string, size: number) {
  const row = document.createElement('div')
  row.dataset.tooltipEntry = ''
  Object.assign(row.style, { display: 'flex', alignItems: 'center', gap: '5px' })
  const symbol = document.createElement('span')
  symbol.dataset.tooltipSymbol = ''
  symbol.setAttribute('aria-hidden', 'true')
  Object.assign(symbol.style, {
    flex: 'none',
    width: `${size}px`,
    height: `${size}px`,
    boxSizing: 'border-box',
    borderRadius: '50%',
    backgroundColor: color,
  })
  const name = document.createElement('span')
  name.dataset.tooltipLabel = ''
  name.style.color = color
  name.textContent = label
  const value = document.createElement('span')
  row.append(symbol, name, value)
  tooltip.append(row)
  return value
}

const temperatureValue = createTooltipRow('Temperature', '#d33', 5)
const dewPointValue = createTooltipRow('Dew point', '#198754', 8)

function showSounding(sample: number, x: number, y: number) {
  temperatureValue.textContent = ` · ${temperature[sample].toFixed(1)} °C`
  dewPointValue.textContent = ` · ${dewPoint[sample].toFixed(1)} °C`
  tooltip.setAttribute(
    'aria-label',
    `Temperature ${temperature[sample].toFixed(1)} °C; Dew point ${dewPoint[sample].toFixed(1)} °C`,
  )
  const bounds = plot.element.getBoundingClientRect()
  const size = plot.size.get()
  const position = calculateTooltipPlacement({
    x: bounds.left + (x / size.width) * bounds.width,
    y: bounds.top + (y / size.height) * bounds.height,
    preferredPosition: TooltipPosition.Right,
    containerWidth: window.innerWidth,
    containerHeight: window.innerHeight,
    tooltipWidth: tooltip.offsetWidth,
    tooltipHeight: tooltip.offsetHeight,
  })
  tooltip.style.left = `${position.x}px`
  tooltip.style.top = `${position.y}px`
  tooltip.style.transform =
    position.position === TooltipPosition.Left
      ? 'translate(calc(-100% - 6px), -50%)'
      : 'translate(6px, -50%)'
  tooltip.style.visibility = 'visible'
  tooltip.setAttribute('aria-hidden', 'false')
}

const hideCrosshair = () => {
  overlay.setAttribute('display', 'none')
  tooltip.style.visibility = 'hidden'
  tooltip.setAttribute('aria-hidden', 'true')
  readout.value = 'Move over the sounding.'
}

const events = new AbortController()
for (const input of [skew, skewNumber]) {
  input.addEventListener(
    'input',
    () => {
      if (!input.reportValidity()) return
      const value = input.valueAsNumber
      plot.update({ skewT: { skew: value } })
      skew.value = skewNumber.value = String(value)
      hideCrosshair()
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
      hideCrosshair()
      return
    }
    let sample = 0
    let distance = Infinity
    for (let index = 0; index < pressure.length; index += 1) {
      const sampleY = plot.project(temperature[index], pressure[index]).y
      const candidate = Math.abs(sampleY - y)
      if (candidate < distance) {
        sample = index
        distance = candidate
      }
    }
    const samplePressure = pressure[sample]
    const sampleY = plot.project(temperature[sample], samplePressure).y
    clipRect.setAttribute('x', String(region.x))
    clipRect.setAttribute('y', String(region.y))
    clipRect.setAttribute('width', String(region.width))
    clipRect.setAttribute('height', String(region.height))
    guides.setAttribute('d', `M ${region.x} ${sampleY} H ${region.x + region.width}`)
    overlay.removeAttribute('display')
    const sounding = `Temperature: ${temperature[sample].toFixed(1)} °C / Dew point: ${dewPoint[sample].toFixed(1)} °C`
    showSounding(sample, x, sampleY)
    showPressure(`${samplePressure.toFixed(0)} hPa`, region.x, sampleY)
    readout.value = `${sounding} / ${samplePressure.toFixed(0)} hPa`
  },
  events,
)
plot.element.addEventListener('pointerleave', hideCrosshair, events)

function dispose() {
  events.abort()
  tooltip.remove()
  if (describedBy) plot.element.setAttribute('aria-describedby', describedBy)
  else plot.element.removeAttribute('aria-describedby')
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

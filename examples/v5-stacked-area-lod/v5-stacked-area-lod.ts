import '../shared/v5.css'
import { axis, createPlot, createTable, linearScale, stackedArea } from '@lib'

function required<T extends HTMLElement>(selector: string) {
  const node = document.querySelector<T>(selector)
  if (!node) throw new Error(`The stacked-area LOD example is missing ${selector}.`)
  return node
}

const sampleCount = 24_000
const center = Math.floor(sampleCount / 2)
const xValues = Array.from({ length: sampleCount }, (_, index) => index)
const base = xValues.map((index) => {
  if (index >= center - 18 && index <= center + 18) return NaN
  if (index === center - 4_321) return 48
  if (index === center + 2_117) return -22
  return 7 + Math.sin(index / 173) * 3 + Math.cos(index / 41) * 1.5
})
const adjustment = xValues.map((index) => {
  if (index >= center - 18 && index <= center + 18) return NaN
  if (index === center + 4_111) return 36
  return 1 + (Math.cos(index / 97) + 1) * 2
})
const data = createTable({ sample: xValues, base, adjustment })
const curveControl = required<HTMLInputElement>('#step')
const renderer = required<HTMLSelectElement>('#renderer')
renderer.value =
  new URLSearchParams(location.search).get('renderer') === 'canvas' ? 'canvas' : 'svg'
const windowControl = required<HTMLInputElement>('#window-size')
const windowValue = required<HTMLOutputElement>('#window-value')
const sourceCount = required<HTMLElement>('#source-count')
const pathCount = required<HTMLElement>('#path-count')
const rowCount = required<HTMLElement>('#row-count')
const host = required('#chart')
const mark = stackedArea(data, {
  renderer: renderer.value === 'canvas' ? 'canvas' : 'svg',
  id: 'lod-stack',
  x: 'sample',
  scales: { x: 'sample', y: 'flow' },
  layers: [
    { id: 'base', y: 'base', label: 'Base flow', fill: '#4477aa' },
    { id: 'adjustment', y: 'adjustment', label: 'Adjustment', fill: '#228833' },
  ],
  opacity: 0.78,
})
const plot = createPlot(host, {
  title: 'Diverging stack · 24,000 source samples',
  scales: {
    sample: linearScale({ domain: [0, sampleCount - 1] }),
    flow: linearScale({ domain: [-28, 60] }),
  },
  axes: [
    axis('sample', { position: 'bottom', label: 'Sample index', tickCount: 7 }),
    axis('flow', { position: 'left', label: 'Flow', grid: true }),
  ],
  marks: [mark],
})

function updateWindow() {
  const count = Number(windowControl.value)
  const start = Math.max(0, Math.min(sampleCount - count, Math.round(center - (count - 1) / 2)))
  const end = Math.min(sampleCount - 1, start + count - 1)
  plot.scales.sample.scale.domain.set([start, end])
  windowValue.value = `${count.toLocaleString()} samples`
  windowValue.textContent = windowValue.value
  requestAnimationFrame(() => requestAnimationFrame(updateStats))
}

function updateStats() {
  const domain = plot.scales.sample.scale.domain.get()
  const visible = Math.min(sampleCount, Math.floor(Number(domain[1]) - Number(domain[0]) + 1))
  sourceCount.textContent = visible.toLocaleString()
  if (mark.options.get().resolved.renderer === 'canvas') {
    pathCount.textContent = 'N/A (canvas)'
    rowCount.textContent = 'N/A (canvas)'
    return
  }
  const paths = Array.from(
    host.querySelectorAll<SVGPathElement>('[data-mark="stacked-area-layer"]'),
  )
  const commands = paths.map((path) => (path.getAttribute('d')?.match(/[ML]/g) ?? []).length)
  const rows = commands.length ? Math.min(...commands) / 2 : 0
  pathCount.textContent = commands.length
    ? commands.map((count) => count.toLocaleString()).join(' / ')
    : '0'
  rowCount.textContent = curveControl.checked ? '— (step curve)' : Math.floor(rows).toLocaleString()
}

const events = new AbortController()
renderer.addEventListener(
  'change',
  () => {
    mark.update({ renderer: renderer.value === 'canvas' ? 'canvas' : 'svg' })
    requestAnimationFrame(() => requestAnimationFrame(updateStats))
  },
  events,
)
windowControl.addEventListener('input', updateWindow, events)
curveControl.addEventListener(
  'change',
  () => {
    mark.update({ curve: curveControl.checked ? 'step' : 'linear' })
    requestAnimationFrame(() => requestAnimationFrame(updateStats))
  },
  events,
)
const resizeObserver = new ResizeObserver(() => {
  requestAnimationFrame(() => requestAnimationFrame(updateStats))
})
resizeObserver.observe(host)
updateWindow()

function dispose() {
  events.abort()
  resizeObserver.disconnect()
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

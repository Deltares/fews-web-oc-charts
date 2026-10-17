import '../shared/spike.css'
import { createFrameScheduler, DirtyLayer } from '../../src/spike/core/frame-scheduler.js'
import { createReactiveCore } from '../../src/spike/core/reactive.js'
import { createColumnarSeries } from '../../src/spike/data/columnar-series.js'
import { createSvgLineRenderer } from '../../src/spike/render/svg-line.js'

const svg = document.querySelector<SVGSVGElement>('#chart')
const position = document.querySelector<HTMLInputElement>('#position')
const windowSize = document.querySelector<HTMLSelectElement>('#window-size')
const panLeft = document.querySelector<HTMLButtonElement>('#pan-left')
const panRight = document.querySelector<HTMLButtonElement>('#pan-right')
const reset = document.querySelector<HTMLButtonElement>('#reset')
const status = document.querySelector<HTMLParagraphElement>('#status')
if (!svg || !position || !windowSize || !panLeft || !panRight || !reset || !status) {
  throw new Error('The million-point spike example is missing required elements.')
}

const count = 1_000_000
const width = 1000
const series = createColumnarSeries({
  x: Float64Array.from({ length: count }, (_, index) => index),
  y: Float64Array.from({ length: count }, (_, index) =>
    index % 50_000 < 500 ? Number.NaN : Math.sin(index / 3000) + 0.25 * Math.cos(index / 113),
  ),
})
const renderer = createSvgLineRenderer(svg, series, {
  domain: [0, 99_999],
  yDomain: [-1.5, 1.5],
  range: [0, width, 0, 300],
  stroke: '#168aad',
  strokeWidth: 1.5,
})
const events = new AbortController()
let drag: { pointerId: number; origin: number; delta: number; applied: number } | undefined
let renderCount = 0
const scheduler = createFrameScheduler((layers) => {
  if (layers & DirtyLayer.marks) {
    renderer.render({ domain: domain.get() })
    renderCount += 1
    status.textContent =
      `Samples ${domain.get()[0].toLocaleString()} to ${domain.get()[1].toLocaleString()}. ` +
      `${(renderer.lod?.length ?? series.length).toLocaleString()} rendered vertices; ` +
      `${(series.canonicalByteLength / 1_000_000).toFixed(1)} MB canonical columns; ` +
      `${series.lodCacheEntries} cached windows; ${renderCount} committed renders.`
    position.value = String(start.get())
    position.max = String(count - visible.get())
    position.disabled = visible.get() === count
    panLeft.disabled = start.get() === 0
    panRight.disabled = start.get() === count - visible.get()
    if (drag) drag.applied = 0
  } else if (layers & DirtyLayer.interaction && drag) {
    renderer.pan(drag.delta - drag.applied)
    drag.applied = drag.delta
  }
})
const core = createReactiveCore(scheduler)
const start = core.signal(0)
const visible = core.signal(100_000)
const domain = core.computed<readonly [number, number]>(() => [
  start.get(),
  start.get() + visible.get() - 1,
])
const renderEffect = core.effect(() => {
  domain.get()
  scheduler.invalidate(DirtyLayer.marks)
})

function setStart(value: number) {
  start.set(Math.round(Math.max(0, Math.min(count - visible.get(), value))))
}

position.addEventListener('input', () => setStart(Number(position.value)), events)
windowSize.addEventListener(
  'change',
  () => {
    core.batch(() => {
      visible.set(Number(windowSize.value))
      setStart(start.get())
    })
  },
  events,
)
panLeft.addEventListener('click', () => setStart(start.get() - visible.get() / 10), events)
panRight.addEventListener('click', () => setStart(start.get() + visible.get() / 10), events)
reset.addEventListener(
  'click',
  () => {
    core.batch(() => {
      visible.set(100_000)
      start.set(0)
    })
    windowSize.value = '100000'
  },
  events,
)
svg.addEventListener(
  'pointerdown',
  (event) => {
    if (event.button !== 0 || drag) return
    drag = { pointerId: event.pointerId, origin: event.clientX, delta: 0, applied: 0 }
    svg.setPointerCapture(event.pointerId)
  },
  events,
)
svg.addEventListener(
  'pointermove',
  (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return
    drag.delta = ((event.clientX - drag.origin) / svg.getBoundingClientRect().width) * width
    scheduler.invalidate(DirtyLayer.interaction)
  },
  events,
)
svg.addEventListener(
  'pointerup',
  (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return
    setStart(start.get() - (drag.delta / width) * (visible.get() - 1))
    drag = undefined
    scheduler.invalidate(DirtyLayer.marks)
  },
  events,
)
svg.addEventListener(
  'lostpointercapture',
  () => {
    if (!drag) return
    drag = undefined
    scheduler.invalidate(DirtyLayer.marks)
  },
  events,
)

function dispose() {
  events.abort()
  renderEffect.dispose()
  scheduler.dispose()
  renderer.destroy()
}

window.addEventListener(
  'pagehide',
  (event) => {
    if (!event.persisted) dispose()
  },
  events,
)
import.meta.hot?.dispose(dispose)

import '../shared/spike.css'
import { createFrameScheduler, DirtyLayer } from '../../src/spike/core/frame-scheduler.js'
import { createReactiveCore } from '../../src/spike/core/reactive.js'
import { createColumnarSeries } from '../../src/spike/data/columnar-series.js'
import { createSvgLineRenderer } from '../../src/spike/render/svg-line.js'

const wideSvg = document.querySelector<SVGSVGElement>('#wide-chart')
const narrowSvg = document.querySelector<SVGSVGElement>('#narrow-chart')
const appendButton = document.querySelector<HTMLButtonElement>('#append')
const streamButton = document.querySelector<HTMLButtonElement>('#stream')
const follow = document.querySelector<HTMLInputElement>('#follow')
const destroyButton = document.querySelector<HTMLButtonElement>('#destroy')
const status = document.querySelector<HTMLParagraphElement>('#status')
if (
  !wideSvg ||
  !narrowSvg ||
  !appendButton ||
  !streamButton ||
  !follow ||
  !destroyButton ||
  !status
) {
  throw new Error('The shared live spike example is missing required elements.')
}

const capacity = 8192
const windowLength = 4096
const valueAt = (index: number) => Math.sin(index / 100) + 0.2 * Math.cos(index / 11)
const series = createColumnarSeries(
  {
    x: Float64Array.from({ length: capacity }, (_, index) => index),
    y: Float64Array.from({ length: capacity }, (_, index) => valueAt(index)),
  },
  { capacity, maxPoints: capacity },
)
const initialDomain = [capacity - windowLength, capacity - 1] as const
const wide = createSvgLineRenderer(wideSvg, series, {
  domain: initialDomain,
  yDomain: [-1.5, 1.5],
  range: [0, 1000, 0, 240],
  stroke: '#168aad',
})
const narrow = createSvgLineRenderer(narrowSvg, series, {
  domain: initialDomain,
  yDomain: [-1.5, 1.5],
  range: [0, 600, 0, 180],
  stroke: '#c56a18',
})
let renders = 0
let timer: ReturnType<typeof setInterval> | undefined
let disposed = false
const events = new AbortController()
const scheduler = createFrameScheduler((layers) => {
  if (!(layers & DirtyLayer.marks)) return
  wide.render({ domain: domain.get() })
  narrow.render({ domain: domain.get() })
  renders += 1
  status.textContent =
    `Retained ${series.length.toLocaleString()} samples, indices ${series.xAt(0)} to ` +
    `${series.xAt(series.length - 1)}. Domain ${domain.get().join(' to ')}. ` +
    `${(series.canonicalByteLength / 1024).toFixed(0)} KiB canonical columns, ` +
    `${wide.lod?.length} / ${narrow.lod?.length} rendered vertices. ` +
    `Store version ${series.version}; ${renders} shared render frames.`
})
const core = createReactiveCore(scheduler)
const version = core.signal(series.version)
const domain = core.signal<readonly [number, number]>(initialDomain)
const renderEffect = core.effect(() => {
  version.get()
  domain.get()
  scheduler.invalidate(DirtyLayer.marks)
})

const append = () => {
  const first = series.xAt(series.length - 1) + 1
  series.append({
    x: Float64Array.from({ length: 128 }, (_, index) => first + index),
    y: Float64Array.from({ length: 128 }, (_, index) => valueAt(first + index)),
  })
  core.batch(() => {
    version.set(series.version)
    if (follow.checked) followLatest()
  })
}

const followLatest = () => {
  const last = series.xAt(series.length - 1)
  domain.set([last - windowLength + 1, last])
}

appendButton.addEventListener('click', append, events)
follow.addEventListener(
  'change',
  () => {
    if (follow.checked) followLatest()
  },
  events,
)
streamButton.addEventListener(
  'click',
  () => {
    if (timer === undefined) {
      timer = setInterval(append, 250)
      streamButton.textContent = 'Pause stream'
      streamButton.setAttribute('aria-pressed', 'true')
    } else {
      clearInterval(timer)
      timer = undefined
      streamButton.textContent = 'Start stream'
      streamButton.setAttribute('aria-pressed', 'false')
    }
  },
  events,
)

const dispose = () => {
  if (disposed) return
  disposed = true
  clearInterval(timer)
  events.abort()
  renderEffect.dispose()
  scheduler.dispose()
  wide.destroy()
  narrow.destroy()
  for (const control of [appendButton, streamButton, follow, destroyButton]) {
    control.disabled = true
  }
  streamButton.setAttribute('aria-pressed', 'false')
  status.textContent = 'Destroyed: stream stopped, effects disposed, and SVG paths removed.'
}

destroyButton.addEventListener('click', dispose, events)
window.addEventListener(
  'pagehide',
  (event) => {
    if (!event.persisted) dispose()
  },
  events,
)
import.meta.hot?.dispose(dispose)

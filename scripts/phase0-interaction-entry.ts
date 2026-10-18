import {
  AxisType,
  CartesianAxes,
  ChartLine,
  MouseButton,
  PanHandler,
  PanningDirection,
} from '../src/index.js'
import { createFrameScheduler, DirtyLayer } from '../src/spike/core/frame-scheduler.js'
import { createReactiveCore } from '../src/spike/core/reactive.js'
import { createColumnarSeries } from '../src/spike/data/columnar-series.js'
import { createSvgLineRenderer } from '../src/spike/render/svg-line.js'
import { changedPixelRatio } from './benchmark-pixels.js'

type Domain = readonly [number, number]
export interface GestureMetrics {
  gestureMs: number
  releaseToSettledMs: number
  frameIntervalsMs: number[]
  inputToDomUpdateMs: number[]
  deliveredMoves: number
  geometryUpdates: number
  pathUpdates: number
  previewUpdates: number
  finalDomain: Domain
}

interface Fixture {
  reset(): Promise<void>
  result(): GestureMetrics | undefined
  state(): {
    domain: Domain
    yDomain: Domain
    path: string
    preview: boolean
    geometryUpdates: number
  }
}

declare global {
  interface Window {
    interactionFixture: Fixture
    compareChartScreenshots(reference: string, actual: string): Promise<number>
  }
}

const width = 1000
const height = 400
const count = 1_000_000
const initialDomain: Domain = [400_000, 600_000]
const container = document.querySelector<HTMLDivElement>('#chart')
if (!container) throw new Error('The interaction fixture container is missing.')
const implementation = new URLSearchParams(location.search).get('implementation')
if (implementation !== 'v4' && implementation !== 'spike') {
  throw new Error('Choose implementation=v4 or implementation=spike.')
}
const valueAt = (index: number) => Math.sin(index / 30_000) + Math.cos(index / 47_000) * 0.2
let readDomain: () => Domain
let readYDomain: () => Domain
let resetDomain: () => void
let path: SVGPathElement

if (implementation === 'v4') {
  const axes = new CartesianAxes(container, width, height, {
    automargin: false,
    transitionTime: 0,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
    x: [
      {
        type: AxisType.value,
        domain: [...initialDomain],
        nice: false,
        showAxis: false,
        showGrid: false,
      },
    ],
    y: [
      {
        type: AxisType.value,
        domain: [-1.25, 1.25],
        nice: false,
        showAxis: false,
        showGrid: false,
      },
    ],
  })
  const chart = new ChartLine(
    Array.from({ length: count }, (_, index) => ({ x: index, y: valueAt(index) })),
    { transitionTime: 0 },
  )
  chart.addTo(axes, { x: { key: 'x', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } }, 'benchmark', {
    fill: 'none',
    stroke: '#000000',
    'stroke-width': '1',
  })
  axes.accept(new PanHandler({ mouseButton: MouseButton.Left, direction: PanningDirection.X }))
  axes.redraw({ x: { domain: [...initialDomain] }, y: { domain: [-1.25, 1.25] } })
  const element = container.querySelector<SVGPathElement>('[data-chart-id="benchmark"] path')
  if (!element) throw new Error('v4 did not render its line.')
  path = element
  readDomain = () => {
    const domain = axes.xScalesDomains[0]
    return [domain[0], domain[1]]
  }
  readYDomain = () => {
    const domain = axes.yScalesDomains[0]
    return [domain[0], domain[1]]
  }
  resetDomain = () => {
    axes.setDomain('x', 0, [...initialDomain])
    axes.setDomain('y', 0, [-1.25, 1.25])
    axes.zoom()
  }
} else {
  const series = createColumnarSeries({
    x: Float64Array.from({ length: count }, (_, index) => index),
    y: Float64Array.from({ length: count }, (_, index) => valueAt(index)),
  })
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('width', String(width))
  svg.setAttribute('height', String(height))
  container.append(svg)
  const renderer = createSvgLineRenderer(svg, series, {
    domain: initialDomain,
    yDomain: [-1.25, 1.25],
    range: [0, width, 0, height],
    stroke: '#000000',
    strokeWidth: 1,
  })
  path = renderer.path
  let drag:
    { id: number; origin: number; delta: number; applied: number; domain: Domain } | undefined
  const scheduler = createFrameScheduler((layers) => {
    if (layers & DirtyLayer.marks) {
      renderer.render({ domain: domain.get() })
    } else if (layers & DirtyLayer.interaction && drag) {
      renderer.pan(drag.delta - drag.applied)
      drag.applied = drag.delta
    }
  })
  const core = createReactiveCore(scheduler)
  const domain = core.signal<Domain>(initialDomain)
  core.effect(() => {
    domain.get()
    scheduler.invalidate(DirtyLayer.marks)
  })
  readDomain = () => domain.get()
  readYDomain = () => [-1.25, 1.25]
  resetDomain = () => {
    domain.set(initialDomain)
    scheduler.invalidate(DirtyLayer.marks)
  }
  svg.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return
    drag = {
      id: event.pointerId,
      origin: event.clientX,
      delta: 0,
      applied: 0,
      domain: domain.get(),
    }
    svg.setPointerCapture(event.pointerId)
  })
  svg.addEventListener('pointermove', (event) => {
    if (!drag || drag.id !== event.pointerId) return
    drag.delta = event.clientX - drag.origin
    scheduler.invalidate(DirtyLayer.interaction)
  })
  svg.addEventListener('pointerup', (event) => {
    if (!drag || drag.id !== event.pointerId) return
    const shift = -((event.clientX - drag.origin) / width) * (drag.domain[1] - drag.domain[0])
    domain.set([drag.domain[0] + shift, drag.domain[1] + shift])
    drag = undefined
    scheduler.invalidate(DirtyLayer.marks)
  })
  svg.addEventListener('lostpointercapture', () => {
    if (!drag) return
    drag = undefined
    scheduler.invalidate(DirtyLayer.marks)
  })
}

let geometryUpdates = 0
let pathUpdates = 0
let previewUpdates = 0
let latestMove: number | undefined
let downAt: number | undefined
let releasedAt: number | undefined
let lastFrame: number | undefined
let stableFrames = 0
let observedUpdates = 0
let result: GestureMetrics | undefined
let frameIntervals: number[] = []
let updateLatencies: number[] = []
let deliveredMoves = 0
let frameId = 0
const geometryObserver = new MutationObserver((records) => {
  pathUpdates += records.filter(
    (record) => record.target === path && record.attributeName === 'd',
  ).length
  previewUpdates += records.filter(
    (record) => record.target === path.parentElement && record.attributeName === 'transform',
  ).length
  const changed = records.some(
    (record) =>
      (record.target === path && record.attributeName === 'd') ||
      (record.target === path.parentElement && record.attributeName === 'transform'),
  )
  if (!changed) return
  geometryUpdates += 1
  if (downAt !== undefined && latestMove !== undefined) {
    updateLatencies.push(performance.now() - latestMove)
    latestMove = undefined
  }
})
geometryObserver.observe(container, {
  subtree: true,
  attributes: true,
  attributeFilter: ['d', 'transform'],
})

function sampleFrame(now: number) {
  if (downAt === undefined || result) return
  if (lastFrame !== undefined) frameIntervals.push(now - lastFrame)
  lastFrame = now
  if (releasedAt !== undefined) {
    stableFrames = geometryUpdates === observedUpdates ? stableFrames + 1 : 0
    observedUpdates = geometryUpdates
    if (stableFrames >= 2 && !path.parentElement?.hasAttribute('transform')) {
      result = {
        gestureMs: performance.now() - downAt,
        releaseToSettledMs: performance.now() - releasedAt,
        frameIntervalsMs: frameIntervals,
        inputToDomUpdateMs: updateLatencies,
        deliveredMoves,
        geometryUpdates,
        pathUpdates,
        previewUpdates,
        finalDomain: readDomain(),
      }
      return
    }
  }
  frameId = requestAnimationFrame(sampleFrame)
}

container.addEventListener(
  'pointerdown',
  () => {
    downAt = performance.now()
    frameId = requestAnimationFrame(sampleFrame)
  },
  { capture: true },
)
window.addEventListener(
  'pointermove',
  () => {
    if (downAt === undefined || releasedAt !== undefined) return
    deliveredMoves += 1
    latestMove = performance.now()
  },
  { capture: true },
)
window.addEventListener(
  'pointerup',
  () => {
    if (downAt !== undefined) releasedAt = performance.now()
  },
  { capture: true },
)

window.interactionFixture = {
  async reset() {
    cancelAnimationFrame(frameId)
    downAt = undefined
    releasedAt = undefined
    latestMove = undefined
    lastFrame = undefined
    result = undefined
    stableFrames = 0
    frameIntervals = []
    updateLatencies = []
    deliveredMoves = 0
    resetDomain()
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    )
    geometryUpdates = 0
    pathUpdates = 0
    previewUpdates = 0
    observedUpdates = 0
  },
  result: () => result,
  state: () => ({
    domain: readDomain(),
    yDomain: readYDomain(),
    path: path.getAttribute('d') ?? '',
    preview: path.parentElement?.hasAttribute('transform') ?? false,
    geometryUpdates,
  }),
}

window.compareChartScreenshots = async (reference, actual) => {
  async function pixels(base64: string) {
    const response = await fetch(`data:image/png;base64,${base64}`)
    const bitmap = await createImageBitmap(await response.blob())
    if (bitmap.width !== width || bitmap.height !== height) {
      bitmap.close()
      throw new Error('Screenshots must be exactly 1000 by 400 pixels at DPR 1.')
    }
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas 2D is required for screenshot comparison.')
    context.drawImage(bitmap, 0, 0)
    bitmap.close()
    return context.getImageData(0, 0, width, height).data
  }
  return changedPixelRatio(await pixels(reference), await pixels(actual))
}

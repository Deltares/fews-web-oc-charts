import { bisector, line, scaleLinear } from 'd3'
import { createColumnarSeries } from '../src/spike/data/columnar-series.js'
import type { ColumnarSeries } from '../src/spike/data/columnar-series.js'
import { createSvgLineRenderer } from '../src/spike/render/svg-line.js'
import type { SvgLineRenderer } from '../src/spike/render/svg-line.js'
import { changedPixelRatio } from './benchmark-pixels.js'

declare global {
  interface Window {
    __phase0MemoryFixture?: {
      series: ColumnarSeries
      renderer: SvgLineRenderer
      svg: SVGSVGElement
    }
    runPhase0MemoryProbe(): {
      canonicalBytes: number
      lodBytes: number
      lodEntries: number
      pathCharacters: number
    }
    runPhase0Benchmark(): Promise<{
      points: number
      warmups: number
      measuredRuns: number
      v4PanP95Ms: number
      spikePanP95Ms: number
      speedup: number
      changedPixelRatio: number
    }>
  }
}

function p95(values: number[]) {
  return [...values].sort((left, right) => left - right)[Math.ceil(values.length * 0.95) - 1]
}

window.runPhase0MemoryProbe = () => {
  const count = 1_000_000
  const x = Float64Array.from({ length: count }, (_, index) => index)
  const y = Float64Array.from({ length: count }, (_, index) => Math.sin(index / 10_000))
  const series = createColumnarSeries({ x, y }, { capacity: count })
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('width', '1000')
  svg.setAttribute('height', '300')
  document.body.append(svg)
  const renderer = createSvgLineRenderer(svg, series, {
    domain: [0, 100_000],
    yDomain: [-1, 1],
    range: [0, 1000, 0, 300],
  })
  for (let index = 0; index < 100; index += 1) {
    const start = index * 1000
    renderer.render({ domain: [start, start + 100_000] })
  }
  window.__phase0MemoryFixture = { series, renderer, svg }
  return {
    canonicalBytes: series.canonicalByteLength,
    lodBytes: series.lodCacheByteLength,
    lodEntries: series.lodCacheEntries,
    pathCharacters: renderer.path.getAttribute('d')?.length ?? 0,
  }
}

window.runPhase0Benchmark = async () => {
  const count = 1_000_000
  const width = 1000
  const height = 400
  const x = Float64Array.from({ length: count }, (_, index) => index)
  const y = Float64Array.from(
    { length: count },
    (_, index) => Math.sin(index / 30_000) + Math.cos(index / 47_000) * 0.2,
  )
  const reference = Array.from({ length: count }, (_, index) => ({ x: x[index], y: y[index] }))
  const series = createColumnarSeries({ x, y })
  const domain = [0, count - 1] as const
  const yDomain = [-1.25, 1.25] as const
  const xScale = scaleLinear().domain(domain).range([0, width])
  const yScale = scaleLinear().domain(yDomain).range([height, 0])
  const bisect = bisector<{ x: number }, number>((point) => point.x)
  const baselineSvg = document.querySelector<SVGSVGElement>('#baseline')
  if (!baselineSvg) throw new Error('The v4 baseline SVG fixture is missing.')
  const baselinePath = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  baselineSvg.append(baselinePath)
  const renderer = createSvgLineRenderer(document.querySelector<SVGSVGElement>('#spike')!, series, {
    domain,
    yDomain,
    range: [0, width, 0, height],
    stroke: '#000000',
    strokeWidth: 1,
  })
  baselinePath.setAttribute('fill', 'none')
  baselinePath.setAttribute('stroke', '#000000')
  baselinePath.setAttribute('stroke-width', '1')

  const baselineLine = line<{ x: number; y: number }>()
    .x((point) => xScale(point.x))
    .y((point) => yScale(point.y))
  const renderBaselinePan = (pixelDelta: number) => {
    const shift = (-pixelDelta * (domain[1] - domain[0])) / width
    const nextDomain = [shift, domain[1] + shift]
    xScale.domain(nextDomain)
    const start = Math.max(0, bisect.right(reference, nextDomain[0]) - 1)
    const end = Math.min(reference.length, bisect.left(reference, nextDomain[1]) + 1)
    const window = reference.slice(start, end)
    baselinePath.setAttribute('d', baselineLine(window) ?? '')
  }
  const renderSpikePan = (pixelDelta: number) => renderer.pan(pixelDelta, 0)
  const warmups = 10
  const measuredRuns = 30

  for (let index = 0; index < warmups; index += 1) {
    const delta = index % 2 === 0 ? 2 : -2
    renderBaselinePan(delta)
    renderer.render()
    renderSpikePan(delta)
  }

  const baselineTimes: number[] = []
  const spikeTimes: number[] = []
  for (let index = 0; index < measuredRuns; index += 1) {
    const delta = index % 2 === 0 ? 3 : -3
    let start = performance.now()
    renderBaselinePan(delta)
    baselineTimes.push(performance.now() - start)
    start = performance.now()
    renderSpikePan(delta)
    spikeTimes.push(performance.now() - start)
  }

  renderer.render()
  renderer.pan(12, 0)
  renderBaselinePan(12)
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

  const baselineCanvas = document.createElement('canvas')
  const spikeCanvas = document.createElement('canvas')
  baselineCanvas.width = spikeCanvas.width = width
  baselineCanvas.height = spikeCanvas.height = height
  const baselineContext = baselineCanvas.getContext('2d')
  const spikeContext = spikeCanvas.getContext('2d')
  if (!baselineContext || !spikeContext) {
    throw new Error('Canvas 2D is required for the deterministic visual comparison.')
  }
  baselineContext.strokeStyle = spikeContext.strokeStyle = '#000000'
  baselineContext.lineWidth = spikeContext.lineWidth = 1
  baselineContext.stroke(new Path2D(baselinePath.getAttribute('d') ?? ''))
  const spikePath = document.querySelector<SVGPathElement>('#spike path')
  if (!spikePath) throw new Error('The spike renderer did not create an SVG path.')
  spikeContext.save()
  spikeContext.translate(12, 0)
  spikeContext.stroke(new Path2D(spikePath.getAttribute('d') ?? ''))
  spikeContext.restore()

  const baselinePixels = baselineContext.getImageData(0, 0, width, height).data
  const spikePixels = spikeContext.getImageData(0, 0, width, height).data

  renderer.destroy()
  const v4PanP95Ms = p95(baselineTimes)
  const spikePanP95Ms = p95(spikeTimes)
  return {
    baseline: 'v4 ChartLine window slice + full d3.line path rebuild',
    points: count,
    warmups,
    measuredRuns,
    v4PanP95Ms,
    spikePanP95Ms,
    speedup: v4PanP95Ms / spikePanP95Ms,
    changedPixelRatio: changedPixelRatio(baselinePixels, spikePixels),
  }
}

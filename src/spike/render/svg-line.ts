import { line } from 'd3'
import type { ColumnarSeries, LodIndices } from '../data/columnar-series.js'

export interface SvgLineOptions {
  domain: readonly [number, number]
  yDomain: readonly [number, number]
  range: readonly [number, number, number, number]
  stroke?: string
  strokeWidth?: number
}

export interface SvgLineRenderer {
  readonly path: SVGPathElement
  readonly lod: LodIndices | undefined
  render(options?: Partial<SvgLineOptions>): void
  pan(dx: number, dy?: number): void
  destroy(): void
}

interface IndexedValues<T> extends Iterable<T>, ArrayLike<T> {
  at(index: number): T
}

function indexedValues<T>(length: number, valueAt: (index: number) => T): IndexedValues<T> {
  const target = {
    length,
    at(index: number) {
      return valueAt(index)
    },
    *[Symbol.iterator]() {
      for (let index = 0; index < length; index += 1) yield valueAt(index)
    },
  }
  return new Proxy(target, {
    get(object, property, receiver) {
      if (typeof property === 'string' && /^(0|[1-9]\d*)$/.test(property)) {
        const index = Number(property)
        return index < length ? valueAt(index) : undefined
      }
      return Reflect.get(object, property, receiver)
    },
  })
}

export function createSvgLineRenderer(
  svg: SVGSVGElement,
  series: ColumnarSeries,
  initialOptions: SvgLineOptions,
): SvgLineRenderer {
  let options = { ...initialOptions }
  let panX = 0
  let panY = 0
  let lod: LodIndices | undefined
  const group = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('fill', 'none')
  path.setAttribute('stroke', options.stroke ?? '#1f77b4')
  path.setAttribute('stroke-width', String(options.strokeWidth ?? 1.5))
  path.setAttribute('vector-effect', 'non-scaling-stroke')
  group.append(path)
  svg.append(group)

  const renderer: SvgLineRenderer = {
    path,
    get lod() {
      return lod
    },
    render(patch = {}) {
      options = { ...options, ...patch }
      const [xStart, xEnd] = options.domain
      const [yStart, yEnd] = options.yDomain
      const [x0, x1, y0, y1] = options.range
      const width = Math.max(1, Math.round(Math.abs(x1 - x0)))
      const xScale = (value: number) => x0 + ((value - xStart) / (xEnd - xStart || 1)) * (x1 - x0)
      const yScale = (value: number) => y1 + ((value - yStart) / (yEnd - yStart || 1)) * (y0 - y1)
      lod =
        series.length > width * 4
          ? series.decimate({ start: xStart, end: xEnd, width, reverse: x1 < x0 })
          : undefined
      const pathGenerator = line<number>()
        .defined((index) => Number.isFinite(series.yAt(index)))
        .x((index) => xScale(series.xAt(index)))
        .y((index) => yScale(series.yAt(index)))
      const currentLod = lod
      const source = currentLod
        ? indexedValues(currentLod.length, (index) => currentLod.at(index))
        : indexedValues(series.length, (index) => index)
      path.setAttribute('d', pathGenerator(source) ?? '')
      group.removeAttribute('transform')
      panX = 0
      panY = 0
    },
    pan(dx, dy = 0) {
      panX += dx
      panY += dy
      group.setAttribute('transform', `translate(${panX} ${panY})`)
    },
    destroy() {
      group.remove()
      lod = undefined
    },
  }

  renderer.render()
  return renderer
}

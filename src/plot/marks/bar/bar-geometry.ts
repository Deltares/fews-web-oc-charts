import type { ScaleBinding, ScaleValue } from '../../../scales/scale.js'
import { barEndpoints, type BarMark } from './bar.js'
import { scaleKey } from '../mark-definition.js'
import { sameInteractionKey } from '../../interaction/interaction-index.js'

export interface BarRectangle {
  readonly layerId: string
  readonly sampleId: number
  readonly row: number
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

const rectangleCache = new WeakMap<
  BarMark,
  { readonly key: readonly unknown[]; readonly rectangles: readonly BarRectangle[] }
>()

export function barRectangles(
  mark: BarMark,
  scales: Readonly<Record<string, ScaleBinding>>,
): readonly BarRectangle[] {
  const options = mark.options.get().resolved
  const category = scales[options.scales.x]
  const value = scales[options.scales.y]
  if (!category || !value) return []
  const key = [mark.data.version, mark.options.version, ...scaleKey(category), ...scaleKey(value)]
  const cached = rectangleCache.get(mark)
  if (cached && sameInteractionKey(cached.key, key)) return cached.rectangles
  if (!options.visible) return []
  const layout = barEndpoints(mark)
  const result: BarRectangle[] = []
  const horizontal = options.orientation === 'horizontal'
  const pixels = category.range.get()
  const viewportLow = Math.min(...pixels)
  const viewportHigh = Math.max(...pixels)
  for (let row = 0; row < mark.data.length; row += 1) {
    const key = mark.data.valueAt(options.x, row)
    if (category.scale.kind === 'band' && !category.scale.domain.get().includes(key)) continue
    let start: number
    let end: number
    if (options.interval) {
      start = category.project(mark.data.valueAt(options.interval.start, row))
      end = category.project(mark.data.valueAt(options.interval.end, row))
    } else if (category.scale.kind === 'band') {
      start = category.project(key)
      end = start + category.bandwidth
      const reverse = category.scale.options.get().resolved.reverse
      // A vertical category range runs upwards; band.project is always its low pixel edge.
      if (pixels[1] < pixels[0] !== reverse) [start, end] = [end, start]
    } else {
      const center = category.project(key)
      const reverse = category.scale.options.get().resolved.reverse
      const direction = pixels[1] < pixels[0] !== reverse ? -1 : 1
      start = center - (direction * options.width!) / 2
      end = center + (direction * options.width!) / 2
    }
    if (Math.max(start, end) < viewportLow || Math.min(start, end) > viewportHigh) continue
    const outer = end - start
    const innerStart = start + (outer * options.groupPadding) / 2
    const inner = outer * (1 - options.groupPadding)
    const step = inner / (layout.slots - options.layerPadding)
    // Padding is a fraction of each slot's step; no gap is added between stack segments.
    const width = step * (1 - options.layerPadding)
    for (const layer of layout.layers) {
      const lower = layer.lowerAt(row)
      const upper = layer.upperAt(row)
      if (!Number.isFinite(lower) || !Number.isFinite(upper)) continue
      const a = innerStart + layer.slot * step
      const b = a + (layout.slots === 1 ? inner : width)
      const v0 = value.project(lower)
      const v1 = value.project(upper)
      const c0 = Math.min(a, b)
      const vLow = Math.min(v0, v1)
      result.push(
        Object.freeze({
          layerId: layer.id,
          sampleId: mark.data.sampleId(row),
          row,
          x: horizontal ? vLow : c0,
          y: horizontal ? c0 : vLow,
          width: horizontal ? Math.abs(v1 - v0) : Math.abs(b - a),
          height: horizontal ? Math.abs(b - a) : Math.abs(v1 - v0),
        }),
      )
    }
  }
  const rectangles = Object.freeze(result)
  rectangleCache.set(mark, { key, rectangles })
  return rectangles
}

export function barExtent(
  mark: BarMark,
  coordinate: 'category' | 'value',
  window?: readonly ScaleValue[],
): readonly ScaleValue[] | undefined {
  const options = mark.options.get().resolved
  if (!options.visible) return undefined
  const layout = barEndpoints(mark)
  const categories = new Set<string>()
  let low = Infinity
  let high = -Infinity
  for (let row = 0; row < mark.data.length; row += 1) {
    const key = mark.data.valueAt(options.x, row)
    const start = options.interval ? Number(mark.data.valueAt(options.interval.start, row)) : key
    const end = options.interval ? Number(mark.data.valueAt(options.interval.end, row)) : key
    if (
      coordinate === 'value' &&
      window &&
      (typeof key === 'string'
        ? !window.includes(key)
        : Number(end) < Number(window[0]) || Number(start) > Number(window[1]))
    )
      continue
    let eligible = false
    for (const layer of layout.layers) {
      const lower = layer.lowerAt(row)
      const upper = layer.upperAt(row)
      if (!Number.isFinite(lower) || !Number.isFinite(upper)) continue
      if (
        coordinate === 'category' &&
        window &&
        (upper < Number(window[0]) || lower > Number(window[1]))
      )
        continue
      eligible = true
      if (coordinate === 'value') {
        low = Math.min(low, lower, 0)
        high = Math.max(high, upper, 0)
      }
    }
    if (eligible && coordinate === 'category') {
      if (typeof key === 'string') categories.add(key)
      else {
        low = Math.min(low, Number(start))
        high = Math.max(high, Number(end))
      }
    }
  }
  return categories.size
    ? Object.freeze([...categories])
    : low <= high
      ? Object.freeze([low, high])
      : undefined
}

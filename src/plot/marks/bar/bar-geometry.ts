import type { ScaleBinding, ScaleValue } from '../../../scales/scale.js'
import { barEndpoints, type BarMark, type BarOptions } from './bar.js'
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

function categorySpan(
  mark: BarMark,
  options: Readonly<BarOptions>,
  category: ScaleBinding,
  pixels: readonly number[],
  row: number,
): readonly [number, number] | undefined {
  const key = mark.data.valueAt(options.x, row)
  if (category.scale.kind === 'band' && !category.scale.domain.get().includes(key)) return
  if (options.interval) {
    return [
      category.project(mark.data.valueAt(options.interval.start, row)),
      category.project(mark.data.valueAt(options.interval.end, row)),
    ]
  }
  const reverse = category.scale.options.get().resolved.reverse
  const reversed = pixels[1] < pixels[0] !== reverse
  if (category.scale.kind === 'band') {
    const start = category.project(key)
    const end = start + category.bandwidth
    // A vertical category range runs upwards; band.project is always its low pixel edge.
    return reversed ? [end, start] : [start, end]
  }
  const center = category.project(key)
  const direction = reversed ? -1 : 1
  return [center - (direction * options.width!) / 2, center + (direction * options.width!) / 2]
}

function rowRectangles(
  mark: BarMark,
  options: Readonly<BarOptions>,
  layout: ReturnType<typeof barEndpoints>,
  value: ScaleBinding,
  row: number,
  [start, end]: readonly [number, number],
): BarRectangle[] {
  const result: BarRectangle[] = []
  const horizontal = options.orientation === 'horizontal'
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
  return result
}

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
  const pixels = category.range.get()
  const viewportLow = Math.min(...pixels)
  const viewportHigh = Math.max(...pixels)
  for (let row = 0; row < mark.data.length; row += 1) {
    const span = categorySpan(mark, options, category, pixels, row)
    if (!span) continue
    const [start, end] = span
    if (Math.max(start, end) < viewportLow || Math.min(start, end) > viewportHigh) continue
    for (const rectangle of rowRectangles(mark, options, layout, value, row, span)) {
      result.push(rectangle)
    }
  }
  const rectangles = Object.freeze(result)
  rectangleCache.set(mark, { key, rectangles })
  return rectangles
}

function categoryRowBounds(
  mark: BarMark,
  options: Readonly<BarOptions>,
  row: number,
  key: ScaleValue,
): readonly [ScaleValue, ScaleValue] {
  if (!options.interval) return [key, key]
  return [
    Number(mark.data.valueAt(options.interval.start, row)),
    Number(mark.data.valueAt(options.interval.end, row)),
  ]
}

function outsideCategoryWindow(
  key: ScaleValue,
  start: ScaleValue,
  end: ScaleValue,
  window: readonly ScaleValue[] | undefined,
) {
  if (!window) return false
  if (typeof key === 'string') return !window.includes(key)
  return Number(end) < Number(window[0]) || Number(start) > Number(window[1])
}

function rowValueExtent(
  layout: ReturnType<typeof barEndpoints>,
  row: number,
  window: readonly ScaleValue[] | undefined,
): readonly [number, number] | undefined {
  let low = Infinity
  let high = -Infinity
  for (const layer of layout.layers) {
    const lower = layer.lowerAt(row)
    const upper = layer.upperAt(row)
    if (!Number.isFinite(lower) || !Number.isFinite(upper)) continue
    if (window && (upper < Number(window[0]) || lower > Number(window[1]))) continue
    low = Math.min(low, lower, 0)
    high = Math.max(high, upper, 0)
  }
  if (low <= high) return [low, high]
  return undefined
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
  const valueWindow = coordinate === 'category' ? window : undefined
  let low = Infinity
  let high = -Infinity
  for (let row = 0; row < mark.data.length; row += 1) {
    const key = mark.data.valueAt(options.x, row)
    const [start, end] = categoryRowBounds(mark, options, row, key)
    if (coordinate === 'value' && outsideCategoryWindow(key, start, end, window)) {
      continue
    }
    const extent = rowValueExtent(layout, row, valueWindow)
    if (!extent) continue
    if (coordinate === 'value') {
      low = Math.min(low, extent[0])
      high = Math.max(high, extent[1])
    } else if (typeof key === 'string') {
      categories.add(key)
    } else {
      low = Math.min(low, Number(start))
      high = Math.max(high, Number(end))
    }
  }
  if (categories.size) return Object.freeze([...categories])
  if (low <= high) return Object.freeze([low, high])
  return undefined
}

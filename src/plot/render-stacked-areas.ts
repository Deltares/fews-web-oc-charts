import { area, curveLinear, curveStep } from 'd3'
import type { TableView } from '../data-store/table.js'
import type { ScaleBinding, ScaleValue } from '../scales/scale.js'
import { stackedAreaEndpoints, type StackedAreaMark } from './stacked-area.js'
import { svgElement } from './render-axes.js'

function viewportRows(data: TableView, x: string, domain: readonly ScaleValue[]) {
  const low = Number(domain[0])
  const high = Number(domain[1])
  if (
    !data.length ||
    Number(data.valueAt(x, 0)) > high ||
    Number(data.valueAt(x, data.length - 1)) < low
  )
    return []
  function bound(value: number, inclusive: boolean) {
    let start = 0
    let end = data.length
    while (start < end) {
      const middle = Math.floor((start + end) / 2)
      const key = Number(data.valueAt(x, middle))
      if (key < value || (inclusive && key === value)) start = middle + 1
      else end = middle
    }
    return start
  }
  const start = Math.max(0, bound(low, false) - 1)
  const end = Math.min(data.length - 1, bound(high, true))
  // Keep every boundary on the same rows, including gaps and both viewport neighbours.
  return Array.from({ length: end - start + 1 }, (_, index) => start + index)
}

export function renderStackedAreas(
  group: SVGGElement,
  mark: StackedAreaMark,
  scales: Readonly<Record<string, ScaleBinding>>,
) {
  const options = mark.options.get().resolved
  const layout = stackedAreaEndpoints(mark)
  const x = scales[mark.x]
  const y = scales[mark.y]
  const rows = options.visible ? viewportRows(mark.data, options.x, x.scale.domain.get()) : []
  const existing = new Map(
    Array.from(group.children, (node) => [node.getAttribute('data-layer-id')!, node]),
  )
  const layers = [...layout.layers].sort((a, b) => a.slot - b.slot)
  for (const layer of layers) {
    let node = existing.get(layer.id)
    if (!node)
      node = svgElement('path', {
        'data-mark': 'stacked-area-layer',
        'data-layer-id': layer.id,
      })
    existing.delete(layer.id)
    const path = area<number>()
      .defined((row) => Number.isFinite(layer.lowerAt(row)) && Number.isFinite(layer.upperAt(row)))
      .x((row) => x.project(mark.data.valueAt(options.x, row)))
      .y0((row) => y.project(layer.lowerAt(row)))
      .y1((row) => y.project(layer.upperAt(row)))
      .curve(options.curve === 'step' ? curveStep : curveLinear)
    node.setAttribute('d', path(rows) ?? '')
    group.append(node)
  }
  for (const node of existing.values()) node.remove()
}

export function styleStackedAreas(group: SVGGElement, mark: StackedAreaMark, accent: string) {
  const options = mark.options.get().resolved
  const layers = new Map(options.layers.map((layer) => [layer.id, layer]))
  for (const node of group.children) {
    const layer = layers.get(node.getAttribute('data-layer-id')!)
    if (!layer) throw new Error('Missing stackedArea layer for rendered path.')
    node.setAttribute('fill', layer.fill ?? options.fill ?? `var(--fews-chart-accent, ${accent})`)
    node.setAttribute('fill-opacity', String(layer.opacity ?? options.opacity))
    node.setAttribute('stroke', layer.stroke ?? options.stroke ?? 'none')
    node.setAttribute('stroke-width', String(layer.strokeWidth ?? options.strokeWidth))
  }
}

export function stackedAreaExtent(
  mark: StackedAreaMark,
  coordinate: 'x' | 'y',
  window?: readonly ScaleValue[],
): readonly number[] | undefined {
  const options = mark.options.get().resolved
  if (!options.visible) return undefined
  const layout = stackedAreaEndpoints(mark)
  let low = Infinity
  let high = -Infinity
  for (let row = 0; row < mark.data.length; row += 1) {
    const x = Number(mark.data.valueAt(options.x, row))
    if (coordinate === 'y' && window && (x < Number(window[0]) || x > Number(window[1]))) continue
    for (const layer of layout.layers) {
      const lower = layer.lowerAt(row)
      const upper = layer.upperAt(row)
      if (!Number.isFinite(lower) || !Number.isFinite(upper)) continue
      if (coordinate === 'x' && window && (upper < Number(window[0]) || lower > Number(window[1])))
        continue
      low = Math.min(low, coordinate === 'x' ? x : Math.min(lower, 0))
      high = Math.max(high, coordinate === 'x' ? x : Math.max(upper, 0))
    }
  }
  // Include clipped boundary values when the viewport falls between source samples.
  if (coordinate === 'y' && window) {
    for (let row = 1; row < mark.data.length; row += 1) {
      const x0 = Number(mark.data.valueAt(options.x, row - 1))
      const x1 = Number(mark.data.valueAt(options.x, row))
      const start = Math.max(x0, Number(window[0]))
      const end = Math.min(x1, Number(window[1]))
      if (start > end) continue
      for (const layer of layout.layers) {
        const lower0 = layer.lowerAt(row - 1)
        const upper0 = layer.upperAt(row - 1)
        const lower1 = layer.lowerAt(row)
        const upper1 = layer.upperAt(row)
        if (![lower0, upper0, lower1, upper1].every(Number.isFinite)) continue
        if (options.curve === 'step') {
          const middle = x0 + (x1 - x0) / 2
          if (start <= middle) {
            low = Math.min(low, lower0, 0)
            high = Math.max(high, upper0, 0)
          }
          if (end >= middle) {
            low = Math.min(low, lower1, 0)
            high = Math.max(high, upper1, 0)
          }
        } else {
          for (const x of [start, end]) {
            const fraction = (x - x0) / (x1 - x0)
            low = Math.min(low, (1 - fraction) * lower0 + fraction * lower1, 0)
            high = Math.max(high, (1 - fraction) * upper0 + fraction * upper1, 0)
          }
        }
      }
    }
  }
  return low <= high ? Object.freeze([low, high]) : undefined
}

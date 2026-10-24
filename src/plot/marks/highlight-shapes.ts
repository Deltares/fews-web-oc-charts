import type { ScaleBinding } from '../../scales/scale.js'
import type { HighlightShape, MarkHit } from './mark-definition.js'
import type { LineMark } from './line/line.js'
import type { SeriesMark } from './line/series.js'
import type { BarMark } from './bar/bar.js'
import { barRectangles } from './bar/bar-geometry.js'
import { stackedAreaEndpoints, type StackedAreaMark } from './stacked-area/stacked-area.js'
import type { HeatmapMark } from './heatmap/heatmap.js'

type Scales = Readonly<Record<string, ScaleBinding>>

function finite(...values: number[]) {
  return values.every(Number.isFinite)
}

export function pointHighlight(
  mark: LineMark | SeriesMark,
  hit: MarkHit,
  color: string,
): readonly HighlightShape[] {
  const { px, py } = hit
  if (!finite(px, py)) return []
  const r = Math.max(3, (mark.markers?.size ?? 0) + 1)
  return [{ type: 'circle', cx: px, cy: py, r, fill: color }]
}

export function barHighlight(
  mark: BarMark,
  hit: MarkHit,
  scales: Scales,
  color: string,
): readonly HighlightShape[] {
  if (!('layerId' in hit)) return []
  const rectangle = barRectangles(mark, scales).find(
    (item) => item.row === hit.index && item.layerId === hit.layerId,
  )
  if (!rectangle) return []
  const { x, y, width, height } = rectangle
  return [{ type: 'rect', x, y, width, height, fill: color, stroke: 'currentColor' }]
}

/** Outlines the slice of the hovered layer that is nearest to the hovered sample. */
export function stackedAreaHighlight(
  mark: StackedAreaMark,
  hit: MarkHit,
  scales: Scales,
  color: string,
): readonly HighlightShape[] {
  if (!('layerId' in hit)) return []
  const { index: row, lower, upper } = hit
  const layer = stackedAreaEndpoints(mark).layers.find((item) => item.id === hit.layerId)
  const xScale = scales[mark.x]
  const yScale = scales[mark.y]
  if (!layer || !xScale || !yScale) return []
  const options = mark.options.get().resolved
  const px = xScale.project(mark.data.valueAt(options.x, row))
  if (!finite(px, lower, upper)) return []
  const edge = (neighbor: number) => {
    const fallback = { x: px, lower, upper }
    if (neighbor < 0 || neighbor >= mark.data.length) return fallback
    const x = xScale.project(mark.data.valueAt(options.x, neighbor))
    const nLower = layer.lowerAt(neighbor)
    const nUpper = layer.upperAt(neighbor)
    if (!finite(x, nLower, nUpper)) return fallback
    // Step curves change value halfway between samples, so the slice is flat.
    const step = options.curve === 'step'
    return {
      x: (px + x) / 2,
      lower: step ? lower : (lower + nLower) / 2,
      upper: step ? upper : (upper + nUpper) / 2,
    }
  }
  const before = edge(row - 1)
  const after = edge(row + 1)
  const y = (value: number) => yScale.project(value)
  const d = [
    `M${before.x},${y(before.upper)}`,
    `L${px},${y(upper)}`,
    `L${after.x},${y(after.upper)}`,
    `L${after.x},${y(after.lower)}`,
    `L${px},${y(lower)}`,
    `L${before.x},${y(before.lower)}`,
    'Z',
  ].join('')
  return [{ type: 'path', d, fill: color, stroke: 'currentColor' }]
}

export function heatmapHighlight(
  mark: HeatmapMark,
  hit: MarkHit,
  scales: Scales,
): readonly HighlightShape[] {
  if (!('xStart' in hit)) return []
  const { xStart, xEnd, yStart, yEnd } = hit
  const xScale = scales[mark.x]
  const yScale = scales[mark.y]
  if (!xScale || !yScale) return []
  const x0 = xScale.project(xStart)
  const x1 = xScale.project(xEnd)
  const y0 = yScale.project(yStart)
  const y1 = yScale.project(yEnd)
  if (!finite(x0, x1, y0, y1)) return []
  return [
    {
      type: 'rect',
      x: Math.min(x0, x1),
      y: Math.min(y0, y1),
      width: Math.abs(x1 - x0),
      height: Math.abs(y1 - y0),
      fill: 'none',
      stroke: 'currentColor',
    },
  ]
}

import type { ScaleBinding } from '../../scales/scale.js'
import type { HighlightShape, MarkHit } from './mark-definition.js'
import type { LineMark } from './line/line.js'
import type { SeriesMark } from './line/series.js'
import type { BarMark } from './bar/bar.js'
import { barRectangles } from './bar/bar-geometry.js'
import type { StackedAreaMark } from './stacked-area/stacked-area.js'
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
  const r = Math.max(3, Math.sqrt((mark.markers?.size ?? 0) / Math.PI) + 1)
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

/** Half the width of v4's area tick marker. */
const areaTickHalfWidth = 5

/**
 * Follows v4's ChartArea highlight: step curves fill the flat step around the hovered
 * sample; other curves mark the layer's lower and upper bounds with horizontal ticks.
 */
export function stackedAreaHighlight(
  mark: StackedAreaMark,
  hit: MarkHit,
  scales: Scales,
  color: string,
): readonly HighlightShape[] {
  if (!('layerId' in hit)) return []
  const { index: row, lower, upper } = hit
  const xScale = scales[mark.x]
  const yScale = scales[mark.y]
  if (!xScale || !yScale) return []
  const options = mark.options.get().resolved
  const px = xScale.project(mark.data.valueAt(options.x, row))
  const y0 = yScale.project(lower)
  const y1 = yScale.project(upper)
  if (!finite(px, y0, y1)) return []
  if (options.curve !== 'step') {
    const tick = (y: number) => `M${px - areaTickHalfWidth},${y}h${2 * areaTickHalfWidth}`
    return [{ type: 'path', d: tick(y1) + tick(y0), stroke: 'currentColor' }]
  }
  // d3.curveStep changes value halfway between samples.
  const edge = (neighbor: number) => {
    if (neighbor < 0 || neighbor >= mark.data.length) return px
    const x = xScale.project(mark.data.valueAt(options.x, neighbor))
    return Number.isFinite(x) ? (px + x) / 2 : px
  }
  const x0 = edge(row - 1)
  const x1 = edge(row + 1)
  return [{ type: 'path', d: `M${x0},${y1}H${x1}V${y0}H${x0}Z`, fill: color }]
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

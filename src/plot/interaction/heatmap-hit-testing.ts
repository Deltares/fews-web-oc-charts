import type { Region } from '../../layout/layout.js'
import type { ScaleBinding } from '../../scales/scale.js'
import type { HeatmapMark } from '../marks/heatmap/heatmap.js'

export interface HeatmapHit {
  readonly index: number
  readonly x: number
  readonly y: number
  readonly xStart: number
  readonly xEnd: number
  readonly yStart: number
  readonly yEnd: number
  readonly px: number
  readonly py: number
  readonly distance: number
  readonly value: number
}

export function heatmapHit(
  mark: HeatmapMark,
  scales: Readonly<Record<string, ScaleBinding>>,
  point: { readonly x: number; readonly y: number },
  _axis: 'x' | 'y' | 'xy',
  plot: Readonly<Region>,
): HeatmapHit | undefined {
  const options = mark.options.get().resolved
  if (!options.visible) return undefined
  const xScale = scales[mark.x]
  const yScale = scales[mark.y]
  if (!xScale || !yScale) return undefined
  const grid = mark.data.snapshot()
  if (!grid.columns || !grid.rows) return undefined

  const x = xScale.invert(point.x)
  const y = yScale.invert(point.y)
  if (typeof x !== 'number' || typeof y !== 'number') return undefined
  const column = containingCell(grid.xEdges, x)
  const row = containingCell(grid.yEdges, y)
  if (column < 0 || row < 0) return undefined

  const index = row * grid.columns + column
  const value = grid.valueAt(index)
  if (!Number.isFinite(value)) return undefined
  const xStart = grid.xEdges[column]
  const xEnd = grid.xEdges[column + 1]
  const yStart = grid.yEdges[row]
  const yEnd = grid.yEdges[row + 1]
  const hitX = xStart + (xEnd - xStart) / 2
  const hitY = yStart + (yEnd - yStart) / 2
  const px = xScale.project(hitX)
  const py = yScale.project(hitY)
  if (
    !Number.isFinite(px) ||
    !Number.isFinite(py) ||
    px < plot.x ||
    px > plot.x + plot.width ||
    py < plot.y ||
    py > plot.y + plot.height
  ) {
    return undefined
  }
  return Object.freeze({
    index,
    x: hitX,
    y: hitY,
    xStart,
    xEnd,
    yStart,
    yEnd,
    px,
    py,
    distance: Math.hypot(px - point.x, py - point.y),
    value,
  })
}

function containingCell(edges: readonly number[], value: number) {
  if (value < edges[0] || value > edges.at(-1)!) return -1
  let low = 0
  let high = edges.length - 1
  while (low < high) {
    const middle = (low + high) >>> 1
    if (value < edges[middle + 1]) high = middle
    else low = middle + 1
  }
  return Math.min(low, edges.length - 2)
}

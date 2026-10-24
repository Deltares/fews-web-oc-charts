import type { Region } from '../../layout/layout.js'
import type { ScaleBinding, ScaleValue } from '../../scales/scale.js'
import { quadtree, type Quadtree } from 'd3-quadtree'
import { isLineMark, type LineMark } from '../marks/line/line.js'
import { isSeriesMark, type SeriesMark } from '../marks/line/series.js'
import { isScaleValue } from '../marks/mark-definition.js'
import { maxInteractionIndexEntries, sameInteractionKey } from './interaction-index.js'

export type PointHitTestAxis = 'x' | 'y' | 'xy'
export type PointHitTestMark = LineMark | SeriesMark

export interface PointHit {
  readonly index: number
  readonly x: ScaleValue
  readonly y: ScaleValue
  readonly px: number
  readonly py: number
  readonly distance: number
}

interface IndexedPoint {
  readonly index: number
  readonly x: ScaleValue
  readonly y: ScaleValue
  readonly px: number
  readonly py: number
}

interface PointIndex {
  readonly key: readonly unknown[]
  readonly byX: readonly IndexedPoint[]
  readonly byY: readonly IndexedPoint[]
  readonly spatial: Quadtree<IndexedPoint>
}

const indexes = new WeakMap<PointHitTestMark, PointIndex>()

export function nearestPoint(
  mark: PointHitTestMark,
  scales: Readonly<Record<string, ScaleBinding>>,
  point: { readonly x: number; readonly y: number },
  axis: PointHitTestAxis,
  plot: Readonly<Region>,
): PointHit | undefined {
  const xScale = scales[mark.x]
  const yScale = scales[mark.y]
  if (!xScale || !yScale) return undefined

  const series = isSeriesMark(mark)
  if (series) {
    mark.options.get()
    if (!mark.visible) return undefined
    const _version = mark.data.version
  } else if (!isLineMark(mark)) {
    return undefined
  }

  const key = [
    series ? mark.data.version : mark.xValues,
    series ? mark.data.length : mark.xValues.length,
    series ? undefined : mark.yValues,
    series ? mark.data.length : mark.yValues.length,
    xScale,
    xScale.scale.domain.version,
    xScale.scale.options.version,
    ...xScale.range.get(),
    yScale,
    yScale.scale.domain.version,
    yScale.scale.options.version,
    ...yScale.range.get(),
    plot.x,
    plot.y,
    plot.width,
    plot.height,
  ]
  let pointIndex = indexes.get(mark)
  if (!pointIndex || !sameInteractionKey(pointIndex.key, key)) {
    pointIndex = buildPointIndex(mark, xScale, yScale, plot, key)
    indexes.set(mark, pointIndex)
  }

  let candidate: IndexedPoint | undefined
  if (axis === 'xy') {
    candidate = pointIndex.spatial.find(point.x, point.y)
  } else {
    const sorted = axis === 'x' ? pointIndex.byX : pointIndex.byY
    const target = axis === 'x' ? point.x : point.y
    let low = 0
    let high = sorted.length
    while (low < high) {
      const middle = (low + high) >>> 1
      const coordinate = axis === 'x' ? sorted[middle].px : sorted[middle].py
      if (coordinate < target) low = middle + 1
      else high = middle
    }
    const before = sorted[low - 1]
    const after = sorted[low]
    if (!before) candidate = after
    else if (!after) candidate = before
    else {
      const beforeDistance = Math.abs((axis === 'x' ? before.px : before.py) - target)
      const afterDistance = Math.abs((axis === 'x' ? after.px : after.py) - target)
      candidate =
        afterDistance < beforeDistance ||
        (afterDistance === beforeDistance && after.index < before.index)
          ? after
          : before
    }
  }
  if (!candidate) return undefined
  const dx = candidate.px - point.x
  const dy = candidate.py - point.y
  return Object.freeze({
    ...candidate,
    distance: axis === 'x' ? Math.abs(dx) : axis === 'y' ? Math.abs(dy) : Math.hypot(dx, dy),
  })
}

function buildPointIndex(
  mark: PointHitTestMark,
  xScale: ScaleBinding,
  yScale: ScaleBinding,
  plot: Readonly<Region>,
  key: readonly unknown[],
): PointIndex {
  const data = isSeriesMark(mark) ? mark.data : undefined
  const line = isLineMark(mark) ? mark : undefined
  const length = data?.length ?? line?.xValues.length ?? 0
  if (length > maxInteractionIndexEntries) {
    throw new RangeError(
      `Point hit testing supports at most ${maxInteractionIndexEntries} samples per mark.`,
    )
  }
  const points: IndexedPoint[] = []
  for (let index = 0; index < length; index += 1) {
    const x = data ? data.xAt(index) : line?.xValues[index]
    const y = data ? data.yAt(index) : line?.yValues[index]
    if (!isScaleValue(x) || !isScaleValue(y)) continue
    if (!canProject(xScale, x) || !canProject(yScale, y)) continue

    const px = xScale.project(x)
    const py = yScale.project(y)
    if (!Number.isFinite(px) || !Number.isFinite(py)) continue
    if (px < plot.x || px > plot.x + plot.width || py < plot.y || py > plot.y + plot.height) {
      continue
    }
    points.push(Object.freeze({ index, x, y, px, py }))
  }
  const byX = [...points].sort((left, right) => left.px - right.px || left.index - right.index)
  const byY = [...points].sort((left, right) => left.py - right.py || left.index - right.index)
  return {
    key,
    byX,
    byY,
    spatial: quadtree(
      points,
      (item) => item.px,
      (item) => item.py,
    ),
  }
}

function canProject(binding: ScaleBinding, value: ScaleValue) {
  if (binding.scale.kind === 'band') return binding.scale.domain.get().includes(value)
  return typeof value === 'number' && (binding.scale.kind !== 'log' || value > 0)
}

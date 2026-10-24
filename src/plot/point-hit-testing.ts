import type { Region } from '../layout/layout.js'
import type { ScaleBinding, ScaleValue } from '../scales/scale.js'
import { isLineMark, type LineMark } from './line.js'
import { isSeriesMark, type SeriesMark } from './series.js'
import { isScaleValue } from './mark-definition.js'

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

  const length = series ? mark.data.length : mark.xValues.length
  let nearest: PointHit | undefined
  for (let index = 0; index < length; index += 1) {
    const x = series ? mark.data.xAt(index) : mark.xValues[index]
    const y = series ? mark.data.yAt(index) : mark.yValues[index]
    if (!isScaleValue(x) || !isScaleValue(y)) continue
    if (!canProject(xScale, x) || !canProject(yScale, y)) continue

    const px = xScale.project(x)
    const py = yScale.project(y)
    if (!Number.isFinite(px) || !Number.isFinite(py)) continue
    if (px < plot.x || px > plot.x + plot.width || py < plot.y || py > plot.y + plot.height) {
      continue
    }

    const dx = px - point.x
    const dy = py - point.y
    const distance = axis === 'x' ? Math.abs(dx) : axis === 'y' ? Math.abs(dy) : Math.hypot(dx, dy)
    if (!nearest || distance < nearest.distance) {
      nearest = Object.freeze({ index, x, y, px, py, distance })
    }
  }
  return nearest
}

function canProject(binding: ScaleBinding, value: ScaleValue) {
  if (binding.scale.kind === 'band') return binding.scale.domain.get().includes(value)
  return typeof value === 'number' && (binding.scale.kind !== 'log' || value > 0)
}

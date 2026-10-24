import type { Region } from '../layout/layout.js'
import type { ScaleBinding, ScaleValue } from '../scales/scale.js'
import { barEndpoints, barLayers, isBarMark, type BarMark } from './bar.js'
import { barRectangles, type BarRectangle } from './bar-geometry.js'
import { isStackedAreaMark, stackedAreaEndpoints, type StackedAreaMark } from './stacked-area.js'
import { stackedAreaPath, stackedAreaPaths } from './render-stacked-areas.js'

export type CompositeHitTestAxis = 'x' | 'y' | 'xy'

export interface CompositeHit {
  readonly index: number
  readonly x: ScaleValue
  readonly y: ScaleValue
  readonly px: number
  readonly py: number
  readonly distance: number
  readonly layerId: string
  readonly layerLabel: string
  readonly value: number
  readonly stack?: string
  readonly lower: number
  readonly upper: number
}

export function compositeHits(
  mark: BarMark | StackedAreaMark,
  scales: Readonly<Record<string, ScaleBinding>>,
  point: { readonly x: number; readonly y: number },
  axis: CompositeHitTestAxis,
  plot: Readonly<Region>,
  pathContext?: CanvasRenderingContext2D,
): readonly CompositeHit[] {
  if (isBarMark(mark)) return barHits(mark, scales, point, axis, plot)
  if (!isStackedAreaMark(mark)) return []
  if (!pathContext)
    throw new Error('Stacked-area tooltip hit testing requires a 2D canvas context.')
  return areaHits(mark, scales, point, axis, plot, pathContext)
}

function barHits(
  mark: BarMark,
  scales: Readonly<Record<string, ScaleBinding>>,
  point: { readonly x: number; readonly y: number },
  axis: CompositeHitTestAxis,
  plot: Readonly<Region>,
): readonly CompositeHit[] {
  const options = mark.options.get().resolved
  const rectangles = barRectangles(mark, scales)
  if (!rectangles.length) return []

  const rows = new Map<number, BarRectangle[]>()
  for (const rectangle of rectangles) {
    const row = rows.get(rectangle.row) ?? []
    row.push(rectangle)
    rows.set(rectangle.row, row)
  }
  const horizontal = options.orientation === 'horizontal'
  const categoryAxis = horizontal ? 'y' : 'x'
  const rowCenter = (row: readonly BarRectangle[], coordinateAxis: 'x' | 'y') => {
    const start =
      coordinateAxis === 'x'
        ? Math.min(...row.map((item) => item.x))
        : Math.min(...row.map((item) => item.y))
    const end =
      coordinateAxis === 'x'
        ? Math.max(...row.map((item) => item.x + item.width))
        : Math.max(...row.map((item) => item.y + item.height))
    return (start + end) / 2
  }

  if (axis === 'xy') {
    if (
      point.x < plot.x ||
      point.x > plot.x + plot.width ||
      point.y < plot.y ||
      point.y > plot.y + plot.height
    )
      return []
    const rectangle = [...rectangles]
      .reverse()
      .find(
        (item) =>
          item.width > 0 &&
          item.height > 0 &&
          point.x >= item.x &&
          point.x <= item.x + item.width &&
          point.y >= item.y &&
          point.y <= item.y + item.height,
      )
    return rectangle ? [barHit(mark, rectangle, 0)] : []
  }

  if (axis === categoryAxis) {
    const coordinate = axis === 'x' ? point.x : point.y
    const chosen = [...rows.values()].reduce<BarRectangle[]>(
      (closest, row) =>
        !closest.length ||
        Math.abs(rowCenter(row, axis) - coordinate) <
          Math.abs(rowCenter(closest, axis) - coordinate)
          ? row
          : closest,
      [],
    )
    if (!chosen.length) return []
    const distance = Math.abs(rowCenter(chosen, axis) - coordinate)
    return chosen.map((rectangle) => barHit(mark, rectangle, distance))
  }

  const coordinate = axis === 'x' ? point.x : point.y
  const rectangle = rectangles.reduce(
    (closest, item) => {
      const center = axis === 'x' ? item.x + item.width / 2 : item.y + item.height / 2
      return !closest ||
        Math.abs(center - coordinate) <
          Math.abs(
            (axis === 'x' ? closest.x + closest.width / 2 : closest.y + closest.height / 2) -
              coordinate,
          )
        ? item
        : closest
    },
    undefined as BarRectangle | undefined,
  )
  const center = rectangle
    ? axis === 'x'
      ? rectangle.x + rectangle.width / 2
      : rectangle.y + rectangle.height / 2
    : 0
  return rectangle ? [barHit(mark, rectangle, Math.abs(center - coordinate))] : []
}

function barHit(
  mark: BarMark,
  rectangle: ReturnType<typeof barRectangles>[number],
  distance: number,
): CompositeHit {
  const options = mark.options.get().resolved
  const layer = barLayers(options).find((item) => item.id === rectangle.layerId)!
  const endpoint = barEndpoints(mark).layers.find((item) => item.id === layer.id)!
  const value = Number(mark.data.valueAt(layer.y, rectangle.row))
  const key = mark.data.valueAt(options.x, rectangle.row)
  const horizontal = options.orientation === 'horizontal'
  const x = horizontal ? value : key
  const y = horizontal ? key : value
  const px = rectangle.x + rectangle.width / 2
  const py = rectangle.y + rectangle.height / 2
  return Object.freeze({
    index: rectangle.row,
    x,
    y,
    px,
    py,
    distance,
    layerId: layer.id,
    layerLabel: layer.label || layer.id,
    value,
    stack: layer.stack,
    lower: endpoint.lowerAt(rectangle.row),
    upper: endpoint.upperAt(rectangle.row),
  })
}

function areaHits(
  mark: StackedAreaMark,
  scales: Readonly<Record<string, ScaleBinding>>,
  point: { readonly x: number; readonly y: number },
  axis: CompositeHitTestAxis,
  plot: Readonly<Region>,
  pathContext: CanvasRenderingContext2D,
): readonly CompositeHit[] {
  const options = mark.options.get().resolved
  if (!options.visible || mark.data.length === 0) return []
  const xScale = scales[mark.x]
  const yScale = scales[mark.y]
  const layout = stackedAreaEndpoints(mark)
  const paths = stackedAreaPaths(mark, scales)
  const visible = layout.layers.filter(
    (layer) => options.layers.find((candidate) => candidate.id === layer.id)?.visible !== false,
  )

  if (axis === 'xy') {
    if (
      point.x < plot.x ||
      point.x > plot.x + plot.width ||
      point.y < plot.y ||
      point.y > plot.y + plot.height
    )
      return []
    for (const layer of [...visible].reverse()) {
      const shape = paths.find((candidate) => candidate.layer.id === layer.id)
      if (shape && pathContext.isPointInPath(stackedAreaPath(shape), point.x, point.y)) {
        const row = nearestAreaRow(mark, xScale, point.x)
        const hit = areaHit(mark, layer, row, scales, 0)
        return hit ? [hit] : []
      }
    }
    return []
  }

  if (axis === 'x') {
    const row = nearestAreaRow(mark, xScale, point.x)
    return visible.flatMap((layer) => {
      const hit = areaHit(
        mark,
        layer,
        row,
        scales,
        Math.abs(xScale.project(mark.data.valueAt(options.x, row)) - point.x),
      )
      return hit ? [hit] : []
    })
  }

  let closest: CompositeHit | undefined
  for (const layer of visible) {
    for (let row = 0; row < mark.data.length; row += 1) {
      const hit = areaHit(mark, layer, row, scales, 0)
      if (!hit) continue
      const distance = Math.abs(yScale.project(hit.value) - point.y)
      if (!closest || distance < closest.distance) closest = Object.freeze({ ...hit, distance })
    }
  }
  return closest ? [closest] : []
}

function nearestAreaRow(mark: StackedAreaMark, xScale: ScaleBinding, pixel: number) {
  const options = mark.options.get().resolved
  let nearest = 0
  let distance = Infinity
  for (let row = 0; row < mark.data.length; row += 1) {
    const x = mark.data.valueAt(options.x, row)
    if (typeof x !== 'number' || !Number.isFinite(x)) continue
    const current = Math.abs(xScale.project(x) - pixel)
    if (current < distance) {
      nearest = row
      distance = current
    }
  }
  return nearest
}

function areaHit(
  mark: StackedAreaMark,
  layer: ReturnType<typeof stackedAreaEndpoints>['layers'][number],
  row: number,
  scales: Readonly<Record<string, ScaleBinding>>,
  distance: number,
): CompositeHit | undefined {
  const options = mark.options.get().resolved
  const lower = layer.lowerAt(row)
  const upper = layer.upperAt(row)
  const value = Number(
    mark.data.valueAt(options.layers.find((item) => item.id === layer.id)!.y, row),
  )
  const x = mark.data.valueAt(options.x, row)
  if (
    typeof x !== 'number' ||
    !Number.isFinite(x) ||
    !Number.isFinite(value) ||
    !Number.isFinite(lower) ||
    !Number.isFinite(upper)
  )
    return undefined
  const descriptor = options.layers.find((item) => item.id === layer.id)!
  return Object.freeze({
    index: row,
    x,
    y: value,
    px: scales[mark.x].project(x),
    py: scales[mark.y].project(value),
    distance,
    layerId: layer.id,
    layerLabel: descriptor.label || layer.id,
    value,
    stack: layer.stack,
    lower,
    upper,
  })
}

import type { Region } from '../layout/layout.js'
import type { ScaleBinding, ScaleValue } from '../scales/scale.js'
import { barEndpoints, barLayers, isBarMark, type BarMark } from './bar.js'
import { barRectangles, type BarRectangle } from './bar-geometry.js'
import {
  isStackedAreaMark,
  stackedAreaEndpoints,
  type StackedAreaLayer,
  type StackedAreaMark,
} from './stacked-area.js'
import { stackedAreaPath, stackedAreaPaths } from './render-stacked-areas.js'
import { scaleKey } from './mark-definition.js'
import {
  createSpatialGrid,
  lowerBound,
  maxInteractionIndexEntries,
  sameInteractionKey,
  type SpatialGrid,
} from './interaction-index.js'

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

interface BarRow {
  readonly center: number
  readonly rectangles: readonly BarRectangle[]
}

interface BarHitIndex {
  readonly plotKey: readonly number[]
  readonly rows: readonly BarRow[]
  readonly values: readonly BarRectangle[]
  spatial: SpatialGrid<BarRectangle> | undefined
  readonly order: ReadonlyMap<BarRectangle, number>
  readonly layers: ReadonlyMap<string, ReturnType<typeof barLayers>[number]>
  readonly endpoints: ReadonlyMap<string, ReturnType<typeof barEndpoints>['layers'][number]>
}

const barIndexes = new WeakMap<readonly BarRectangle[], BarHitIndex>()

interface AreaValue {
  readonly py: number
  readonly row: number
  readonly layer: ReturnType<typeof stackedAreaEndpoints>['layers'][number]
}

interface AreaValueIndex {
  readonly key: readonly unknown[]
  readonly values: readonly AreaValue[]
  readonly descriptors: ReadonlyMap<string, StackedAreaLayer>
}

const areaValueIndexes = new WeakMap<StackedAreaMark, AreaValueIndex>()

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
  const index = barIndex(mark, rectangles, plot)
  const horizontal = options.orientation === 'horizontal'
  const categoryAxis = horizontal ? 'y' : 'x'

  if (axis === 'xy') {
    if (
      point.x < plot.x ||
      point.x > plot.x + plot.width ||
      point.y < plot.y ||
      point.y > plot.y + plot.height
    )
      return []
    const spatial = (index.spatial ??= createSpatialGrid(
      rectangles,
      (rectangle) => rectangle,
      plot,
    ))
    const rectangle = [...spatial.at(point.x, point.y)]
      .sort((left, right) => index.order.get(left)! - index.order.get(right)!)
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
    return rectangle ? [barHit(mark, rectangle, 0, index)] : []
  }

  if (axis === categoryAxis) {
    const coordinate = axis === 'x' ? point.x : point.y
    const rowIndex = lowerBound(index.rows, coordinate, (row) => row.center)
    const before = index.rows[rowIndex - 1]
    const after = index.rows[rowIndex]
    const chosen =
      !before ||
      (after && Math.abs(after.center - coordinate) < Math.abs(before.center - coordinate))
        ? after
        : before
    if (!chosen) return []
    const distance = Math.abs(chosen.center - coordinate)
    return chosen.rectangles.map((rectangle) => barHit(mark, rectangle, distance, index))
  }

  const coordinate = axis === 'x' ? point.x : point.y
  const valueIndex = lowerBound(index.values, coordinate, (item) =>
    axis === 'x' ? item.x + item.width / 2 : item.y + item.height / 2,
  )
  const before = index.values[valueIndex - 1]
  const after = index.values[valueIndex]
  const rectangle =
    !before ||
    (after &&
      Math.abs(
        (axis === 'x' ? after.x + after.width / 2 : after.y + after.height / 2) - coordinate,
      ) <
        Math.abs(
          (axis === 'x' ? before.x + before.width / 2 : before.y + before.height / 2) - coordinate,
        ))
      ? after
      : before
  const center = rectangle
    ? axis === 'x'
      ? rectangle.x + rectangle.width / 2
      : rectangle.y + rectangle.height / 2
    : 0
  return rectangle ? [barHit(mark, rectangle, Math.abs(center - coordinate), index)] : []
}

function barIndex(
  mark: BarMark,
  rectangles: readonly BarRectangle[],
  plot: Readonly<Region>,
): BarHitIndex {
  const plotKey = [plot.x, plot.y, plot.width, plot.height]
  const cached = barIndexes.get(rectangles)
  if (cached && sameInteractionKey(cached.plotKey, plotKey)) return cached
  if (rectangles.length > maxInteractionIndexEntries) {
    throw new RangeError(
      `Bar hit testing supports at most ${maxInteractionIndexEntries} rectangles per mark.`,
    )
  }
  const options = mark.options.get().resolved
  const horizontal = options.orientation === 'horizontal'
  const rows = new Map<number, BarRectangle[]>()
  for (const rectangle of rectangles) {
    const row = rows.get(rectangle.row) ?? []
    row.push(rectangle)
    rows.set(rectangle.row, row)
  }
  const indexedRows = [...rows.values()]
    .map((row) => {
      let low = Infinity
      let high = -Infinity
      for (const item of row) {
        const start = horizontal ? item.y : item.x
        const end = start + (horizontal ? item.height : item.width)
        low = Math.min(low, start)
        high = Math.max(high, end)
      }
      return Object.freeze({ center: (low + high) / 2, rectangles: Object.freeze(row) })
    })
    .sort((left, right) => left.center - right.center)
  const valueAxis = horizontal ? 'x' : 'y'
  const values = [...rectangles].sort((left, right) => {
    const leftCenter = valueAxis === 'x' ? left.x + left.width / 2 : left.y + left.height / 2
    const rightCenter = valueAxis === 'x' ? right.x + right.width / 2 : right.y + right.height / 2
    return leftCenter - rightCenter || left.row - right.row
  })
  const endpointLayout = barEndpoints(mark)
  const layerOptions = barLayers(options)
  const index: BarHitIndex = {
    plotKey,
    rows: indexedRows,
    values,
    order: new Map(rectangles.map((rectangle, order) => [rectangle, order])),
    spatial: undefined,
    layers: new Map(layerOptions.map((layer) => [layer.id, layer])),
    endpoints: new Map(endpointLayout.layers.map((layer) => [layer.id, layer])),
  }
  barIndexes.set(rectangles, index)
  return index
}

function barHit(
  mark: BarMark,
  rectangle: ReturnType<typeof barRectangles>[number],
  distance: number,
  index: BarHitIndex,
): CompositeHit {
  const options = mark.options.get().resolved
  const layer = index.layers.get(rectangle.layerId)!
  const endpoint = index.endpoints.get(layer.id)!
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
  const pathsByLayer = new Map(paths.map((path) => [path.layer.id, path]))
  const visibleIds = new Set(
    options.layers.filter((layer) => layer.visible !== false).map((layer) => layer.id),
  )
  const visible = layout.layers.filter((layer) => visibleIds.has(layer.id))

  if (axis === 'xy') {
    if (
      point.x < plot.x ||
      point.x > plot.x + plot.width ||
      point.y < plot.y ||
      point.y > plot.y + plot.height
    )
      return []
    for (const layer of [...visible].reverse()) {
      const shape = pathsByLayer.get(layer.id)
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
  const index = areaValueIndex(mark, scales, layout.layers, visible)
  const nearest = lowerBound(index.values, point.y, (item) => item.py)
  const before = index.values[nearest - 1]
  const after = index.values[nearest]
  const candidate =
    !before || (after && Math.abs(after.py - point.y) < Math.abs(before.py - point.y))
      ? after
      : before
  return candidate
    ? [
        areaHit(
          mark,
          candidate.layer,
          candidate.row,
          scales,
          Math.abs(candidate.py - point.y),
          index.descriptors,
        )!,
      ]
    : []
}

function nearestAreaRow(mark: StackedAreaMark, xScale: ScaleBinding, pixel: number) {
  const options = mark.options.get().resolved
  const target = xScale.invert(pixel)
  let low = 0
  let high = mark.data.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (Number(mark.data.valueAt(options.x, middle)) < Number(target)) low = middle + 1
    else high = middle
  }
  const before = low - 1
  const after = low
  if (before < 0) return Math.min(after, mark.data.length - 1)
  if (after >= mark.data.length) return before
  const beforePixel = xScale.project(Number(mark.data.valueAt(options.x, before)))
  const afterPixel = xScale.project(Number(mark.data.valueAt(options.x, after)))
  return Math.abs(afterPixel - pixel) < Math.abs(beforePixel - pixel) ? after : before
}

function areaValueIndex(
  mark: StackedAreaMark,
  scales: Readonly<Record<string, ScaleBinding>>,
  layers: ReturnType<typeof stackedAreaEndpoints>['layers'],
  visible: ReturnType<typeof stackedAreaEndpoints>['layers'],
): AreaValueIndex {
  const x = scales[mark.x]
  const y = scales[mark.y]
  const key = [mark.data.version, mark.options.version, ...scaleKey(x), ...scaleKey(y)]
  const cached = areaValueIndexes.get(mark)
  if (cached && sameInteractionKey(cached.key, key)) return cached

  const options = mark.options.get().resolved
  const count = mark.data.length * visible.length
  if (count > maxInteractionIndexEntries) {
    throw new RangeError(
      `Stacked-area hit testing supports at most ${maxInteractionIndexEntries} layer samples per mark.`,
    )
  }
  const descriptors = new Map(options.layers.map((layer) => [layer.id, layer]))
  const visibleIds = new Set(visible.map((layer) => layer.id))
  const candidates: AreaValue[] = []
  for (const endpoint of layers) {
    if (!visibleIds.has(endpoint.id)) continue
    for (let row = 0; row < mark.data.length; row += 1) {
      const lower = endpoint.lowerAt(row)
      const upper = endpoint.upperAt(row)
      const layer = descriptors.get(endpoint.id)!
      const value = Number(mark.data.valueAt(layer.y, row))
      if (!Number.isFinite(value) || !Number.isFinite(lower) || !Number.isFinite(upper)) continue
      candidates.push({ py: y.project(value), row, layer: endpoint })
    }
  }
  const values = Object.freeze(candidates.sort((left, right) => left.py - right.py))
  const index = { key, values, descriptors }
  areaValueIndexes.set(mark, index)
  return index
}

function areaHit(
  mark: StackedAreaMark,
  layer: ReturnType<typeof stackedAreaEndpoints>['layers'][number],
  row: number,
  scales: Readonly<Record<string, ScaleBinding>>,
  distance: number,
  descriptors?: ReadonlyMap<string, StackedAreaLayer>,
): CompositeHit | undefined {
  const options = mark.options.get().resolved
  const lower = layer.lowerAt(row)
  const upper = layer.upperAt(row)
  const descriptor =
    descriptors?.get(layer.id) ?? options.layers.find((item) => item.id === layer.id)!
  const value = Number(mark.data.valueAt(descriptor.y, row))
  const x = mark.data.valueAt(options.x, row)
  if (
    typeof x !== 'number' ||
    !Number.isFinite(x) ||
    !Number.isFinite(value) ||
    !Number.isFinite(lower) ||
    !Number.isFinite(upper)
  )
    return undefined
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

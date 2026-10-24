import type { PlotContext } from './plugin-definition.js'
import type { TooltipMark, TooltipOptions, TooltipPlacementPosition } from './tooltip.js'
import { isLineMark } from './line.js'
import { isSeriesMark } from './series.js'
import { nearestPoint, type PointHit } from './point-hit-testing.js'
import { compositeHits, type CompositeHit } from './composite-hit-testing.js'
import { isBarMark } from './bar.js'
import { isStackedAreaMark } from './stacked-area.js'
import { displayInspectionValue as displayValue, type CrosshairInspection } from './inspection.js'
import type { Region } from '../layout/layout.js'
import type { PlotPointer } from './pointer-hub.js'

type TooltipHit = PointHit | CompositeHit
type TooltipContext = Pick<PlotContext, 'scales' | 'inspectCrosshair'>
interface TooltipHitEntry {
  readonly mark: TooltipMark
  readonly hit: TooltipHit
  readonly index: number
}

export interface TooltipEntry {
  readonly label: string
  readonly color: string
  readonly details: string
  readonly accessibleLabel: string
  readonly symbol: {
    readonly size: number
    readonly radius: string
    readonly fill: string
    readonly border: string | undefined
  }
}

export interface TooltipModel {
  readonly point: { readonly x: number; readonly y: number }
  readonly position: TooltipPlacementPosition
  readonly entries: readonly TooltipEntry[]
  readonly accessibleLabel: string
}

export function isTooltipMark(mark: object): mark is TooltipMark {
  return isLineMark(mark) || isSeriesMark(mark) || isBarMark(mark) || isStackedAreaMark(mark)
}

function label(mark: TooltipMark, index: number) {
  if (isSeriesMark(mark))
    return mark.options.get().resolved.label || mark.id || `Series ${index + 1}`
  if (isBarMark(mark) || isStackedAreaMark(mark)) {
    const options = mark.options.get().resolved
    return options.label || mark.id || `Mark ${index + 1}`
  }
  return mark.id || mark.y
}

function tooltipColor(mark: TooltipMark, hit: TooltipHit) {
  if ('layerId' in hit && (isBarMark(mark) || isStackedAreaMark(mark))) {
    const options = mark.options.get().resolved
    const layer = options.layers?.find((candidate) => candidate.id === hit.layerId)
    return layer?.fill ?? options.fill ?? 'var(--fews-chart-accent, currentColor)'
  }
  if (isLineMark(mark) || isSeriesMark(mark)) {
    return mark.stroke ?? mark.markers?.fill ?? 'var(--fews-chart-accent, currentColor)'
  }
  return 'var(--fews-chart-accent, currentColor)'
}

function compositeValueAxis(mark: TooltipMark, hit: TooltipHit) {
  if (!('layerId' in hit)) return undefined
  return isBarMark(mark) && mark.options.get().resolved.orientation === 'horizontal' ? 'x' : 'y'
}

function compositeDetails(
  mark: TooltipMark,
  hit: CompositeHit,
  context: TooltipContext,
  digits: number | undefined,
) {
  const valueScale =
    isBarMark(mark) && mark.options.get().resolved.orientation === 'horizontal' ? mark.x : mark.y
  const format = (value: number) => displayValue(value, context, valueScale, digits)
  const parts = [format(hit.value)]
  if (hit.stack !== undefined) parts.push(`stack: ${hit.stack}`)
  parts.push(`bounds: ${format(hit.lower)}–${format(hit.upper)}`)
  return parts
}

function tooltipEntry(
  { mark, hit, index }: TooltipHitEntry,
  context: TooltipContext,
  options: Readonly<TooltipOptions>,
  inspection: CrosshairInspection | undefined,
): TooltipEntry {
  const pointMark = isLineMark(mark) || isSeriesMark(mark)
  const markers = pointMark && !('layerId' in hit) ? mark.markers : undefined
  const color = tooltipColor(mark, hit)
  const digits = options.digits ?? (pointMark ? mark.digits : undefined)
  const x = displayValue(hit.x, context, mark.x)
  const y = displayValue(hit.y, context, mark.y, digits)
  const redundant = (axis: 'x' | 'y') =>
    inspection?.coordinates.some(
      (coordinate) =>
        coordinate.axis === axis &&
        coordinate.scale === mark[axis] &&
        coordinate.value === hit[axis] &&
        displayValue(coordinate.value, context, coordinate.scale, coordinate.digits) ===
          (axis === 'x' ? x : y),
    )
  const name =
    'layerLabel' in hit ? `${label(mark, index)} · ${hit.layerLabel}` : label(mark, index)
  const details: string[] = []
  const accessible = [name]
  const valueAxis = compositeValueAxis(mark, hit)
  if (options.showX && valueAxis !== 'x') {
    accessible.push(x)
    if (!redundant('x')) {
      details.push(context.scales[mark.x]?.scale.kind === 'time' ? x : `x: ${x}`)
    }
  }
  if (valueAxis !== 'y') {
    accessible.push(`y: ${y}`)
    if (!redundant('y')) details.push(inspection ? y : `y: ${y}`)
  }
  if ('layerId' in hit) {
    const composite = compositeDetails(mark, hit, context, digits)
    details.push(...composite)
    accessible.push(...composite)
  }
  return {
    label: name,
    color,
    details: details.length ? ` · ${details.join(' · ')}` : '',
    accessibleLabel: accessible.join(' · '),
    symbol: {
      size: (pointMark ? (mark.markers?.size ?? 4) : 4) * 2,
      radius: 'layerId' in hit ? '1px' : '50%',
      fill: markers?.fill || color,
      border:
        markers?.stroke && markers.stroke !== 'none'
          ? `${markers.strokeWidth ?? 0}px solid ${markers.stroke}`
          : undefined,
    },
  }
}

export function computeTooltipModel(
  options: Readonly<TooltipOptions>,
  context: TooltipContext,
  state: {
    readonly marks: readonly object[]
    readonly pointer: PlotPointer
    readonly region: Readonly<Region>
  },
  pathContext: () => CanvasRenderingContext2D | undefined,
): TooltipModel {
  const { pointer, region } = state
  const marks = options.marks ?? state.marks.filter(isTooltipMark)
  const inspection = options.crosshair ? context.inspectCrosshair(options.crosshair) : undefined
  const point = inspection?.point ?? { x: pointer.px + region.x, y: pointer.py + region.y }
  const axis = inspection?.options.snap?.axis ?? options.axis
  const hits: TooltipHitEntry[] =
    pointer.inside && (!inspection || inspection.visible)
      ? marks.flatMap<TooltipHitEntry>((mark, index): TooltipHitEntry[] => {
          if (axis === 'xy' && inspection?.options.snap && mark !== inspection.options.snap.mark) {
            return []
          }
          if (isBarMark(mark) || isStackedAreaMark(mark)) {
            if (inspection?.options.snap?.mark === mark) {
              return inspection.hits.flatMap((hit) =>
                'layerId' in hit ? [{ mark, hit, index }] : [],
              )
            }
            return compositeHits(
              mark,
              context.scales,
              point,
              axis,
              region,
              isStackedAreaMark(mark) ? pathContext() : undefined,
            ).map((hit) => ({ mark, hit, index }))
          }
          if (isLineMark(mark) || isSeriesMark(mark)) {
            const hit =
              inspection?.options.snap?.mark === mark
                ? inspection.hit
                : nearestPoint(mark, context.scales, point, axis, region)
            return hit ? [{ mark, hit, index }] : []
          }
          return []
        })
      : []
  const selected =
    axis === 'xy'
      ? hits.reduce<typeof hits>(
          (closest, item) =>
            !closest.length || item.hit.distance < closest[0].hit.distance ? [item] : closest,
          [],
        )
      : hits
  const entries = selected.map((item) => tooltipEntry(item, context, options, inspection))
  return {
    point,
    position: options.position,
    entries,
    accessibleLabel: entries.map((entry) => entry.accessibleLabel).join('; '),
  }
}

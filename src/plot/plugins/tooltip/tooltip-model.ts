import type { PlotContext } from '../plugin-definition.js'
import type { TooltipMark, TooltipOptions, TooltipPlacementPosition } from './tooltip.js'
import { isLineMark } from '../../marks/line/line.js'
import { isSeriesMark } from '../../marks/line/series.js'
import type { CompositeHit } from '../../interaction/composite-hit-testing.js'
import { isBarMark } from '../../marks/bar/bar.js'
import { isStackedAreaMark } from '../../marks/stacked-area/stacked-area.js'
import {
  displayInspectionValue as displayValue,
  type CrosshairInspection,
} from '../../interaction/inspection.js'
import type { Region } from '../../../layout/layout.js'
import type { PlotPointer } from '../../interaction/pointer-hub.js'
import { isHistogramMark } from '../../marks/histogram/histogram.js'
import { isHeatmapMark } from '../../marks/heatmap/heatmap.js'
import type { HeatmapHit } from '../../interaction/heatmap-hit-testing.js'
import { markDefinition } from '../../marks/marks.js'
import type { MarkHit } from '../../marks/mark-definition.js'
import type { SymbolSpec } from '../legend/legend.js'
import { lineLegendSymbol } from '../../marks/mark-styles.js'

type TooltipHit = MarkHit
type TooltipContext = Pick<PlotContext, 'scales' | 'inspectCrosshair' | 'theme'>

function isHeatmapHit(hit: TooltipHit): hit is HeatmapHit {
  return 'xStart' in hit
}

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
  readonly symbol: SymbolSpec
}

export interface TooltipModel {
  readonly point: { readonly x: number; readonly y: number }
  readonly position: TooltipPlacementPosition
  readonly entries: readonly TooltipEntry[]
  readonly accessibleLabel: string
}

export function isTooltipMark(mark: object): mark is TooltipMark {
  return (
    isLineMark(mark) ||
    isSeriesMark(mark) ||
    isBarMark(mark) ||
    isStackedAreaMark(mark) ||
    isHistogramMark(mark) ||
    isHeatmapMark(mark)
  )
}

function label(mark: TooltipMark, index: number) {
  if (isSeriesMark(mark))
    return mark.options.get().resolved.label || mark.id || `Series ${index + 1}`
  if (isBarMark(mark) || isStackedAreaMark(mark)) {
    const options = mark.options.get().resolved
    return options.label || mark.id || `Mark ${index + 1}`
  }
  if (isHistogramMark(mark)) {
    const options = mark.options.get().resolved
    return options.label || mark.id || `Histogram ${index + 1}`
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
  if (isHistogramMark(mark)) {
    return mark.options.get().resolved.fill ?? 'var(--fews-chart-accent, currentColor)'
  }
  if (isHeatmapMark(mark) && isHeatmapHit(hit)) {
    return mark.options.get().resolved.color.map(hit.value)
  }
  return 'var(--fews-chart-accent, currentColor)'
}

function compositeValueAxis(mark: TooltipMark, hit: TooltipHit) {
  if (!('layerId' in hit)) return undefined
  return (isBarMark(mark) || isHistogramMark(mark)) &&
    mark.options.get().resolved.orientation === 'horizontal'
    ? 'x'
    : 'y'
}

function compositeDetails(
  mark: TooltipMark,
  hit: CompositeHit,
  context: TooltipContext,
  digits: number | undefined,
) {
  const valueScale =
    (isBarMark(mark) || isHistogramMark(mark)) &&
    mark.options.get().resolved.orientation === 'horizontal'
      ? mark.x
      : mark.y
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
  if (isHeatmapMark(mark) && isHeatmapHit(hit)) {
    const heatmapOptions = mark.options.get().resolved
    const name = label(mark, index)
    const value = displayValue(hit.value, context, mark.y, options.digits ?? 2)
    const xStart = displayValue(hit.xStart, context, mark.x)
    const xEnd = displayValue(hit.xEnd, context, mark.x)
    const yStart = displayValue(hit.yStart, context, mark.y)
    const yEnd = displayValue(hit.yEnd, context, mark.y)
    const details = [
      ...(options.showX ? [`x: ${xStart}–${xEnd}`] : []),
      `y: ${yStart}–${yEnd}`,
      `value: ${value}`,
    ]
    return {
      label: name,
      color: heatmapOptions.color.map(hit.value),
      details: ` · ${details.join(' · ')}`,
      accessibleLabel: `${name} · ${details.join(' · ')}`,
      symbol: {
        type: 'bar',
        fill: heatmapOptions.color.map(hit.value),
      },
    }
  }
  const pointMark = isLineMark(mark) || isSeriesMark(mark)
  const tokens = context.theme.get()
  const legend = markDefinition(mark).legend?.(mark, tokens)
  const symbol = isLineMark(mark) ? lineLegendSymbol(mark, tokens) : legend?.symbol
  if (!symbol) throw new Error('Tooltip marks must provide a legend symbol.')
  const layer =
    'layerId' in hit ? legend?.layers?.find((candidate) => candidate.id === hit.layerId) : undefined
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
    symbol: layer?.symbol ?? symbol,
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
          const markHits =
            inspection?.options.snap?.mark === mark
              ? inspection.hits
              : (markDefinition(mark).hits?.(mark, {
                  scales: context.scales,
                  point,
                  axis,
                  plot: region,
                  pathContext,
                }) ?? [])
          return markHits.map((hit) => ({ mark, hit, index }))
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

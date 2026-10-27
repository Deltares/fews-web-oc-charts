import type { PlotContext } from '../plugin-definition.js'
import type {
  TooltipFormatContext,
  TooltipMark,
  TooltipOptions,
  TooltipPlacementPosition,
} from './tooltip.js'
import { isLineMark } from '../../marks/line/line.js'
import { isSeriesMark } from '../../marks/line/series.js'
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
import { isEnsembleMark } from '../../marks/ensemble/ensemble.js'
import { ensemblePartSymbol, ensembleSymbol } from '../../marks/ensemble/ensemble-mark.js'
import { isEnsembleHit } from '../../interaction/ensemble-hit-testing.js'
import { isHeatmapHit, isHoverMark, markColor, selectHoverHits } from '../hover-hits.js'
import { markDefinition } from '../../marks/marks.js'
import type { MarkHit, MarkLegend } from '../../marks/mark-definition.js'
import type { SymbolSpec } from '../legend/legend.js'
import { lineLegendSymbol } from '../../marks/mark-styles.js'
import type { ScaleValue } from '../../../scales/scale.js'

type TooltipHit = MarkHit
type TooltipContext = Pick<PlotContext, 'scales' | 'inspectCrosshair' | 'theme'>

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

export const isTooltipMark: (mark: object) => mark is TooltipMark = isHoverMark

function label(mark: TooltipMark, index: number, legend: MarkLegend | undefined) {
  if (legend?.label) return legend.label
  if (isSeriesMark(mark)) return mark.id || `Series ${index + 1}`
  if (isBarMark(mark) || isStackedAreaMark(mark)) return mark.id || `Mark ${index + 1}`
  if (isHistogramMark(mark)) return mark.id || `Histogram ${index + 1}`
  if (isEnsembleMark(mark)) return mark.id || `Ensemble ${index + 1}`
  return mark.id || mark.y
}

function compositeValueAxis(mark: TooltipMark): 'x' | 'y' {
  return (isBarMark(mark) || isHistogramMark(mark)) &&
    mark.options.get().resolved.orientation === 'horizontal'
    ? 'x'
    : 'y'
}

function formatterText(value: string, hook: string): string {
  if (typeof value !== 'string') throw new TypeError(`tooltip.${hook} must return a string.`)
  return value
}

function tooltipFormatter(
  mark: TooltipMark,
  hit: TooltipHit,
  context: TooltipContext,
  options: Readonly<TooltipOptions>,
) {
  const formatContext = (
    axis: TooltipFormatContext['axis'],
    digits: number | undefined,
    defaultText: string,
  ): TooltipFormatContext => ({
    mark,
    hit,
    axis,
    scale: axis === 'value' ? undefined : mark[axis],
    digits,
    defaultText,
  })
  const valueText = (value: ScaleValue, info: TooltipFormatContext) => {
    const defaultText = displayValue(value, context, info.scale ?? mark.y, info.digits)
    return options.formatValue
      ? formatterText(options.formatValue(value, { ...info, defaultText }), 'formatValue')
      : defaultText
  }
  const withUnit = (text: string, info: TooltipFormatContext) => {
    const unit = options.formatUnit
      ? formatterText(options.formatUnit({ ...info, defaultText: text }), 'formatUnit')
      : ''
    return unit ? `${text} ${unit}` : text
  }
  return {
    value(value: ScaleValue, axis: TooltipFormatContext['axis'], digits?: number) {
      const info = formatContext(axis, digits, '')
      return withUnit(valueText(value, info), info)
    },
    range(lower: ScaleValue, upper: ScaleValue, axis: 'x' | 'y', digits?: number) {
      const info = formatContext(axis, digits, '')
      const defaultText = `${valueText(lower, info)}–${valueText(upper, info)}`
      const text = options.formatRange
        ? formatterText(options.formatRange(lower, upper, { ...info, defaultText }), 'formatRange')
        : defaultText
      return withUnit(text, info)
    },
  }
}

/** One row per drawn band, statistic and control member, styled like its legend layer. */
function ensemblePartEntries(
  { mark, hit }: TooltipHitEntry,
  context: TooltipContext,
  options: Readonly<TooltipOptions>,
): TooltipEntry[] {
  if (!isEnsembleMark(mark) || !isEnsembleHit(hit)) return []
  const format = tooltipFormatter(mark, hit, context, options)
  const tokens = context.theme.get()
  const ensembleOptions = mark.options.get().resolved
  const entries: TooltipEntry[] = hit.parts.map((part) => {
    const details =
      part.part === 'spread'
        ? format.range(part.lower!, part.upper!, 'y', options.digits)
        : format.value(part.value!, 'y', options.digits)
    return {
      label: part.label,
      color: tokens.tooltipColor,
      details: ` · ${details}`,
      accessibleLabel: `${part.label} · ${details}`,
      symbol: ensemblePartSymbol(ensembleOptions, tokens, part.part),
    }
  })
  if (hit.exceedance && Number.isFinite(hit.exceedance.probability)) {
    const label = `P(>${format.value(hit.exceedance.threshold, 'y', options.digits)})`
    const probability = `${Math.round(hit.exceedance.probability * 100)}%`
    entries.push({
      label,
      color: tokens.tooltipColor,
      details: ` · ${probability}`,
      accessibleLabel: `${label} · ${probability}`,
      symbol: { type: 'line', stroke: tokens.foreground, strokeDasharray: '2 2' },
    })
  }
  return entries
}

function tooltipEntry(
  { mark, hit, index }: TooltipHitEntry,
  context: TooltipContext,
  options: Readonly<TooltipOptions>,
  inspection: CrosshairInspection | undefined,
): TooltipEntry {
  const format = tooltipFormatter(mark, hit, context, options)
  const showX = options.showX ?? options.axis !== 'x'
  const showY = options.showY ?? options.axis !== 'y'
  const coordinate = (axis: 'x' | 'y', text: string) =>
    options.coordinateLabels ? `${axis}: ${text}` : text
  const tokens = context.theme.get()
  const legend = markDefinition(mark).legend?.(mark, tokens)
  const name = label(mark, index, legend)
  if (isHeatmapMark(mark) && isHeatmapHit(hit)) {
    const heatmapOptions = mark.options.get().resolved
    const value = format.value(hit.value, 'value', options.digits ?? 2)
    const details = [
      ...(showX ? [coordinate('x', format.range(hit.xStart, hit.xEnd, 'x'))] : []),
      ...(showY ? [coordinate('y', format.range(hit.yStart, hit.yEnd, 'y'))] : []),
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
  if (isEnsembleMark(mark) && isEnsembleHit(hit)) {
    const values = options.digits
    const details = [
      ...(showX ? [coordinate('x', format.value(hit.x, 'x'))] : []),
      ...(showY && hit.member ? [`${hit.member.label}: ${format.value(hit.y, 'y', values)}`] : []),
    ]
    return {
      label: name,
      color: markColor(mark, hit, tokens, 'text'),
      details: details.length ? ` · ${details.join(' · ')}` : '',
      accessibleLabel: [name, ...details].join(' · '),
      symbol: legend?.symbol ?? ensembleSymbol(mark.options.get().resolved, tokens),
    }
  }
  const pointMark = isLineMark(mark) || isSeriesMark(mark)
  const symbol = isLineMark(mark) ? lineLegendSymbol(mark, tokens) : legend?.symbol
  if (!symbol) throw new Error('Tooltip marks must provide a legend symbol.')
  const layer =
    'layerId' in hit ? legend?.layers?.find((candidate) => candidate.id === hit.layerId) : undefined
  const color = markColor(mark, hit, tokens, 'text')
  const digits = options.digits ?? (pointMark ? mark.digits : undefined)
  const valueAxis = 'layerId' in hit ? compositeValueAxis(mark) : undefined
  const x = valueAxis !== 'x' && showX ? format.value(hit.x, 'x') : ''
  const y = valueAxis !== 'y' && showY ? format.value(hit.y, 'y', digits) : ''
  const redundant = (axis: 'x' | 'y') =>
    inspection?.coordinates.some(
      (coordinate) =>
        coordinate.axis === axis &&
        coordinate.scale === mark[axis] &&
        coordinate.value === hit[axis] &&
        displayValue(coordinate.value, context, coordinate.scale, coordinate.digits) ===
          (axis === 'x' ? x : y),
    )
  const entryName = 'layerLabel' in hit && hit.layerLabel ? `${name} · ${hit.layerLabel}` : name
  const details: string[] = []
  const accessible = [entryName]
  if (showX && valueAxis !== 'x') {
    const text = coordinate('x', x)
    accessible.push(text)
    if (!redundant('x')) details.push(text)
  }
  if (showY && valueAxis !== 'y') {
    const text = coordinate('y', y)
    accessible.push(text)
    if (!redundant('y')) details.push(text)
  }
  if ('layerId' in hit) {
    const axis = compositeValueAxis(mark)
    const composite = [format.value(hit.value, axis, digits)]
    if (hit.stack !== undefined) composite.push(`stack: ${hit.stack}`)
    if (
      options.bounds === 'always' ||
      ((options.bounds ?? 'stacked') === 'stacked' && hit.stack !== undefined)
    ) {
      composite.push(`bounds: ${format.range(hit.lower, hit.upper, axis, digits)}`)
    }
    details.push(...composite)
    accessible.push(...composite)
  }
  return {
    label: entryName,
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
  const {
    point,
    inspection,
    hits: selected,
  } = selectHoverHits(options, context, state, pathContext)
  const entries = selected.flatMap((item) => [
    tooltipEntry(item, context, options, inspection),
    ...ensemblePartEntries(item, context, options),
  ])
  return {
    point,
    position: options.position,
    entries,
    accessibleLabel: entries.map((entry) => entry.accessibleLabel).join('; '),
  }
}

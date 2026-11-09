import type { PlotContext } from '../plugin-definition.js'
import type {
  TooltipDetail,
  TooltipEntryContext,
  TooltipEntryKind,
  TooltipEntryOverride,
  TooltipEntryText,
  TooltipFormatContext,
  TooltipLayout,
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
  /** Details for the inline layout, each preceded by ' · '. */
  readonly details: string
  /** Details joined by ' · ', for the columns layout. */
  readonly values: string
  readonly accessibleLabel: string
  readonly symbol: SymbolSpec
}

export interface TooltipModel {
  readonly point: { readonly x: number; readonly y: number }
  readonly position: TooltipPlacementPosition
  readonly layout: TooltipLayout
  readonly header: string | undefined
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

/** A row before `formatEntry`: its default text, accessible-only details and context. */
interface DraftEntry {
  readonly context: TooltipEntryContext
  readonly name: string
  readonly details: readonly TooltipDetail[]
  /** All details in accessible order, including coordinates the crosshair already shows. */
  readonly accessibleDetails: readonly TooltipDetail[]
  readonly color: string
  readonly symbol: SymbolSpec
}

type Formatter = ReturnType<typeof tooltipFormatter>

const detailText = (detail: TooltipDetail) =>
  detail.label ? `${detail.label}: ${detail.text}` : detail.text

function entryContext(
  kind: TooltipEntryKind,
  { mark, hit }: TooltipHitEntry,
  legend: MarkLegend | undefined,
  extra: Partial<TooltipEntryContext> = {},
): TooltipEntryContext {
  return {
    kind,
    mark,
    hit,
    markLabel: legend?.label || undefined,
    layer: undefined,
    part: undefined,
    exceedance: undefined,
    ...extra,
  }
}

function draft(
  context: TooltipEntryContext,
  name: string,
  details: readonly TooltipDetail[],
  style: { readonly color: string; readonly symbol: SymbolSpec },
  accessibleDetails: readonly TooltipDetail[] = details,
): DraftEntry {
  return { context, name, details, accessibleDetails, ...style }
}

/** One row per drawn band, statistic and control member, styled like its legend layer. */
function ensemblePartDrafts(
  item: TooltipHitEntry,
  context: TooltipContext,
  options: Readonly<TooltipOptions>,
): DraftEntry[] {
  const { mark, hit } = item
  if (!isEnsembleMark(mark) || !isEnsembleHit(hit)) return []
  const format = tooltipFormatter(mark, hit, context, options)
  const tokens = context.theme.get()
  const legend = markDefinition(mark).legend?.(mark, tokens)
  const ensembleOptions = mark.options.get().resolved
  const drafts = hit.parts.map((part) => {
    const detail: TooltipDetail =
      part.part === 'spread'
        ? { key: 'range', text: format.range(part.lower!, part.upper!, 'y', options.digits) }
        : { key: 'value', text: format.value(part.value!, 'y', options.digits) }
    return draft(entryContext('ensemblePart', item, legend, { part }), part.label, [detail], {
      color: tokens.tooltipColor,
      symbol: ensemblePartSymbol(ensembleOptions, tokens, part.part),
    })
  })
  const exceedance = hit.exceedance
  if (exceedance && Number.isFinite(exceedance.probability)) {
    const name = `P(>${format.value(exceedance.threshold, 'y', options.digits)})`
    const probability = `${Math.round(exceedance.probability * 100)}%`
    drafts.push(
      draft(
        entryContext('exceedance', item, legend, { exceedance }),
        name,
        [{ key: 'probability', text: probability }],
        {
          color: tokens.tooltipColor,
          symbol: { type: 'line', stroke: tokens.foreground, strokeDasharray: '2 2' },
        },
      ),
    )
  }
  return drafts
}

/**
 * Like the legend, a layer of an unlabelled mark is named by its own label alone;
 * a labelled mark prefixes its layers with the mark label.
 */
function layerEntryName(name: string, legend: MarkLegend | undefined, hit: MarkHit) {
  if (!('layerLabel' in hit) || !hit.layerLabel) return name
  return legend?.label ? `${name} · ${hit.layerLabel}` : hit.layerLabel
}

interface DraftSetup {
  readonly item: TooltipHitEntry
  readonly context: TooltipContext
  readonly options: Readonly<TooltipOptions>
  readonly format: Formatter
  readonly legend: MarkLegend | undefined
  readonly name: string
  readonly showX: boolean
  readonly showY: boolean
  readonly coordinate: (axis: 'x' | 'y', text: string) => TooltipDetail
}

function heatmapDraft(setup: DraftSetup): DraftEntry | undefined {
  const { item, format, options, showX, showY, coordinate } = setup
  const { mark, hit } = item
  if (!isHeatmapMark(mark) || !isHeatmapHit(hit)) return undefined
  const color = mark.options.get().resolved.color.map(hit.value)
  const details: TooltipDetail[] = [
    ...(showX ? [coordinate('x', format.range(hit.xStart, hit.xEnd, 'x'))] : []),
    ...(showY ? [coordinate('y', format.range(hit.yStart, hit.yEnd, 'y'))] : []),
    { key: 'value', label: 'value', text: format.value(hit.value, 'value', options.digits ?? 2) },
  ]
  return draft(entryContext('heatmap', item, setup.legend), setup.name, details, {
    color,
    symbol: { type: 'bar', fill: color },
  })
}

function ensembleDraft(setup: DraftSetup): DraftEntry | undefined {
  const { item, format, options, showX, showY, coordinate, legend } = setup
  const { mark, hit } = item
  if (!isEnsembleMark(mark) || !isEnsembleHit(hit)) return undefined
  const tokens = setup.context.theme.get()
  const details: TooltipDetail[] = [
    ...(showX ? [coordinate('x', format.value(hit.x, 'x'))] : []),
    ...(showY && hit.member
      ? [
          {
            key: 'member' as const,
            label: hit.member.label,
            text: format.value(hit.y, 'y', options.digits),
          },
        ]
      : []),
  ]
  return draft(entryContext('ensemble', item, legend), setup.name, details, {
    color: markColor(mark, hit, tokens, 'text'),
    symbol: legend?.symbol ?? ensembleSymbol(mark.options.get().resolved, tokens),
  })
}

/** Raw value, stack and (by `bounds`) the stacked bounds of a bar or stacked-area layer. */
function compositeDetails(
  hit: Extract<MarkHit, { layerId: string }>,
  axis: 'x' | 'y',
  setup: DraftSetup,
  digits: number | undefined,
): TooltipDetail[] {
  const { format, options } = setup
  const details: TooltipDetail[] = [{ key: 'value', text: format.value(hit.value, axis, digits) }]
  if (hit.stack !== undefined) details.push({ key: 'stack', label: 'stack', text: hit.stack })
  const bounds = options.bounds ?? 'stacked'
  if (bounds === 'always' || (bounds === 'stacked' && hit.stack !== undefined)) {
    const text = format.range(hit.lower, hit.upper, axis, digits)
    details.push({ key: 'bounds', label: 'bounds', text })
  }
  return details
}

/**
 * The x and y coordinates of a sample, except a composite's value axis. Coordinates the
 * crosshair already shows identically stay in the accessible text only.
 */
function coordinateDetails(
  setup: DraftSetup,
  inspection: CrosshairInspection | undefined,
  valueAxis: 'x' | 'y' | undefined,
  digits: number | undefined,
) {
  const { item, context, format, coordinate } = setup
  const { mark, hit } = item
  const details: TooltipDetail[] = []
  const accessibleDetails: TooltipDetail[] = []
  for (const axis of ['x', 'y'] as const) {
    if (valueAxis === axis || !(axis === 'x' ? setup.showX : setup.showY)) continue
    const text = format.value(hit[axis], axis, axis === 'y' ? digits : undefined)
    const detail = coordinate(axis, text)
    accessibleDetails.push(detail)
    const redundant = inspection?.coordinates.some(
      (shown) =>
        shown.axis === axis &&
        shown.scale === mark[axis] &&
        shown.value === hit[axis] &&
        displayValue(shown.value, context, shown.scale, shown.digits) === text,
    )
    if (!redundant) details.push(detail)
  }
  return { details, accessibleDetails }
}

function seriesDraft(setup: DraftSetup, inspection: CrosshairInspection | undefined): DraftEntry {
  const { item, context, options, legend } = setup
  const { mark, hit } = item
  const tokens = context.theme.get()
  const pointMark = isLineMark(mark) || isSeriesMark(mark)
  const symbol = isLineMark(mark) ? lineLegendSymbol(mark, tokens) : legend?.symbol
  if (!symbol) throw new Error('Tooltip marks must provide a legend symbol.')
  const composite = 'layerId' in hit ? hit : undefined
  const layer = composite && legend?.layers?.find((candidate) => candidate.id === composite.layerId)
  const digits = options.digits ?? (pointMark ? mark.digits : undefined)
  const valueAxis = composite ? compositeValueAxis(mark) : undefined
  const { details, accessibleDetails } = coordinateDetails(setup, inspection, valueAxis, digits)
  if (composite) {
    const extra = compositeDetails(composite, valueAxis!, setup, digits)
    details.push(...extra)
    accessibleDetails.push(...extra)
  }
  const kind = composite ? 'layer' : 'series'
  const layerContext = composite
    ? { id: composite.layerId, label: composite.layerLabel }
    : undefined
  return draft(
    entryContext(kind, item, legend, { layer: layerContext }),
    layerEntryName(setup.name, legend, hit),
    details,
    { color: markColor(mark, hit, tokens, 'text'), symbol: layer?.symbol ?? symbol },
    accessibleDetails,
  )
}

function draftEntry(
  item: TooltipHitEntry,
  context: TooltipContext,
  options: Readonly<TooltipOptions>,
  inspection: CrosshairInspection | undefined,
): DraftEntry {
  const legend = markDefinition(item.mark).legend?.(item.mark, context.theme.get())
  const setup: DraftSetup = {
    item,
    context,
    options,
    format: tooltipFormatter(item.mark, item.hit, context, options),
    legend,
    name: label(item.mark, item.index, legend),
    showX: options.showX ?? options.axis !== 'x',
    showY: options.showY ?? options.axis !== 'y',
    coordinate: (axis, text) =>
      options.coordinateLabels ? { key: axis, label: axis, text } : { key: axis, text },
  }
  return heatmapDraft(setup) ?? ensembleDraft(setup) ?? seriesDraft(setup, inspection)
}

function overrideDetail(detail: TooltipDetail | string): TooltipDetail {
  if (typeof detail === 'string') return { key: 'value', text: detail }
  if (
    !detail ||
    typeof detail.text !== 'string' ||
    (detail.label !== undefined && typeof detail.label !== 'string')
  ) {
    throw new TypeError('tooltip.formatEntry details must be strings or { label?, text } objects.')
  }
  return detail
}

function checkedOverride(result: unknown): TooltipEntryOverride | undefined {
  if (result === undefined) return undefined
  if (typeof result !== 'object' || result === null || Array.isArray(result)) {
    throw new TypeError('tooltip.formatEntry must return an object, null or undefined.')
  }
  const override = result as TooltipEntryOverride
  for (const key of ['name', 'accessibleLabel'] as const) {
    if (override[key] !== undefined && typeof override[key] !== 'string') {
      throw new TypeError(`tooltip.formatEntry ${key} must be a string.`)
    }
  }
  if (override.details !== undefined && !Array.isArray(override.details)) {
    throw new TypeError('tooltip.formatEntry details must be an array.')
  }
  return override
}

/** Applies `formatEntry`; returns undefined for a hidden row. */
function finishEntry(
  entry: DraftEntry,
  formatEntry: TooltipOptions['formatEntry'],
): (TooltipEntry & { readonly text: TooltipEntryText }) | undefined {
  const defaults: TooltipEntryText = Object.freeze({
    name: entry.name,
    details: Object.freeze([...entry.details]),
  })
  const result = formatEntry?.(defaults, Object.freeze(entry.context))
  if (result === null) return undefined
  const override = checkedOverride(result)
  const name = override?.name ?? entry.name
  const details = override?.details?.map(overrideDetail) ?? entry.details
  const accessibleDetails = override?.details ? details : entry.accessibleDetails
  const texts = details.map(detailText)
  return {
    label: name,
    color: entry.color,
    details: texts.length ? ` · ${texts.join(' · ')}` : '',
    values: texts.join(' · '),
    accessibleLabel:
      override?.accessibleLabel ?? [name, ...accessibleDetails.map(detailText)].join(' · '),
    symbol: entry.symbol,
    text: Object.freeze({ name, details: Object.freeze(details) }),
  }
}

function headerText(
  options: Readonly<TooltipOptions>,
  context: TooltipContext,
  inspection: CrosshairInspection | undefined,
  first: TooltipHitEntry | undefined,
  entries: readonly TooltipEntryText[],
): string | undefined {
  if (!options.formatHeader || !entries.length) return undefined
  const shown = inspection?.coordinates.find((coordinate) => coordinate.axis === 'x')
  const x = shown ? shown.value : first?.hit.x
  const scale = shown ? shown.scale : first?.mark.x
  const defaultText =
    x === undefined || scale === undefined ? '' : displayValue(x, context, scale, shown?.digits)
  const text = options.formatHeader(Object.freeze({ x, scale, defaultText, entries }))
  if (text !== undefined && typeof text !== 'string') {
    throw new TypeError('tooltip.formatHeader must return a string or undefined.')
  }
  return text || undefined
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
  const { point, inspection, hits } = selectHoverHits(options, context, state, pathContext)
  const { maxDistance } = options
  const selected =
    maxDistance === undefined ? hits : hits.filter((item) => item.hit.distance <= maxDistance)
  const finished = selected
    .flatMap((item) => [
      draftEntry(item, context, options, inspection),
      ...ensemblePartDrafts(item, context, options),
    ])
    .map((entry) => finishEntry(entry, options.formatEntry))
    .filter((entry) => entry !== undefined)
  const entries = finished.map(({ text: _text, ...entry }) => entry)
  const header = headerText(
    options,
    context,
    inspection,
    selected[0],
    finished.map((entry) => entry.text),
  )
  return {
    point,
    position: options.position,
    layout: options.layout,
    header,
    entries,
    accessibleLabel: [header, ...entries.map((entry) => entry.accessibleLabel)]
      .filter(Boolean)
      .join('; '),
  }
}

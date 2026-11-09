import {
  createOptionState,
  type OptionPatch,
  type OptionStateSnapshot,
} from '../../../core/options.js'
import { optionSignal } from '../../../core/runtime.js'
import type { ReadonlySignal } from '../../../core/reactive.js'
import { validateKeys } from '../../../core/validation.js'
import { isLineMark, type LineMark } from '../../marks/line/line.js'
import { isSeriesMark, type SeriesMark } from '../../marks/line/series.js'
import { isCrosshairHandle, type CrosshairHandle } from '../crosshair/crosshair.js'
import { isBarMark, type BarMark } from '../../marks/bar/bar.js'
import { isStackedAreaMark, type StackedAreaMark } from '../../marks/stacked-area/stacked-area.js'
import { isHistogramMark, type HistogramMark } from '../../marks/histogram/histogram.js'
import { isHeatmapMark, type HeatmapMark } from '../../marks/heatmap/heatmap.js'
import { isEnsembleMark, type EnsembleMark } from '../../marks/ensemble/ensemble.js'
import type { MarkHit } from '../../marks/mark-definition.js'
import type { EnsembleHitPart } from '../../interaction/ensemble-hit-testing.js'
import type { ScaleValue } from '../../../scales/scale.js'

export type TooltipAxis = 'x' | 'y' | 'xy'
export type TooltipPlacementPosition = 'bottom' | 'left' | 'right' | 'top'
export type TooltipMark =
  | LineMark
  | SeriesMark
  | BarMark
  | StackedAreaMark
  | HistogramMark
  | HeatmapMark
  | EnsembleMark

export interface TooltipFormatContext {
  readonly mark: TooltipMark
  readonly hit: Readonly<MarkHit>
  /** Heatmap cell values use 'value', independently of their x/y coordinates. */
  readonly axis: 'x' | 'y' | 'value'
  /** Undefined for heatmap cell values, which have no positional scale. */
  readonly scale: string | undefined
  readonly digits: number | undefined
  /** Text before this hook; range defaults use formatted endpoints without units. */
  readonly defaultText: string
}

export type TooltipValueFormatter = (value: ScaleValue, context: TooltipFormatContext) => string
export type TooltipUnitFormatter = (context: TooltipFormatContext) => string
export type TooltipRangeFormatter = (
  lower: ScaleValue,
  upper: ScaleValue,
  context: TooltipFormatContext,
) => string

/** What a tooltip row describes. */
export type TooltipEntryKind =
  /** A line, series or histogram sample. */
  | 'series'
  /** A layer of a bar or stacked-area mark. */
  | 'layer'
  | 'heatmap'
  /** The nearest ensemble member or statistic line. */
  | 'ensemble'
  /** An ensemble band, median, mean or control row. */
  | 'ensemblePart'
  /** The ensemble exceedance probability row. */
  | 'exceedance'

export type TooltipDetailKey =
  | 'x'
  | 'y'
  | 'value'
  | 'stack'
  | 'bounds'
  | 'member'
  | 'range'
  | 'probability'

/** One part of a row after its name, shown as `label: text`, or `text` without a label. */
export interface TooltipDetail {
  readonly key: TooltipDetailKey
  readonly label?: string
  readonly text: string
}

/** The text of one tooltip row: its name and the details after it. */
export interface TooltipEntryText {
  readonly name: string
  readonly details: readonly TooltipDetail[]
}

export interface TooltipEntryContext {
  readonly kind: TooltipEntryKind
  readonly mark: TooltipMark
  readonly hit: Readonly<MarkHit>
  /** The mark's `label`; undefined when it has none and its name falls back to its id. */
  readonly markLabel: string | undefined
  /** The hovered layer of a bar or stacked-area mark. */
  readonly layer: { readonly id: string; readonly label: string | undefined } | undefined
  /** The ensemble band, median, mean or control part of an `ensemblePart` row. */
  readonly part: Readonly<EnsembleHitPart> | undefined
  /** Threshold and probability of an `exceedance` row. */
  readonly exceedance: Readonly<{ threshold: number; probability: number }> | undefined
}

/**
 * Replaces parts of a row. Omitted fields keep their defaults; the accessible label is built
 * from the result unless given. Strings in `details` are shown as they are.
 */
export interface TooltipEntryOverride {
  readonly name?: string
  readonly details?: readonly (TooltipDetail | string)[]
  readonly accessibleLabel?: string
}

/** Returns changes to a row, `undefined` to keep it, or `null` to hide it. */
export type TooltipEntryFormatter = (
  entry: TooltipEntryText,
  context: TooltipEntryContext,
) => TooltipEntryOverride | null | undefined

export interface TooltipHeaderContext {
  /** The inspected x: the crosshair's x coordinate, else the first row's sample x. */
  readonly x: ScaleValue | undefined
  readonly scale: string | undefined
  /** `x` formatted as an x coordinate would be, or '' without an x. */
  readonly defaultText: string
  /** The rows below the header, after `formatEntry`. */
  readonly entries: readonly TooltipEntryText[]
}

/** Returns a header line above the rows, or `undefined`/'' for none. */
export type TooltipHeaderFormatter = (context: TooltipHeaderContext) => string | undefined

export type TooltipLayout = 'inline' | 'columns'

export interface TooltipOptions {
  axis: TooltipAxis
  /** Inspected marks; symbols reuse their legend styles, with layer and heatmap hit colors. */
  marks?: readonly TooltipMark[]
  position: TooltipPlacementPosition
  /** Includes the sample's x coordinate. Defaults to axis !== 'x'. */
  showX?: boolean
  /** Includes the sample's y coordinate. Defaults to axis !== 'y'. */
  showY?: boolean
  /** Prefixes coordinates with x: and y:. Default: false. */
  coordinateLabels: boolean
  /** Decimal places for values and composite bounds; defaults to the mark's precision. */
  digits?: number
  /** When to append composite bounds to visible and accessible text. Default: 'stacked'. */
  bounds?: 'always' | 'stacked' | 'never'
  /** Formats coordinates, values and range endpoints before units are appended. */
  formatValue?: TooltipValueFormatter
  /** Returns a unit suffix (or ''), appended once with a separating space. */
  formatUnit?: TooltipUnitFormatter
  /** Formats composite bounds and heatmap ranges before units are appended. */
  formatRange?: TooltipRangeFormatter
  /** Changes or hides a row after its default text is built. */
  formatEntry?: TooltipEntryFormatter
  /** Adds a header line above the rows, e.g. the hovered time once with `showX: false`. */
  formatHeader?: TooltipHeaderFormatter
  /**
   * Leaves out a mark's row when its nearest sample is more than this many CSS pixels from
   * the pointer along the tooltip axis, e.g. for sparse series. Default: no limit.
   */
  maxDistance?: number
  /**
   * 'inline' follows each name with its details; 'columns' aligns names and right-aligns
   * details in a grid, so tabular figures line up. Default: 'inline'.
   */
  layout: TooltipLayout
  /** Follows this installed crosshair and omits coordinates already shown by its callouts. */
  crosshair?: CrosshairHandle
}

export interface TooltipHandle {
  readonly options: ReadonlySignal<OptionStateSnapshot<TooltipOptions>>
  update(patch: OptionPatch<TooltipOptions>): void
}

const handles = new WeakSet<object>()
const validators = new WeakMap<TooltipHandle, Set<(options: Readonly<TooltipOptions>) => void>>()
const optionKeys = [
  'axis',
  'marks',
  'position',
  'crosshair',
  'showX',
  'showY',
  'coordinateLabels',
  'digits',
  'bounds',
  'formatValue',
  'formatUnit',
  'formatRange',
  'formatEntry',
  'formatHeader',
  'maxDistance',
  'layout',
]

function validateMarks(marks: readonly TooltipMark[] | undefined) {
  if (marks === undefined) return
  if (!Array.isArray(marks)) throw new TypeError('tooltip.marks must be an array.')
  if (
    marks.some(
      (mark) =>
        !mark ||
        (!isLineMark(mark) &&
          !isSeriesMark(mark) &&
          !isBarMark(mark) &&
          !isStackedAreaMark(mark) &&
          !isHistogramMark(mark) &&
          !isHeatmapMark(mark) &&
          !isEnsembleMark(mark)),
    )
  ) {
    throw new TypeError(
      'tooltip.marks must contain line(), series(), bar(), stackedArea(), histogram(), heatmap() or ensemble() marks.',
    )
  }
  if (new Set(marks).size !== marks.length) {
    throw new Error('tooltip.marks must not contain duplicate marks.')
  }
}

export function validateTooltipUpdates(
  handle: TooltipHandle,
  validate: (options: Readonly<TooltipOptions>) => void,
) {
  const consumers = validators.get(handle)
  if (!consumers) throw new Error('Expected a tooltip handle.')
  consumers.add(validate)
  return () => consumers.delete(validate)
}

export function isTooltipHandle(value: object): value is TooltipHandle {
  return handles.has(value)
}

function validateLayout(options: Readonly<TooltipOptions>) {
  if (
    options.maxDistance !== undefined &&
    (typeof options.maxDistance !== 'number' ||
      Number.isNaN(options.maxDistance) ||
      options.maxDistance < 0)
  ) {
    throw new RangeError('tooltip.maxDistance must be a nonnegative number.')
  }
  if (!['inline', 'columns'].includes(options.layout)) {
    throw new Error('tooltip.layout must be inline or columns.')
  }
}

function validateFormatting(options: Readonly<TooltipOptions>) {
  for (const key of [
    'formatValue',
    'formatUnit',
    'formatRange',
    'formatEntry',
    'formatHeader',
  ] as const) {
    if (options[key] !== undefined && typeof options[key] !== 'function') {
      throw new TypeError(`tooltip.${key} must be a function.`)
    }
  }
  for (const key of ['showX', 'showY'] as const) {
    if (options[key] !== undefined && typeof options[key] !== 'boolean') {
      throw new TypeError(`tooltip.${key} must be boolean.`)
    }
  }
  if (typeof options.coordinateLabels !== 'boolean') {
    throw new TypeError('tooltip.coordinateLabels must be boolean.')
  }
  validateLayout(options)
  if (options.bounds !== undefined && !['always', 'stacked', 'never'].includes(options.bounds)) {
    throw new Error('tooltip.bounds must be always, stacked or never.')
  }
  if (
    options.digits !== undefined &&
    (!Number.isInteger(options.digits) || options.digits < 0 || options.digits > 15)
  ) {
    throw new RangeError('tooltip.digits must be an integer in [0, 15].')
  }
}

export function tooltip(initial: OptionPatch<TooltipOptions> = {}): TooltipHandle {
  validateKeys(initial, optionKeys, 'tooltip')
  const consumers = new Set<(options: Readonly<TooltipOptions>) => void>()
  const state = createOptionState<TooltipOptions>(initial, {
    isAtomicReference: (value) =>
      isLineMark(value) ||
      isSeriesMark(value) ||
      isBarMark(value) ||
      isStackedAreaMark(value) ||
      isHistogramMark(value) ||
      isHeatmapMark(value) ||
      isEnsembleMark(value) ||
      isCrosshairHandle(value),
    defaults: () => ({
      axis: 'x',
      marks: undefined,
      position: 'right',
      crosshair: undefined,
      showX: undefined,
      showY: undefined,
      coordinateLabels: false,
      digits: undefined,
      bounds: 'stacked',
      formatValue: undefined,
      formatUnit: undefined,
      formatRange: undefined,
      formatEntry: undefined,
      formatHeader: undefined,
      maxDistance: undefined,
      layout: 'inline',
    }),
    validate(options) {
      validateFormatting(options)
      if (!['x', 'y', 'xy'].includes(options.axis)) {
        throw new Error('tooltip.axis must be x, y or xy.')
      }
      if (
        options.crosshair !== undefined &&
        (!options.crosshair || !isCrosshairHandle(options.crosshair))
      ) {
        throw new TypeError('tooltip.crosshair must be a crosshair handle.')
      }
      if (!['bottom', 'left', 'right', 'top'].includes(options.position)) {
        throw new Error('tooltip.position must be bottom, left, right or top.')
      }
      validateMarks(options.marks)
      for (const validate of consumers) validate(options)
    },
  })
  const optionState = optionSignal(state)
  const handle: TooltipHandle = Object.freeze({
    options: optionState.snapshot,
    update(patch: OptionPatch<TooltipOptions>) {
      validateKeys(patch, optionKeys, 'tooltip')
      if (state.update(patch)) optionState.publish()
    },
  })
  handles.add(handle)
  validators.set(handle, consumers)
  return handle
}

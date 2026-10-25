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
import type { MarkHit } from '../../marks/mark-definition.js'
import type { ScaleValue } from '../../../scales/scale.js'

export type TooltipAxis = 'x' | 'y' | 'xy'
export type TooltipPlacementPosition = 'bottom' | 'left' | 'right' | 'top'
export type TooltipMark =
  LineMark | SeriesMark | BarMark | StackedAreaMark | HistogramMark | HeatmapMark

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

export interface TooltipOptions {
  axis: TooltipAxis
  /** Inspected marks; symbols reuse their legend styles, with layer and heatmap hit colors. */
  marks?: readonly TooltipMark[]
  position: TooltipPlacementPosition
  /** Includes the sample's x coordinate, independently of crosshair callouts. */
  showX: boolean
  /** Decimal places for values and composite bounds; defaults to the mark's precision. */
  digits?: number
  /** Formats coordinates, values and range endpoints before units are appended. */
  formatValue?: TooltipValueFormatter
  /** Returns a unit suffix (or ''), appended once with a separating space. */
  formatUnit?: TooltipUnitFormatter
  /** Formats composite bounds and heatmap ranges before units are appended. */
  formatRange?: TooltipRangeFormatter
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
  'digits',
  'formatValue',
  'formatUnit',
  'formatRange',
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
          !isHeatmapMark(mark)),
    )
  ) {
    throw new TypeError(
      'tooltip.marks must contain line(), series(), bar(), stackedArea(), histogram() or heatmap() marks.',
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
      isCrosshairHandle(value),
    defaults: () => ({
      axis: 'x',
      marks: undefined,
      position: 'right',
      crosshair: undefined,
      showX: true,
      digits: undefined,
      formatValue: undefined,
      formatUnit: undefined,
      formatRange: undefined,
    }),
    validate(options) {
      for (const key of ['formatValue', 'formatUnit', 'formatRange'] as const) {
        if (options[key] !== undefined && typeof options[key] !== 'function') {
          throw new TypeError(`tooltip.${key} must be a function.`)
        }
      }
      if (typeof options.showX !== 'boolean') {
        throw new TypeError('tooltip.showX must be boolean.')
      }
      if (
        options.digits !== undefined &&
        (!Number.isInteger(options.digits) || options.digits < 0 || options.digits > 15)
      ) {
        throw new RangeError('tooltip.digits must be an integer in [0, 15].')
      }
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

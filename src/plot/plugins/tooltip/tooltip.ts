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

export type TooltipAxis = 'x' | 'y' | 'xy'
export type TooltipPlacementPosition = 'bottom' | 'left' | 'right' | 'top'
export type TooltipMark = LineMark | SeriesMark | BarMark | StackedAreaMark

export interface TooltipOptions {
  axis: TooltipAxis
  marks?: readonly TooltipMark[]
  position: TooltipPlacementPosition
  /** Includes the sample's x coordinate, independently of crosshair callouts. */
  showX: boolean
  /** Decimal places for values and composite bounds; defaults to the mark's precision. */
  digits?: number
  /** Follows this installed crosshair and omits coordinates already shown by its callouts. */
  crosshair?: CrosshairHandle
}

export interface TooltipHandle {
  readonly options: ReadonlySignal<OptionStateSnapshot<TooltipOptions>>
  update(patch: OptionPatch<TooltipOptions>): void
}

const handles = new WeakSet<object>()
const validators = new WeakMap<TooltipHandle, Set<(options: Readonly<TooltipOptions>) => void>>()
const optionKeys = ['axis', 'marks', 'position', 'crosshair', 'showX', 'digits']

function validateMarks(marks: readonly TooltipMark[] | undefined) {
  if (marks === undefined) return
  if (!Array.isArray(marks)) throw new TypeError('tooltip.marks must be an array.')
  if (
    marks.some(
      (mark) =>
        !mark ||
        (!isLineMark(mark) && !isSeriesMark(mark) && !isBarMark(mark) && !isStackedAreaMark(mark)),
    )
  ) {
    throw new TypeError(
      'tooltip.marks must contain line(), series(), bar() or stackedArea() marks.',
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
      isCrosshairHandle(value),
    defaults: () => ({
      axis: 'x',
      marks: undefined,
      position: 'right',
      crosshair: undefined,
      showX: true,
      digits: undefined,
    }),
    validate(options) {
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

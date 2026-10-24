import { createOptionState, type OptionPatch, type OptionStateSnapshot } from '../core/options.js'
import { optionSignal } from '../core/runtime.js'
import type { ReadonlySignal } from '../core/reactive.js'
import { validateKeys } from '../core/validation.js'
import { isLineMark, type LineMark } from './line.js'
import { isSeriesMark, type SeriesMark } from './series.js'
import { isCrosshairHandle, type CrosshairHandle } from './crosshair.js'

export type TooltipAxis = 'x' | 'y' | 'xy'
export type TooltipPlacementPosition = 'bottom' | 'left' | 'right' | 'top'
export type TooltipMark = LineMark | SeriesMark

export interface TooltipOptions {
  axis: TooltipAxis
  marks?: readonly TooltipMark[]
  position: TooltipPlacementPosition
  /** Follows this installed crosshair and omits coordinates already shown by its callouts. */
  crosshair?: CrosshairHandle
}

export interface TooltipHandle {
  readonly options: ReadonlySignal<OptionStateSnapshot<TooltipOptions>>
  update(patch: OptionPatch<TooltipOptions>): void
}

const handles = new WeakSet<object>()
const validators = new WeakMap<TooltipHandle, Set<(options: Readonly<TooltipOptions>) => void>>()
const optionKeys = ['axis', 'marks', 'position', 'crosshair']

function validateMarks(marks: readonly TooltipMark[] | undefined) {
  if (marks === undefined) return
  if (!Array.isArray(marks)) throw new TypeError('tooltip.marks must be an array.')
  if (marks.some((mark) => !mark || (!isLineMark(mark) && !isSeriesMark(mark)))) {
    throw new TypeError('tooltip.marks must contain line() or series() marks.')
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
      isLineMark(value) || isSeriesMark(value) || isCrosshairHandle(value),
    defaults: () => ({ axis: 'x', marks: undefined, position: 'right', crosshair: undefined }),
    validate(options) {
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

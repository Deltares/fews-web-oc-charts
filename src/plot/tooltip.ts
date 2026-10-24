import { createOptionState, type OptionPatch, type OptionStateSnapshot } from '../core/options.js'
import { optionSignal } from '../core/runtime.js'
import type { ReadonlySignal } from '../core/reactive.js'
import { validateKeys } from '../core/validation.js'
import { isLineMark, type LineMark } from './line.js'
import { isSeriesMark, type SeriesMark } from './series.js'

export type TooltipAxis = 'x' | 'xy'
export type TooltipPlacementPosition = 'bottom' | 'left' | 'right' | 'top'
export type TooltipMark = LineMark | SeriesMark

export interface TooltipOptions {
  axis: TooltipAxis
  marks?: readonly TooltipMark[]
  position: TooltipPlacementPosition
}

export interface TooltipHandle {
  readonly options: ReadonlySignal<OptionStateSnapshot<TooltipOptions>>
  update(patch: OptionPatch<TooltipOptions>): void
}

const handles = new WeakSet<object>()
const validators = new WeakMap<
  TooltipHandle,
  Set<(marks: readonly TooltipMark[] | undefined) => void>
>()
const optionKeys = ['axis', 'marks', 'position']

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
  validate: (marks: readonly TooltipMark[] | undefined) => void,
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
  const consumers = new Set<(marks: readonly TooltipMark[] | undefined) => void>()
  const state = createOptionState<TooltipOptions>(initial, {
    isAtomicReference: (value) => isLineMark(value) || isSeriesMark(value),
    defaults: () => ({ axis: 'x', marks: undefined, position: 'right' }),
    validate(options) {
      if (options.axis !== 'x' && options.axis !== 'xy') {
        throw new Error('tooltip.axis must be x or xy.')
      }
      if (!['bottom', 'left', 'right', 'top'].includes(options.position)) {
        throw new Error('tooltip.position must be bottom, left, right or top.')
      }
      validateMarks(options.marks)
      for (const validate of consumers) validate(options.marks)
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

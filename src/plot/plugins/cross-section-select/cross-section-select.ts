import {
  createOptionState,
  type OptionPatch,
  type OptionStateSnapshot,
} from '../../../core/options.js'
import type { ReadonlySignal } from '../../../core/reactive.js'
import { optionSignal, reactive } from '../../../core/runtime.js'
import { validateKeys } from '../../../core/validation.js'
import { isLineMark, type LineMark } from '../../marks/line/line.js'
import { isSeriesMark, type SeriesMark } from '../../marks/line/series.js'

export type CrossSectionMark = LineMark | SeriesMark
export type CrossSectionMarkFilter = 'all' | 'none' | readonly CrossSectionMark[]

export interface CrossSectionSelectOptions {
  x: string
  marks: CrossSectionMarkFilter
  draggable: boolean
  format?: (value: number) => string
}

export interface CrossSectionPoint {
  readonly id: string | undefined
  readonly mark: CrossSectionMark
  readonly index: number
  readonly x: number
  readonly y: number
  readonly value: string
  readonly data: Readonly<{ x: number; y: number }>
}

export interface CrossSectionSelectHandle {
  readonly options: ReadonlySignal<OptionStateSnapshot<CrossSectionSelectOptions>>
  readonly value: ReadonlySignal<number>
  readonly currentData: ReadonlySignal<readonly CrossSectionPoint[]>
  update(patch: OptionPatch<CrossSectionSelectOptions>): void
  /** Changes the selected domain value without invoking the drag callback. */
  setValue(value: number): void
}

const handles = new WeakSet<object>()
const validators = new WeakMap<
  CrossSectionSelectHandle,
  Set<(options: Readonly<CrossSectionSelectOptions>, value: number) => void>
>()
const valueSubscribers = new WeakMap<
  CrossSectionSelectHandle,
  (points: readonly CrossSectionPoint[]) => void
>()
const handleCallbacks = new WeakMap<
  CrossSectionSelectHandle,
  ((value: number) => void) | undefined
>()
const optionKeys = ['x', 'marks', 'draggable', 'format']

export function isCrossSectionSelectHandle(value: object): value is CrossSectionSelectHandle {
  return handles.has(value)
}

export function validateCrossSectionSelectUpdates(
  handle: CrossSectionSelectHandle,
  validate: (options: Readonly<CrossSectionSelectOptions>, value: number) => void,
) {
  const consumers = validators.get(handle)
  if (!consumers) throw new Error('Expected a cross-section select handle.')
  consumers.add(validate)
  return () => consumers.delete(validate)
}

function validateMarks(value: CrossSectionMarkFilter) {
  if (value === 'all' || value === 'none') return
  if (!Array.isArray(value) || value.some((mark) => !isLineMark(mark) && !isSeriesMark(mark))) {
    throw new TypeError(
      'crossSectionSelect.marks must be all, none, or an array of line/series marks.',
    )
  }
}

function validateValue(value: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError('crossSectionSelect value must be a finite number.')
  }
}

export function crossSectionSelect(
  initialValue: number,
  callback?: (value: number) => void,
  initial: OptionPatch<CrossSectionSelectOptions> = {},
): CrossSectionSelectHandle {
  validateValue(initialValue)
  if (callback !== undefined && typeof callback !== 'function') {
    throw new TypeError('crossSectionSelect callback must be a function.')
  }
  validateKeys(initial, optionKeys, 'crossSectionSelect')
  const consumers = new Set<(options: Readonly<CrossSectionSelectOptions>, value: number) => void>()
  const value = reactive.signal(initialValue)
  const currentData = reactive.signal<readonly CrossSectionPoint[]>(Object.freeze([]))
  const state = createOptionState<CrossSectionSelectOptions>(initial, {
    defaults: () => ({ x: 'x', marks: 'all', draggable: false, format: undefined }),
    isAtomicReference: (value) => isLineMark(value) || isSeriesMark(value),
    validate(options) {
      if (typeof options.x !== 'string' || options.x.length === 0) {
        throw new TypeError('crossSectionSelect.x must name an x scale.')
      }
      validateMarks(options.marks)
      if (typeof options.draggable !== 'boolean') {
        throw new TypeError('crossSectionSelect.draggable must be boolean.')
      }
      if (options.format !== undefined && typeof options.format !== 'function') {
        throw new TypeError('crossSectionSelect.format must be a function.')
      }
      for (const validate of consumers) validate(options, value.get())
    },
  })
  const optionState = optionSignal(state)
  const handle: CrossSectionSelectHandle = Object.freeze({
    options: optionState.snapshot,
    value: {
      get: () => value.get(),
      get version() {
        return value.version
      },
    },
    currentData: {
      get: () => currentData.get(),
      get version() {
        return currentData.version
      },
    },
    update(patch: OptionPatch<CrossSectionSelectOptions>) {
      validateKeys(patch, optionKeys, 'crossSectionSelect')
      if (state.update(patch)) optionState.publish()
    },
    setValue(next: number) {
      validateValue(next)
      for (const validate of consumers) validate(state.getSnapshot().resolved, next)
      value.set(next)
    },
  })
  handles.add(handle)
  validators.set(handle, consumers)
  valueSubscribers.set(handle, (points) => currentData.set(points))
  handleCallbacks.set(handle, callback)
  return handle
}

export function publishCrossSectionData(
  handle: CrossSectionSelectHandle,
  points: readonly CrossSectionPoint[],
) {
  valueSubscribers.get(handle)?.(points)
}

export function notifyCrossSectionChange(handle: CrossSectionSelectHandle) {
  handleCallbacks.get(handle)?.(handle.value.get())
}

export function isCrossSectionMark(value: object): value is CrossSectionMark {
  return isLineMark(value) || isSeriesMark(value)
}

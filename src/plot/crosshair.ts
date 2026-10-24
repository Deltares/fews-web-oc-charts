import { createOptionState, type OptionPatch, type OptionStateSnapshot } from '../core/options.js'
import { optionSignal } from '../core/runtime.js'
import type { ReadonlySignal } from '../core/reactive.js'
import { validateKeys } from '../core/validation.js'
import { isLineMark, type LineMark } from './line.js'
import { isSeriesMark, type SeriesMark } from './series.js'

export type CrosshairMode = 'x' | 'y' | 'xy'
export type CrosshairSnapAxis = 'x' | 'y' | 'xy'

export interface CrosshairSnapOptions {
  mark: LineMark | SeriesMark
  axis: CrosshairSnapAxis
}

export interface CrosshairOptions {
  mode: CrosshairMode
  snap?: CrosshairSnapOptions
  /** Named scales whose coordinates are shown next to the corresponding guides. */
  labels?: { x?: string; y?: string }
}

export interface CrosshairHandle {
  readonly options: ReadonlySignal<OptionStateSnapshot<CrosshairOptions>>
  update(patch: OptionPatch<CrosshairOptions>): void
}

const handles = new WeakSet<object>()
const validators = new WeakMap<
  CrosshairHandle,
  Set<(options: Readonly<CrosshairOptions>) => void>
>()
const optionKeys = ['mode', 'snap', 'labels']

function validateSnap(snap: CrosshairSnapOptions | undefined) {
  if (snap === undefined) return
  if (!snap || typeof snap !== 'object' || Array.isArray(snap)) {
    throw new TypeError('crosshair.snap must be an options object.')
  }
  validateKeys(snap, ['mark', 'axis'], 'crosshair.snap')
  if (
    !snap.mark ||
    typeof snap.mark !== 'object' ||
    (!isLineMark(snap.mark) && !isSeriesMark(snap.mark))
  ) {
    throw new TypeError('crosshair.snap.mark must be a line() or series() mark.')
  }
  if (!['x', 'y', 'xy'].includes(snap.axis)) {
    throw new Error('crosshair.snap.axis must be x, y or xy.')
  }
}

export function validateCrosshairUpdates(
  handle: CrosshairHandle,
  validate: (options: Readonly<CrosshairOptions>) => void,
) {
  const consumers = validators.get(handle)
  if (!consumers) throw new Error('Expected a crosshair handle.')
  consumers.add(validate)
  return () => consumers.delete(validate)
}

export function isCrosshairHandle(value: object): value is CrosshairHandle {
  return handles.has(value)
}

export function crosshair(initial: OptionPatch<CrosshairOptions> = {}): CrosshairHandle {
  validateKeys(initial, optionKeys, 'crosshair')
  const consumers = new Set<(options: Readonly<CrosshairOptions>) => void>()
  const state = createOptionState<CrosshairOptions>(initial, {
    isAtomicReference: (value) => isLineMark(value) || isSeriesMark(value),
    defaults: () => ({ mode: 'xy', snap: undefined, labels: undefined }),
    validate(options) {
      if (!['x', 'y', 'xy'].includes(options.mode)) {
        throw new Error('crosshair.mode must be x, y or xy.')
      }
      validateSnap(options.snap)
      if (options.labels !== undefined) {
        if (
          !options.labels ||
          typeof options.labels !== 'object' ||
          Array.isArray(options.labels)
        ) {
          throw new TypeError('crosshair.labels must be an options object.')
        }
        validateKeys(options.labels, ['x', 'y'], 'crosshair.labels')
        for (const axis of ['x', 'y'] as const) {
          const scale = options.labels[axis]
          if (scale !== undefined && (typeof scale !== 'string' || !scale)) {
            throw new TypeError(`crosshair.labels.${axis} must name a scale.`)
          }
        }
      }
      for (const validate of consumers) validate(options)
    },
  })
  const optionState = optionSignal(state)
  const handle: CrosshairHandle = Object.freeze({
    options: optionState.snapshot,
    update(patch: OptionPatch<CrosshairOptions>) {
      validateKeys(patch, optionKeys, 'crosshair')
      if (state.update(patch)) optionState.publish()
    },
  })
  handles.add(handle)
  validators.set(handle, consumers)
  return handle
}

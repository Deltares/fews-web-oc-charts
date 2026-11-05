import {
  createOptionState,
  type OptionPatch,
  type OptionStateSnapshot,
} from '../../../core/options.js'
import type { ReadonlySignal } from '../../../core/reactive.js'
import { optionSignal } from '../../../core/runtime.js'
import { validateKeys } from '../../../core/validation.js'
import type { SharedClock } from '../../../sync/shared-clock.js'

export type CurrentTimeLabel = 'hover' | 'always' | 'none'

export interface CurrentTimeOptions {
  /** The time scale to mark. Defaults to the plot's only x-direction time scale. */
  x?: string
  /**
   * Drives the line. The application owns this clock and decides when it runs. Without one, the
   * plugin updates every 10 seconds on a private clock, which pauses while the plot is suspended.
   */
  clock?: SharedClock
  label: CurrentTimeLabel
  format?: (value: number) => string
}

export interface CurrentTimeHandle {
  readonly options: ReadonlySignal<OptionStateSnapshot<CurrentTimeOptions>>
  update(patch: OptionPatch<CurrentTimeOptions>): void
}

type Validator = (options: Readonly<CurrentTimeOptions>) => void

const handles = new WeakSet<object>()
const validators = new WeakMap<CurrentTimeHandle, Set<Validator>>()
const optionKeys = ['x', 'clock', 'label', 'format']

export function isCurrentTimeHandle(value: object): value is CurrentTimeHandle {
  return handles.has(value)
}

export function validateCurrentTimeUpdates(handle: CurrentTimeHandle, validate: Validator) {
  const consumers = validators.get(handle)
  if (!consumers) throw new Error('Expected a current time handle.')
  consumers.add(validate)
  return () => consumers.delete(validate)
}

function isSharedClock(value: unknown): value is SharedClock {
  const clock = value as Partial<SharedClock> | null
  return typeof clock === 'object' && typeof clock?.time?.get === 'function'
}

export function currentTime(initial: OptionPatch<CurrentTimeOptions> = {}): CurrentTimeHandle {
  validateKeys(initial, optionKeys, 'currentTime')
  const consumers = new Set<Validator>()
  const state = createOptionState<CurrentTimeOptions>(initial, {
    defaults: () => ({ x: undefined, clock: undefined, label: 'hover', format: undefined }),
    isAtomicReference: isSharedClock,
    validate(options) {
      if (options.x !== undefined && (typeof options.x !== 'string' || options.x.length === 0)) {
        throw new TypeError('currentTime.x must name a time scale.')
      }
      if (options.clock !== undefined && !isSharedClock(options.clock)) {
        throw new TypeError('currentTime.clock must be a shared clock.')
      }
      if (!['hover', 'always', 'none'].includes(options.label)) {
        throw new TypeError('currentTime.label must be hover, always or none.')
      }
      if (options.format !== undefined && typeof options.format !== 'function') {
        throw new TypeError('currentTime.format must be a function.')
      }
      for (const validate of consumers) validate(options)
    },
  })
  const optionState = optionSignal(state)
  const handle: CurrentTimeHandle = Object.freeze({
    options: optionState.snapshot,
    update(patch: OptionPatch<CurrentTimeOptions>) {
      validateKeys(patch, optionKeys, 'currentTime')
      if (state.update(patch)) optionState.publish()
    },
  })
  handles.add(handle)
  validators.set(handle, consumers)
  return handle
}

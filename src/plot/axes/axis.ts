import {
  createOptionState,
  type OptionPatch,
  type OptionStateSnapshot,
} from '../../core/options.js'
import { optionSignal } from '../../core/runtime.js'
import type { ReadonlySignal } from '../../core/reactive.js'
import { finiteNonnegative, validateKeys } from '../../core/validation.js'
import type { ScaleValue } from '../../scales/scale.js'

export type AxisSide = 'top' | 'right' | 'bottom' | 'left' | 'angular' | 'radial'
export interface AxisOptions {
  style: 'default' | 'classic'
  crossAt?: { scale: string; value: ScaleValue }
  id?: string
  position: AxisSide
  label: string
  unit: string
  grid: boolean
  tickCount: number
  labelAngle: number
  locale?: string
  timeZone?: string
  format?: (value: ScaleValue) => string
}

export interface AxisHandle {
  readonly scale: string
  readonly options: ReadonlySignal<OptionStateSnapshot<AxisOptions>>
  update(patch: OptionPatch<AxisOptions>): void
}

const handles = new WeakSet<object>()
const validators = new WeakMap<AxisHandle, Set<(options: Readonly<AxisOptions>) => void>>()
export const isAxisHandle = (value: object): value is AxisHandle => handles.has(value)

export function validateAxisUpdates(
  handle: AxisHandle,
  validate: (options: Readonly<AxisOptions>) => void,
): () => void {
  const consumers = validators.get(handle)
  if (!consumers) throw new Error('Expected an axis handle.')
  consumers.add(validate)
  return () => {
    consumers.delete(validate)
  }
}

export function axis(scale: string, initial: OptionPatch<AxisOptions> = {}): AxisHandle {
  if (typeof scale !== 'string' || scale.length === 0) throw new Error('axis.scale must be a name.')
  const keys = [
    'style',
    'crossAt',
    'id',
    'position',
    'label',
    'unit',
    'grid',
    'tickCount',
    'labelAngle',
    'locale',
    'timeZone',
    'format',
  ]
  const consumers = new Set<(options: Readonly<AxisOptions>) => void>()
  validateKeys(initial, keys, 'axis')
  const state = createOptionState<AxisOptions>(initial, {
    defaults: () => ({
      style: 'default',
      position: 'left',
      label: '',
      unit: '',
      grid: false,
      tickCount: 6,
      labelAngle: 0,
    }),
    validate(options) {
      if (!['default', 'classic'].includes(options.style)) {
        throw new Error('axis.style must be default or classic.')
      }
      if (options.crossAt !== undefined) {
        validateKeys(options.crossAt, ['scale', 'value'], 'axis.crossAt')
        if (typeof options.crossAt.scale !== 'string' || !options.crossAt.scale) {
          throw new Error('axis.crossAt.scale must name a plot scale.')
        }
        const value = options.crossAt.value
        if (typeof value !== 'string' && !(typeof value === 'number' && Number.isFinite(value))) {
          throw new Error('axis.crossAt.value must be a finite number or string.')
        }
      }
      if (!['top', 'right', 'bottom', 'left', 'angular', 'radial'].includes(options.position)) {
        throw new Error('axis.position must be a cartesian side, angular or radial.')
      }
      finiteNonnegative(options.tickCount, 'axis.tickCount')
      if (!Number.isInteger(options.tickCount) || options.tickCount === 0) {
        throw new Error('axis.tickCount must be a positive integer.')
      }
      if (!Number.isFinite(options.labelAngle)) throw new Error('axis.labelAngle must be finite.')
      if (typeof options.label !== 'string' || typeof options.unit !== 'string') {
        throw new TypeError('axis.label and axis.unit must be strings.')
      }
      if (typeof options.grid !== 'boolean') throw new Error('axis.grid must be boolean.')
      if (options.id !== undefined && (typeof options.id !== 'string' || !options.id)) {
        throw new Error('axis.id must be a nonempty string.')
      }
      if (options.format !== undefined && typeof options.format !== 'function') {
        throw new Error('axis.format must be a function.')
      }
      if (options.locale !== undefined && typeof options.locale !== 'string') {
        throw new Error('axis.locale must be a string.')
      }
      if (options.timeZone !== undefined && typeof options.timeZone !== 'string') {
        throw new Error('axis.timeZone must be a string.')
      }
      if (options.locale !== undefined || options.timeZone !== undefined) {
        new Intl.DateTimeFormat(options.locale, { timeZone: options.timeZone }).resolvedOptions()
      }
      for (const validate of consumers) validate(options)
    },
  })
  const optionState = optionSignal(state)
  const options = optionState.snapshot
  const handle: AxisHandle = {
    scale,
    options,
    update(patch) {
      validateKeys(patch, keys, 'axis')
      if (Object.hasOwn(patch, 'id') && patch.id !== state.getSnapshot().resolved.id) {
        throw new Error('axis.id is immutable; replace the axis handle instead.')
      }
      if (state.update(patch)) optionState.publish()
    },
  }
  handles.add(handle)
  validators.set(handle, consumers)
  return Object.freeze(handle)
}

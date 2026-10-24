import { createOptionState, type OptionPatch, type OptionStateSnapshot } from '../core/options.js'
import { optionSignal } from '../core/runtime.js'
import type { ReadonlySignal } from '../core/reactive.js'
import { validateKeys } from '../core/validation.js'

export type CrosshairMode = 'x' | 'y' | 'xy'

export interface CrosshairOptions {
  mode: CrosshairMode
}

export interface CrosshairHandle {
  readonly options: ReadonlySignal<OptionStateSnapshot<CrosshairOptions>>
  update(patch: OptionPatch<CrosshairOptions>): void
}

const handles = new WeakSet<object>()
const optionKeys = ['mode']

export function isCrosshairHandle(value: object): value is CrosshairHandle {
  return handles.has(value)
}

export function crosshair(initial: OptionPatch<CrosshairOptions> = {}): CrosshairHandle {
  validateKeys(initial, optionKeys, 'crosshair')
  const state = createOptionState<CrosshairOptions>(initial, {
    defaults: () => ({ mode: 'xy' }),
    validate(options) {
      if (!['x', 'y', 'xy'].includes(options.mode)) {
        throw new Error('crosshair.mode must be x, y or xy.')
      }
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
  return handle
}

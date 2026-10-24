import { createOptionState, type OptionPatch, type OptionStateSnapshot } from '../core/options.js'
import { optionSignal } from '../core/runtime.js'
import type { ReadonlySignal } from '../core/reactive.js'
import { validateKeys } from '../core/validation.js'
import { ModifierKey } from '../Utils/modifierKey.js'

export type PanMode = 'x' | 'y' | 'xy'

export interface PanOptions {
  mode: PanMode
  modifier: ModifierKey
}

export interface PanHandle {
  readonly options: ReadonlySignal<OptionStateSnapshot<PanOptions>>
  update(patch: OptionPatch<PanOptions>): void
}

const handles = new WeakSet<object>()
const optionKeys = ['mode', 'modifier']

export function isPanHandle(value: object): value is PanHandle {
  return handles.has(value)
}

export function pan(initial: OptionPatch<PanOptions> = {}): PanHandle {
  validateKeys(initial, optionKeys, 'pan')
  const state = createOptionState<PanOptions>(initial, {
    defaults: () => ({ mode: 'xy', modifier: ModifierKey.None }),
    validate(options) {
      if (!['x', 'y', 'xy'].includes(options.mode)) {
        throw new Error('pan.mode must be x, y or xy.')
      }
      if (!Object.values(ModifierKey).includes(options.modifier)) {
        throw new Error('pan.modifier must be none, ctrl or shift.')
      }
    },
  })
  const optionState = optionSignal(state)
  const handle: PanHandle = Object.freeze({
    options: optionState.snapshot,
    update(patch: OptionPatch<PanOptions>) {
      validateKeys(patch, optionKeys, 'pan')
      if (state.update(patch)) optionState.publish()
    },
  })
  handles.add(handle)
  return handle
}

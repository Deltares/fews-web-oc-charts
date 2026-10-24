import { createOptionState, type OptionPatch, type OptionStateSnapshot } from '../core/options.js'
import { optionSignal } from '../core/runtime.js'
import type { ReadonlySignal } from '../core/reactive.js'
import { validateKeys } from '../core/validation.js'
import { ModifierKey } from '../Utils/modifierKey.js'

export type BrushMode = 'x' | 'y' | 'xy'

export interface BrushOptions {
  mode: BrushMode
  modifier: ModifierKey
}

export interface BrushSelection {
  readonly mode: BrushMode
  /** Continuous scales contain an ordered pair; band scales contain selected categories. */
  readonly scales: Readonly<Record<string, readonly (number | string)[]>>
}

export interface BrushHandle {
  readonly options: ReadonlySignal<OptionStateSnapshot<BrushOptions>>
  update(patch: OptionPatch<BrushOptions>): void
}

export const brushEvent = 'brush'

const handles = new WeakSet<object>()
const optionKeys = ['mode', 'modifier']

export function isBrushHandle(value: object): value is BrushHandle {
  return handles.has(value)
}

export function brush(initial: OptionPatch<BrushOptions> = {}): BrushHandle {
  validateKeys(initial, optionKeys, 'brush')
  const state = createOptionState<BrushOptions>(initial, {
    defaults: () => ({ mode: 'xy', modifier: ModifierKey.Shift }),
    validate(options) {
      if (!['x', 'y', 'xy'].includes(options.mode)) {
        throw new Error('brush.mode must be x, y or xy.')
      }
      if (!Object.values(ModifierKey).includes(options.modifier)) {
        throw new Error('brush.modifier must be none, ctrl or shift.')
      }
    },
  })
  const optionState = optionSignal(state)
  const handle: BrushHandle = Object.freeze({
    options: optionState.snapshot,
    update(patch: OptionPatch<BrushOptions>) {
      validateKeys(patch, optionKeys, 'brush')
      if (state.update(patch)) optionState.publish()
    },
  })
  handles.add(handle)
  return handle
}

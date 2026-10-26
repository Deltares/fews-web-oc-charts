import {
  createOptionState,
  type OptionPatch,
  type OptionStateSnapshot,
} from '../../../core/options.js'
import { optionSignal } from '../../../core/runtime.js'
import type { ReadonlySignal } from '../../../core/reactive.js'
import { validateKeys } from '../../../core/validation.js'
import { ModifierKey } from '../../../Utils/modifierKey.js'

export type ZoomMode = 'x' | 'y' | 'xy' | 'auto'
export type ZoomWheelMode = Exclude<ZoomMode, 'auto'> | 'none'
export type ZoomResetMode = 'initial' | 'full' | 'toggle'

export interface ZoomOptions {
  id?: string
  /** Directions affected by box zoom and reset; also limits wheel directions. */
  mode: ZoomMode
  wheel: ZoomWheelMode
  /** Required modifier for box zoom; also the default for wheel zoom. */
  modifier: ModifierKey
  /** Required modifier for wheel zoom. When omitted, uses modifier. */
  wheelModifier?: ModifierKey
  reset: ZoomResetMode
}

export interface ZoomHandle {
  readonly options: ReadonlySignal<OptionStateSnapshot<ZoomOptions>>
  update(patch: OptionPatch<ZoomOptions>): void
}

const handles = new WeakSet<object>()
const optionKeys = ['id', 'mode', 'wheel', 'modifier', 'wheelModifier', 'reset']

export function isZoomHandle(value: object): value is ZoomHandle {
  return handles.has(value)
}

export function zoom(initial: OptionPatch<ZoomOptions> = {}): ZoomHandle {
  validateKeys(initial, optionKeys, 'zoom')
  const state = createOptionState<ZoomOptions>(initial, {
    defaults: () => ({
      mode: 'xy',
      wheel: 'none',
      modifier: ModifierKey.None,
      reset: 'initial',
    }),
    validate(options) {
      if (options.id !== undefined && (typeof options.id !== 'string' || !options.id)) {
        throw new Error('zoom.id must be a non-empty string.')
      }
      if (!['x', 'y', 'xy', 'auto'].includes(options.mode)) {
        throw new Error('zoom.mode must be x, y, xy or auto.')
      }
      if (!['none', 'x', 'y', 'xy'].includes(options.wheel)) {
        throw new Error('zoom.wheel must be none, x, y or xy.')
      }
      if (!Object.values(ModifierKey).includes(options.modifier)) {
        throw new Error('zoom.modifier must be none, ctrl or shift.')
      }
      if (
        options.wheelModifier !== undefined &&
        !Object.values(ModifierKey).includes(options.wheelModifier)
      ) {
        throw new Error('zoom.wheelModifier must be none, ctrl or shift.')
      }
      if (!['initial', 'full', 'toggle'].includes(options.reset)) {
        throw new Error('zoom.reset must be initial, full or toggle.')
      }
    },
  })
  const optionState = optionSignal(state)
  const handle: ZoomHandle = Object.freeze({
    options: optionState.snapshot,
    update(patch: OptionPatch<ZoomOptions>) {
      validateKeys(patch, optionKeys, 'zoom')
      if (state.update(patch)) optionState.publish()
    },
  })
  handles.add(handle)
  return handle
}

import {
  createOptionState,
  type OptionPatch,
  type OptionStateSnapshot,
} from '../../../core/options.js'
import { optionSignal, reactive } from '../../../core/runtime.js'
import type { ReadonlySignal } from '../../../core/reactive.js'
import { validateKeys } from '../../../core/validation.js'
import { ModifierKey } from '../../../Utils/modifierKey.js'
import type { ScaleHandle } from '../../../scales/scale.js'

export type BrushMode = 'x' | 'y' | 'xy' | 'auto'
export type BrushSelectionMode = Exclude<BrushMode, 'auto'>

export interface BrushOptions {
  mode: BrushMode
  modifier: ModifierKey
  persistent: boolean
}

export interface BrushSelection {
  readonly mode: BrushSelectionMode
  /** Continuous scales contain an ordered pair; band scales contain selected categories. */
  readonly scales: Readonly<Record<string, readonly (number | string)[]>>
}

export interface BrushHandle {
  readonly options: ReadonlySignal<OptionStateSnapshot<BrushOptions>>
  readonly selection: ReadonlySignal<BrushSelection | undefined>
  update(patch: OptionPatch<BrushOptions>): void
  /** Sets a persistent selection without emitting a user brush event; undefined clears it. */
  setSelection(selection: BrushSelection | undefined): void
}

export const brushEvent = 'brush'

const handles = new WeakSet<object>()
const validators = new WeakMap<BrushHandle, Set<(selection: BrushSelection) => void>>()
const optionKeys = ['mode', 'modifier', 'persistent']

export function validateBrushSelections(
  handle: BrushHandle,
  validate: (selection: BrushSelection) => void,
) {
  const consumers = validators.get(handle)!
  consumers.add(validate)
  return () => consumers.delete(validate)
}

export function validateBrushScaleSelection(
  selection: BrushSelection,
  scales: Readonly<Record<string, ScaleHandle>>,
  direction: (name: string) => string,
) {
  for (const [name, range] of Object.entries(selection.scales)) {
    const scale = Object.hasOwn(scales, name) ? scales[name] : undefined
    if (!scale) throw new Error(`brush.selection references missing scale "${name}".`)
    if (!selection.mode.includes(direction(name))) {
      throw new Error(`brush.selection scale "${name}" does not match mode ${selection.mode}.`)
    }
    if (scale.kind === 'band') {
      if (range.some((value) => !scale.domain.get().includes(value))) {
        throw new Error(`brush.selection.${name} must contain categories from the scale domain.`)
      }
    } else if (
      range.length !== 2 ||
      range.some((value) => typeof value !== 'number') ||
      (scale.kind === 'log' && range.some((value) => Number(value) <= 0)) ||
      (scale.kind === 'time' && range.some((value) => Math.abs(Number(value)) > 8.64e15))
    ) {
      throw new Error(`brush.selection.${name} requires a valid continuous domain pair.`)
    }
  }
}

export function isBrushHandle(value: object): value is BrushHandle {
  return handles.has(value)
}

export function brush(initial: OptionPatch<BrushOptions> = {}): BrushHandle {
  validateKeys(initial, optionKeys, 'brush')
  const selection = reactive.signal<BrushSelection | undefined>(undefined, (left, right) => {
    if (!left || !right) return left === right
    const keys = Object.keys(left.scales)
    return (
      left.mode === right.mode &&
      keys.length === Object.keys(right.scales).length &&
      keys.every((name) => {
        const a = left.scales[name]
        const b = right.scales[name]
        return b && a.length === b.length && a.every((entry, index) => entry === b[index])
      })
    )
  })
  const consumers = new Set<(selection: BrushSelection) => void>()
  const state = createOptionState<BrushOptions>(initial, {
    defaults: () => ({ mode: 'xy', modifier: ModifierKey.Shift, persistent: false }),
    validate(options) {
      if (!['x', 'y', 'xy', 'auto'].includes(options.mode)) {
        throw new Error('brush.mode must be x, y, xy or auto.')
      }
      if (!Object.values(ModifierKey).includes(options.modifier)) {
        throw new Error('brush.modifier must be none, ctrl or shift.')
      }
      if (typeof options.persistent !== 'boolean') {
        throw new Error('brush.persistent must be boolean.')
      }
    },
  })
  const optionState = optionSignal(state)
  const handle: BrushHandle = Object.freeze({
    options: optionState.snapshot,
    selection: {
      get: () => selection.get(),
      get version() {
        return selection.version
      },
    },
    update(patch: OptionPatch<BrushOptions>) {
      validateKeys(patch, optionKeys, 'brush')
      const previous = state.getSnapshot().resolved
      if (state.update(patch)) {
        const next = state.getSnapshot().resolved
        if (next.mode !== previous.mode || !next.persistent) selection.set(undefined)
        optionState.publish()
      }
    },
    setSelection(value: BrushSelection | undefined) {
      if (value === undefined) {
        selection.set(undefined)
        return
      }
      const config = state.getSnapshot().resolved
      if (!config.persistent) throw new Error('brush.setSelection requires persistent: true.')
      validateKeys(value, ['mode', 'scales'], 'brush.selection')
      if (
        !['x', 'y', 'xy'].includes(value.mode) ||
        (config.mode !== 'auto' && config.mode !== value.mode)
      ) {
        throw new Error('brush.selection.mode must match the configured brush mode.')
      }
      if (!value.scales || typeof value.scales !== 'object' || Array.isArray(value.scales)) {
        throw new Error('brush.selection.scales must be a named map.')
      }
      const ranges = Object.entries(value.scales)
      if (!ranges.length) throw new Error('brush.selection.scales must not be empty.')
      for (const [name, range] of ranges) {
        if (
          !name ||
          !Array.isArray(range) ||
          !range.length ||
          range.some((entry) => typeof entry !== 'string' && !Number.isFinite(entry)) ||
          new Set(range.map((entry) => typeof entry)).size !== 1 ||
          (typeof range[0] === 'string' && new Set(range).size !== range.length) ||
          (typeof range[0] === 'number' &&
            (range.length !== 2 || Number(range[0]) >= Number(range[1])))
        ) {
          throw new Error(
            `brush.selection.${name} must contain categories or an increasing numeric pair.`,
          )
        }
      }
      for (const validate of consumers) validate(value)
      selection.set(
        Object.freeze({
          mode: value.mode,
          scales: Object.freeze(
            Object.fromEntries(ranges.map(([name, range]) => [name, Object.freeze([...range])])),
          ),
        }),
      )
    },
  })
  handles.add(handle)
  validators.set(handle, consumers)
  return handle
}

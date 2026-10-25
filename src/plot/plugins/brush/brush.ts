import {
  createOptionState,
  type OptionPatch,
  type OptionStateSnapshot,
} from '../../../core/options.js'
import { optionSignal, reactive } from '../../../core/runtime.js'
import type { ReadonlySignal } from '../../../core/reactive.js'
import { validateKeys } from '../../../core/validation.js'
import { ModifierKey } from '../../../Utils/modifierKey.js'
import {
  isSharedSelection,
  localSharedSelection,
  shareLocalSelection,
  type SharedSelection,
  type SelectionScaleContext,
} from '../../../sync/shared-selection.js'
import { validateSelection } from '../../../sync/selection-validation.js'
export { validateBrushScaleSelection } from '../../../sync/selection-validation.js'

export type BrushMode = 'x' | 'y' | 'xy' | 'auto'
export type BrushSelectionMode = Exclude<BrushMode, 'auto'>

export interface BrushOptions {
  mode: BrushMode
  modifier: ModifierKey
  persistent: boolean
  selection?: SharedSelection
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
const optionKeys = ['mode', 'modifier', 'persistent', 'selection']
const selectionContexts = new WeakMap<BrushHandle, Set<SelectionScaleContext>>()
const contextVersions = new WeakMap<BrushHandle, () => void>()

export function connectBrushSelection(handle: BrushHandle, context: SelectionScaleContext) {
  const contexts = selectionContexts.get(handle)!
  validateSharedBrushContext(handle, context)
  contexts.add(context)
  contextVersions.get(handle)!()
  return () => {
    contexts.delete(context)
    contextVersions.get(handle)!()
  }
}

export function validateSharedBrushContext(handle: BrushHandle, candidate: SelectionScaleContext) {
  if (!handle.options.get().resolved.selection) return
  const peers = [...(selectionContexts.get(handle) ?? [])].filter(
    (context) => candidate.owner === undefined || context.owner !== candidate.owner,
  )
  assertMatchingContexts(peers, candidate)
}

function assertMatchingContexts(
  contexts: Iterable<SelectionScaleContext>,
  candidate: SelectionScaleContext,
) {
  for (const context of contexts) {
    // A handle has one public local-name selection view.
    if (context.scales === candidate.scales) continue
    const names = Object.keys(context.scales)
    if (
      names.length !== Object.keys(candidate.scales).length ||
      names.some(
        (name) =>
          context.scales[name] !== candidate.scales[name] ||
          context.direction(name) !== candidate.direction(name),
      )
    ) {
      throw new Error(
        'Shared brush handles require identical local scale mappings; use separate brush handles for different mappings.',
      )
    }
  }
}

export function validateBrushSelections(
  handle: BrushHandle,
  validate: (selection: BrushSelection) => void,
) {
  const consumers = validators.get(handle)!
  consumers.add(validate)
  return () => consumers.delete(validate)
}

export function isBrushHandle(value: object): value is BrushHandle {
  return handles.has(value)
}

function equalSelection(a: BrushSelection | undefined, b: BrushSelection | undefined) {
  if (!a || !b) return a === b
  const names = Object.keys(a.scales)
  return (
    a.mode === b.mode &&
    names.length === Object.keys(b.scales).length &&
    names.every(
      (name) =>
        b.scales[name]?.length === a.scales[name].length &&
        a.scales[name].every((value, index) => value === b.scales[name][index]),
    )
  )
}

export function brush(initial: OptionPatch<BrushOptions> = {}): BrushHandle {
  validateKeys(initial, optionKeys, 'brush')
  const selection = reactive.signal<BrushSelection | undefined>(undefined, equalSelection)
  const consumers = new Set<(selection: BrushSelection) => void>()
  const contexts = new Set<SelectionScaleContext>()
  const state = createOptionState<BrushOptions>(initial, {
    isAtomicReference: isSharedSelection,
    defaults: () => ({
      mode: 'xy',
      modifier: ModifierKey.Shift,
      persistent: false,
      selection: undefined,
    }),
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
      if (options.selection !== undefined) {
        if (
          !options.selection ||
          typeof options.selection !== 'object' ||
          !isSharedSelection(options.selection)
        ) {
          throw new TypeError('brush.selection must be a sharedSelection() handle.')
        }
        if (!options.persistent) throw new Error('brush.selection requires persistent: true.')
        const first = contexts.values().next().value
        if (first) assertMatchingContexts(contexts, first)
      }
    },
  })
  const optionState = optionSignal(state)
  const contextVersion = reactive.signal(0)
  let previousView: BrushSelection | undefined
  let viewVersion = 0
  function readSelection() {
    const config = optionState.snapshot.get().resolved
    contextVersion.get()
    const context = contexts.values().next().value
    const sharedValue = config.selection?.selection.get()
    const next = config.selection
      ? context
        ? localSharedSelection(sharedValue, config.mode, context)
        : undefined
      : selection.get()
    if (!equalSelection(previousView, next)) {
      previousView = next
      viewVersion += 1
    }
    return previousView
  }
  const handle: BrushHandle = Object.freeze({
    options: optionState.snapshot,
    selection: reactive.register(
      {
        get: readSelection,
        get version() {
          readSelection()
          return viewVersion
        },
      },
      equalSelection,
    ),
    update(patch: OptionPatch<BrushOptions>) {
      validateKeys(patch, optionKeys, 'brush')
      const previous = state.getSnapshot().resolved
      if (state.update(patch)) {
        const next = state.getSnapshot().resolved
        if (
          next.mode !== previous.mode ||
          !next.persistent ||
          next.selection !== previous.selection
        )
          selection.set(undefined)
        optionState.publish()
      }
    },
    setSelection(value: BrushSelection | undefined) {
      const config = state.getSnapshot().resolved
      if (value === undefined) {
        if (config.selection) config.selection.setSelection(undefined)
        selection.set(undefined)
        return
      }
      if (!config.persistent) throw new Error('brush.setSelection requires persistent: true.')
      validateSelection(value, config.mode)
      for (const validate of consumers) validate(value)
      if (config.selection) {
        const context = contexts.values().next().value
        if (!context)
          throw new Error(
            'Install the shared brush before setting a local-name selection; use sharedSelection.setSelection() before installation.',
          )
        config.selection.setSelection(shareLocalSelection(value, context))
        return
      }
      const ranges = Object.entries(value.scales)
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
  selectionContexts.set(handle, contexts)
  contextVersions.set(handle, () => contextVersion.update((version) => version + 1))
  return handle
}

import {
  createOptionState,
  type OptionPatch,
  type OptionStateSnapshot,
} from '../../../core/options.js'
import { batch, optionSignal, reactive } from '../../../core/runtime.js'
import { isScaleHandle, type ScaleHandle } from '../../../scales/scale.js'
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
import {
  validateBrushScaleSelection,
  validateSelection,
} from '../../../sync/selection-validation.js'
export { validateBrushScaleSelection } from '../../../sync/selection-validation.js'

export type BrushMode = 'x' | 'y' | 'xy' | 'auto'
export type BrushSelectionMode = Exclude<BrushMode, 'auto'>

export interface BrushOptions {
  mode: BrushMode
  modifier: ModifierKey
  persistent: boolean
  selection?: SharedSelection
  /** Overview scale name to independent detail scale. Requires persistent: true. */
  targets?: Readonly<Record<string, ScaleHandle>>
}

export type BrushConfig = Omit<OptionPatch<BrushOptions>, 'targets'> & {
  targets?: Readonly<Record<string, ScaleHandle>>
}

export interface BrushSelection {
  readonly mode: BrushSelectionMode
  /** Continuous scales contain an ordered pair; band scales contain selected categories. */
  readonly scales: Readonly<Record<string, readonly (number | string)[]>>
}

export interface BrushHandle {
  readonly options: ReadonlySignal<OptionStateSnapshot<BrushOptions>>
  readonly selection: ReadonlySignal<BrushSelection | undefined>
  update(patch: BrushConfig): void
  /** Sets a persistent selection without emitting a user brush event; undefined clears it. */
  setSelection(selection: BrushSelection | undefined): void
}

export const brushEvent = 'brush'

const handles = new WeakSet<object>()
const validators = new WeakMap<BrushHandle, Set<(selection: BrushSelection) => void>>()
const optionKeys = ['mode', 'modifier', 'persistent', 'selection', 'targets']
const selectionContexts = new WeakMap<BrushHandle, Set<SelectionScaleContext>>()
const contextVersions = new WeakMap<BrushHandle, () => void>()
const selectionWrites = new WeakMap<BrushHandle, Set<() => void>>()

export function onBrushSelectionSet(handle: BrushHandle, listener: () => void) {
  const listeners = selectionWrites.get(handle)!
  listeners.add(listener)
  return () => listeners.delete(listener)
}

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
  validateBrushTargets(handle.options.get().resolved, candidate)
  if (!handle.options.get().resolved.selection) return
  const peers = [...(selectionContexts.get(handle) ?? [])].filter(
    (context) => candidate.owner === undefined || context.owner !== candidate.owner,
  )
  assertMatchingContexts(peers, candidate)
}

export function equalBrushTargets(a: BrushOptions['targets'], b: BrushOptions['targets']) {
  if (!a || !b) return a === b
  const names = Object.keys(a)
  return names.length === Object.keys(b).length && names.every((name) => a[name] === b[name])
}

export function validateBrushTargets(
  options: Readonly<BrushOptions>,
  context: SelectionScaleContext,
) {
  for (const [name, target] of Object.entries(options.targets ?? {})) {
    const source = Object.hasOwn(context.scales, name) ? context.scales[name] : undefined
    if (!source) throw new Error(`brush.targets references missing overview scale "${name}".`)
    if (Object.values(context.scales).includes(target)) {
      throw new Error('brush.targets must use independent detail scales, not overview scales.')
    }
    if (source.kind !== target.kind) {
      throw new Error(`brush.targets.${name} must match the overview scale kind.`)
    }
    if (options.mode !== 'auto' && !options.mode.includes(context.direction(name))) {
      throw new Error(`brush.targets.${name} does not match mode ${options.mode}.`)
    }
    validateSelection(
      {
        mode: context.direction(name) === 'x' ? 'x' : 'y',
        scales: { [name]: target.domain.get() },
      },
      'auto',
    )
  }
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

export function brush(initial: BrushConfig = {}): BrushHandle {
  validateKeys(initial, optionKeys, 'brush')
  const selection = reactive.signal<BrushSelection | undefined>(undefined, equalSelection)
  const consumers = new Set<(selection: BrushSelection) => void>()
  const contexts = new Set<SelectionScaleContext>()
  const state = createOptionState<BrushOptions>(initial, {
    isAtomicReference: (value) => isSharedSelection(value) || isScaleHandle(value),
    defaults: () => ({
      mode: 'xy',
      modifier: ModifierKey.Shift,
      persistent: false,
      selection: undefined,
      targets: undefined,
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
      if (options.targets !== undefined) {
        if (
          !options.targets ||
          typeof options.targets !== 'object' ||
          Array.isArray(options.targets) ||
          !Object.keys(options.targets).length
        ) {
          throw new TypeError('brush.targets must be a non-empty named scale map.')
        }
        if (!options.persistent) throw new Error('brush.targets requires persistent: true.')
        if (options.selection)
          throw new Error('brush.targets cannot be combined with brush.selection.')
        const targets = new Set<ScaleHandle>()
        for (const [name, target] of Object.entries(options.targets)) {
          if (!name || !target || !isScaleHandle(target) || target.kind === 'band') {
            throw new TypeError(`brush.targets.${name} requires a continuous scale handle.`)
          }
          if (targets.has(target)) throw new Error('brush.targets must use distinct detail scales.')
          targets.add(target)
        }
        for (const context of contexts) validateBrushTargets(options, context)
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
    update(patch: BrushConfig) {
      validateKeys(patch, optionKeys, 'brush')
      const previous = state.getSnapshot().resolved
      if (state.update(patch)) {
        const next = state.getSnapshot().resolved
        if (
          next.mode !== previous.mode ||
          !next.persistent ||
          next.selection !== previous.selection ||
          !equalBrushTargets(next.targets, previous.targets)
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
        reactive.untracked(() => {
          for (const listener of selectionWrites.get(handle)!) listener()
        })
        return
      }
      if (!config.persistent) throw new Error('brush.setSelection requires persistent: true.')
      validateSelection(value, config.mode)
      for (const validate of consumers) validate(value)
      for (const [name, target] of Object.entries(config.targets ?? {})) {
        const range = value.scales[name]
        if (range) {
          validateBrushScaleSelection(
            { mode: value.mode, scales: { [name]: range } },
            { [name]: target },
            () => (value.mode === 'y' ? 'y' : 'x'),
          )
        }
      }
      if (config.selection) {
        const context = contexts.values().next().value
        if (!context)
          throw new Error(
            'Install the shared brush before setting a local-name selection; use sharedSelection.setSelection() before installation.',
          )
        config.selection.setSelection(shareLocalSelection(value, context))
        return
      }
      batch(() => {
        for (const [name, target] of Object.entries(config.targets ?? {})) {
          const range = value.scales[name]
          const domain = target.domain.get()
          if (range && (range.length !== domain.length || range.some((v, i) => v !== domain[i]))) {
            target.domain.set(range)
          }
        }
        const ranges = Object.entries(value.scales)
        selection.set(
          Object.freeze({
            mode: value.mode,
            scales: Object.freeze(
              Object.fromEntries(
                ranges.map(([name, range]) => [
                  name,
                  Object.freeze([...(config.targets?.[name]?.domain.get() ?? range)]),
                ]),
              ),
            ),
          }),
        )
        reactive.untracked(() => {
          for (const listener of selectionWrites.get(handle)!) listener()
        })
      })
    },
  })
  handles.add(handle)
  validators.set(handle, consumers)
  selectionWrites.set(handle, new Set())
  selectionContexts.set(handle, contexts)
  contextVersions.set(handle, () => contextVersion.update((version) => version + 1))
  return handle
}

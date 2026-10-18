import { createOptionState, type OptionPatch, type OptionStateSnapshot } from '../core/options.js'
import type { ReadonlySignal } from '../core/reactive.js'
import { optionSignal } from '../core/runtime.js'
import { validateKeys } from '../core/validation.js'
import {
  isTableStore,
  validateTableUpdates,
  type TableStore,
  type TableView,
} from '../data-store/table.js'
import { computeStackLayout, stackLayout } from '../layout/stack.js'
import type { ScaleHandle } from '../scales/scale.js'
import {
  retainLayerVisibility,
  validateCompositeLayers,
  validateCompositeStyle,
  type CompositeLayer,
} from './composite.js'

export interface StackedAreaLayer extends CompositeLayer {}

export interface StackedAreaOptions {
  renderer: 'svg' | 'canvas'
  id?: string
  x: string
  scales: { x: string; y: string }
  layers: readonly StackedAreaLayer[]
  curve: 'linear' | 'step'
  visible: boolean
  label: string
  fill?: string
  opacity: number
  stroke?: string
  strokeWidth: number
}

export interface StackedAreaMark {
  readonly id: string | undefined
  readonly x: string
  readonly y: string
  readonly data: TableStore
  readonly options: ReadonlySignal<OptionStateSnapshot<StackedAreaOptions>>
  update(patch: OptionPatch<StackedAreaOptions>): void
}

const handles = new WeakSet<object>()
const validators = new WeakMap<
  StackedAreaMark,
  Set<(options: Readonly<StackedAreaOptions>) => void>
>()
const tableChecks = new WeakMap<StackedAreaMark, (data: TableView) => void>()
export const isStackedAreaMark = (value: object): value is StackedAreaMark => handles.has(value)

function layoutOptions(options: Readonly<StackedAreaOptions>) {
  return { x: options.x, layers: options.layers, layout: 'stacked' as const }
}

function validateData(data: TableView, options: Readonly<StackedAreaOptions>) {
  if (data.kind(options.x) !== 'number')
    throw new Error('stackedArea requires a numeric/time x column.')
  if (isTableStore(data)) stackLayout(data, layoutOptions(options))
  else computeStackLayout(data, layoutOptions(options))
}

export function validateStackedAreaScales(
  options: Readonly<StackedAreaOptions>,
  scales: Readonly<Record<string, ScaleHandle>>,
) {
  const x = scales[options.scales.x]
  const y = scales[options.scales.y]
  if (!x || !y) throw new Error('stackedArea references a missing x or value scale.')
  if (x.kind !== 'linear' && x.kind !== 'time')
    throw new Error('stackedArea requires a continuous linear or time x scale.')
  if (y.kind !== 'linear') throw new Error('stackedArea requires a linear value scale.')
}

export function validateStackedAreaUpdates(
  mark: StackedAreaMark,
  validate: (options: Readonly<StackedAreaOptions>) => void,
) {
  const entries = validators.get(mark)
  if (!entries) throw new TypeError('Expected a stackedArea mark.')
  entries.add(validate)
  return () => entries.delete(validate)
}

export function stackedArea(
  data: TableStore,
  initial: OptionPatch<StackedAreaOptions>,
): StackedAreaMark {
  if (!data || !isTableStore(data)) throw new TypeError('stackedArea requires a createTable store.')
  const keys = [
    'renderer',
    'id',
    'x',
    'scales',
    'layers',
    'curve',
    'visible',
    'label',
    'fill',
    'opacity',
    'stroke',
    'strokeWidth',
  ]
  const consumers = new Set<(options: Readonly<StackedAreaOptions>) => void>()
  validateKeys(initial, keys, 'stackedArea')
  if (initial.layers === undefined) throw new Error('stackedArea requires layers.')
  const state = createOptionState<StackedAreaOptions>(initial, {
    defaults: () => ({
      renderer: 'svg',
      x: '',
      scales: { x: '', y: '' },
      layers: [],
      curve: 'linear',
      visible: true,
      label: '',
      opacity: 1,
      strokeWidth: 0,
    }),
    validate(options) {
      if (options.renderer !== 'svg' && options.renderer !== 'canvas')
        throw new Error('stackedArea.renderer must be svg or canvas.')
      if (options.id !== undefined && (typeof options.id !== 'string' || !options.id))
        throw new Error('stackedArea.id must be a non-empty string.')
      if (typeof options.x !== 'string' || !options.x)
        throw new Error('stackedArea.x must name a table column.')
      validateKeys(options.scales, ['x', 'y'], 'stackedArea.scales')
      if (
        typeof options.scales.x !== 'string' ||
        !options.scales.x ||
        typeof options.scales.y !== 'string' ||
        !options.scales.y ||
        options.scales.x === options.scales.y
      )
        throw new Error('stackedArea.scales must name distinct x and value scales.')
      if (!Array.isArray(options.layers)) throw new Error('stackedArea.layers must be an array.')
      if (options.curve !== 'linear' && options.curve !== 'step')
        throw new Error('stackedArea.curve supports linear or step only.')
      if (typeof options.visible !== 'boolean' || typeof options.label !== 'string')
        throw new Error('stackedArea requires boolean visible and string label.')
      validateCompositeStyle(options, 'stackedArea')
      validateCompositeLayers(options.layers, 'stackedArea')
      validateData(data, options)
      for (const consumer of consumers) consumer(options)
    },
  })
  const signals = optionSignal(state)
  const mark: StackedAreaMark = Object.freeze({
    data,
    options: signals.snapshot,
    get id() {
      return state.getSnapshot().resolved.id
    },
    get x() {
      return state.getSnapshot().resolved.scales.x
    },
    get y() {
      return state.getSnapshot().resolved.scales.y
    },
    update(patch: OptionPatch<StackedAreaOptions>) {
      validateKeys(patch, keys, 'stackedArea')
      const old = state.getSnapshot().resolved
      if (Object.hasOwn(patch, 'id') && patch.id !== old.id)
        throw new Error('stackedArea.id is immutable.')
      if (patch.layers)
        patch = { ...patch, layers: retainLayerVisibility(patch.layers, old.layers) }
      if (state.update(patch)) signals.publish()
    },
  })
  const check = (candidate: TableView) => validateData(candidate, state.getSnapshot().resolved)
  tableChecks.set(mark, check)
  validateTableUpdates(data, check)
  handles.add(mark)
  validators.set(mark, consumers)
  return mark
}

export function stackedAreaEndpoints(mark: StackedAreaMark) {
  return stackLayout(mark.data, layoutOptions(mark.options.get().resolved))
}

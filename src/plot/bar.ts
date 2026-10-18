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
import { computeStackLayout, stackLayout, type StackLayoutOptions } from '../layout/stack.js'
import type { ScaleHandle } from '../scales/scale.js'
import {
  retainLayerVisibility,
  validateCompositeLayers,
  validateCompositeStyle,
  type CompositeLayer,
} from './composite.js'

export interface BarLayer extends CompositeLayer {}
export interface BarOptions {
  text?: {
    format: (value: number, layerId: string, row: number) => string
    dx?: number
    dy?: number
    fill?: string
  }
  renderer: 'svg' | 'canvas'
  id?: string
  x: string
  y?: string
  scales: { x: string; y: string }
  layers?: readonly BarLayer[]
  layout?: 'grouped' | 'stacked'
  orientation: 'vertical' | 'horizontal'
  interval?: { start: string; end: string }
  width?: number
  groupPadding: number
  layerPadding: number
  visible: boolean
  label: string
  fill?: string
  opacity: number
  stroke?: string
  strokeWidth: number
}
export interface BarMark {
  readonly id: string | undefined
  /** Physical scale names, after applying orientation. */
  readonly x: string
  readonly y: string
  readonly data: TableStore
  readonly options: ReadonlySignal<OptionStateSnapshot<BarOptions>>
  update(patch: OptionPatch<BarOptions>): void
}
const handles = new WeakSet<object>()
const validators = new WeakMap<BarMark, Set<(options: Readonly<BarOptions>) => void>>()
const tableChecks = new WeakMap<BarMark, (data: TableView) => void>()
export const isBarMark = (value: object): value is BarMark => handles.has(value)

export function barLayers(options: Readonly<BarOptions>): readonly BarLayer[] {
  return (
    options.layers ?? [
      {
        id: 'single',
        y: options.y!,
        fill: options.fill,
        opacity: options.opacity,
        stroke: options.stroke,
        strokeWidth: options.strokeWidth,
      },
    ]
  )
}
export function barLayoutOptions(options: Readonly<BarOptions>): StackLayoutOptions {
  return { x: options.x, layers: barLayers(options), layout: options.layout ?? 'grouped' }
}
export function validateBarUpdates(
  mark: BarMark,
  validate: (options: Readonly<BarOptions>) => void,
) {
  const entries = validators.get(mark)
  if (!entries) throw new TypeError('Expected a bar mark.')
  entries.add(validate)
  return () => entries.delete(validate)
}

function validateData(data: TableView, options: Readonly<BarOptions>) {
  if (isTableStore(data)) stackLayout(data, barLayoutOptions(options))
  else computeStackLayout(data, barLayoutOptions(options))
  if (options.interval) {
    if (
      data.kind(options.x) !== 'number' ||
      data.kind(options.interval.start) !== 'number' ||
      data.kind(options.interval.end) !== 'number'
    ) {
      throw new Error('Bar intervals require numeric/time columns.')
    }
    let previousEnd = -Infinity
    for (let row = 0; row < data.length; row += 1) {
      const start = Number(data.valueAt(options.interval.start, row))
      const end = Number(data.valueAt(options.interval.end, row))
      if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start < previousEnd) {
        throw new RangeError(
          `Bar interval at row ${row} must be finite, ordered and non-overlapping.`,
        )
      }
      previousEnd = end
    }
  }
}

export function validateBarScales(
  data: TableView,
  options: Readonly<BarOptions>,
  scales: Readonly<Record<string, ScaleHandle>>,
) {
  const category = scales[options.scales.x]
  const value = scales[options.scales.y]
  if (!category || !value) throw new Error('bar references a missing category or value scale.')
  if (value.kind !== 'linear') throw new Error('bar requires a linear value scale.')
  if (!['band', 'linear', 'time'].includes(category.kind))
    throw new Error('bar requires a band, linear or time category scale.')
  if ((category.kind === 'band') !== (data.kind(options.x) === 'string'))
    throw new Error('Bar x column does not match its category scale kind.')
  if (category.kind === 'band' && (options.interval || options.width !== undefined))
    throw new Error('Band bars use the scale bandwidth, not interval or width.')
  if (category.kind !== 'band' && !options.interval && options.width === undefined)
    throw new Error(
      'Numeric/time bars require explicit interval columns or a positive pixel width.',
    )
}

export function bar(data: TableStore, initial: OptionPatch<BarOptions>): BarMark {
  if (!data || !isTableStore(data)) throw new TypeError('bar requires a createTable store.')
  const keys = [
    'text',
    'renderer',
    'id',
    'x',
    'y',
    'scales',
    'layers',
    'layout',
    'orientation',
    'interval',
    'width',
    'groupPadding',
    'layerPadding',
    'visible',
    'label',
    'fill',
    'opacity',
    'stroke',
    'strokeWidth',
  ]
  const consumers = new Set<(options: Readonly<BarOptions>) => void>()
  function validate(options: Readonly<BarOptions>) {
    if (options.text !== undefined) {
      validateKeys(options.text, ['format', 'dx', 'dy', 'fill'], 'bar.text')
      if (typeof options.text.format !== 'function')
        throw new Error('bar.text.format must be a function.')
      for (const key of ['dx', 'dy'] as const) {
        if (options.text[key] !== undefined && !Number.isFinite(options.text[key])) {
          throw new Error(`bar.text.${key} must be finite.`)
        }
      }
      if (
        options.text.fill !== undefined &&
        (typeof options.text.fill !== 'string' || !options.text.fill)
      ) {
        throw new Error('bar.text.fill must be a non-empty string.')
      }
    }
    if (options.renderer !== 'svg' && options.renderer !== 'canvas')
      throw new Error('bar.renderer must be svg or canvas.')
    if (options.id !== undefined && (typeof options.id !== 'string' || !options.id))
      throw new Error('bar.id must be a non-empty string.')
    if (typeof options.x !== 'string' || !options.x)
      throw new Error('bar.x must name a table column.')
    validateKeys(options.scales, ['x', 'y'], 'bar.scales')
    if (
      typeof options.scales.x !== 'string' ||
      typeof options.scales.y !== 'string' ||
      !options.scales.x ||
      !options.scales.y ||
      options.scales.x === options.scales.y
    )
      throw new Error('bar.scales must name distinct category and value scales.')
    if ((options.y !== undefined) === (options.layers !== undefined))
      throw new Error('bar requires either y or layers, mutually exclusive.')
    if (options.layers !== undefined && !Array.isArray(options.layers))
      throw new Error('bar.layers must be an array.')
    if (
      options.layout !== undefined &&
      options.layout !== 'grouped' &&
      options.layout !== 'stacked'
    )
      throw new Error('bar.layout must be grouped or stacked.')
    if (options.layers && options.layout === undefined)
      throw new Error('Multi-series bars require grouped or stacked layout.')
    if (!['vertical', 'horizontal'].includes(options.orientation))
      throw new Error('bar.orientation must be vertical or horizontal.')
    if (typeof options.visible !== 'boolean' || typeof options.label !== 'string')
      throw new Error('bar requires boolean visible and string label.')
    for (const key of ['groupPadding', 'layerPadding'] as const) {
      if (!Number.isFinite(options[key]) || options[key] < 0 || options[key] >= 1)
        throw new RangeError(`bar.${key} must be in [0, 1).`)
    }
    if (options.width !== undefined && (!Number.isFinite(options.width) || options.width <= 0))
      throw new RangeError('bar.width must be positive pixels.')
    if (options.interval) {
      validateKeys(options.interval, ['start', 'end'], 'bar.interval')
      if (!options.interval.start || !options.interval.end || options.width !== undefined)
        throw new Error(
          'bar.interval requires start/end columns and is mutually exclusive with width.',
        )
    }
    validateCompositeStyle(options, 'bar')
    validateCompositeLayers(barLayers(options), 'bar')
    validateData(data, options)
    for (const consumer of consumers) consumer(options)
  }
  validateKeys(initial, keys, 'bar')
  const state = createOptionState<BarOptions>(initial, {
    defaults: () => ({
      renderer: 'svg',
      x: '',
      scales: { x: '', y: '' },
      orientation: 'vertical',
      groupPadding: 0.1,
      layerPadding: 0.05,
      visible: true,
      label: '',
      opacity: 1,
      strokeWidth: 0,
    }),
    validate,
  })
  const signals = optionSignal(state)
  const mark: BarMark = Object.freeze({
    data,
    options: signals.snapshot,
    get id() {
      return state.getSnapshot().resolved.id
    },
    get x() {
      const o = state.getSnapshot().resolved
      return o.orientation === 'vertical' ? o.scales.x : o.scales.y
    },
    get y() {
      const o = state.getSnapshot().resolved
      return o.orientation === 'vertical' ? o.scales.y : o.scales.x
    },
    update(patch: OptionPatch<BarOptions>) {
      validateKeys(patch, keys, 'bar')
      const old = state.getSnapshot().resolved
      if (Object.hasOwn(patch, 'id') && patch.id !== old.id) throw new Error('bar.id is immutable.')
      if (patch.layers) {
        patch = {
          ...patch,
          layers: retainLayerVisibility(patch.layers, old.layers),
        }
      }
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

export function barEndpoints(mark: BarMark) {
  return stackLayout(mark.data, barLayoutOptions(mark.options.get().resolved))
}

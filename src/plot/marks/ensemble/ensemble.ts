import { validateLegendGroup } from '../static-legend.js'
import {
  createOptionState,
  type OptionPatch,
  type OptionStateSnapshot,
} from '../../../core/options.js'
import type { ReadonlySignal } from '../../../core/reactive.js'
import { optionSignal } from '../../../core/runtime.js'
import { validateKeys } from '../../../core/validation.js'
import { isEnsembleStore, type EnsembleStore } from '../../../data-store/ensemble.js'

/** Parts keep their options while hidden, so the legend can toggle them. */
export interface EnsemblePartVisibility {
  visible?: boolean
}

export interface EnsembleLineOptions extends EnsemblePartVisibility {
  stroke?: string
  width?: number
  strokeDasharray?: string
}

export interface EnsembleMembersOptions extends EnsemblePartVisibility {
  stroke?: string
  width?: number
  /** Stroke opacity of each member line. */
  opacity?: number
  /** Draws only the first `max` members. */
  max?: number
}

export interface EnsembleSpreadOptions extends EnsemblePartVisibility {
  /** Nested percentile bands, e.g. `[[5, 95], [25, 75]]`. */
  bands?: readonly (readonly [number, number])[]
  fill?: string
  /** Fill opacity of each band; overlapping inner bands appear darker. */
  opacity?: number
}

export interface EnsembleControlOptions extends EnsembleLineOptions {
  /** Member index or member id. */
  member: number | string
}

export interface EnsembleExceedanceOptions {
  /** Inspection reports the fraction of valid members strictly above this value. */
  threshold: number
}

export interface EnsembleOptions {
  id?: string
  x: string
  y: string
  label: string
  /** Legend group heading; marks sharing a group are toggled together. */
  legendGroup?: string
  visible: boolean
  /** Renderer for the member lines; statistics are always SVG. */
  renderer: 'svg' | 'canvas'
  members: false | EnsembleMembersOptions
  spread: false | EnsembleSpreadOptions
  median: false | EnsembleLineOptions
  mean: false | EnsembleLineOptions
  control: false | EnsembleControlOptions
  exceedance: false | EnsembleExceedanceOptions
}

export interface EnsembleMark {
  readonly id: string | undefined
  readonly x: string
  readonly y: string
  readonly data: EnsembleStore
  readonly options: ReadonlySignal<OptionStateSnapshot<EnsembleOptions>>
  readonly visible: boolean
  update(patch: OptionPatch<EnsembleOptions>): void
}

export const defaultSpreadBands: readonly (readonly [number, number])[] = Object.freeze([
  [5, 95],
  [25, 75],
])

const keys = [
  'id',
  'x',
  'y',
  'label',
  'legendGroup',
  'visible',
  'renderer',
  'members',
  'spread',
  'median',
  'mean',
  'control',
  'exceedance',
]
const handles = new WeakSet<object>()
const validators = new WeakMap<EnsembleMark, Set<(options: Readonly<EnsembleOptions>) => void>>()
export const isEnsembleMark = (value: object): value is EnsembleMark => handles.has(value)

export function validateEnsembleUpdates(
  mark: EnsembleMark,
  validate: (options: Readonly<EnsembleOptions>) => void,
) {
  const entries = validators.get(mark)
  if (!entries) throw new TypeError('Expected an ensemble mark.')
  entries.add(validate)
  return () => entries.delete(validate)
}

function validatePart(value: unknown, name: string, allowed: readonly string[], toggleable = true) {
  if (value === false) return false
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError(`ensemble.${name} must be false or options.`)
  validateKeys(value, toggleable ? [...allowed, 'visible'] : allowed, `ensemble.${name}`)
  const part = value as Record<string, unknown>
  if (part.visible !== undefined && typeof part.visible !== 'boolean')
    throw new TypeError(`ensemble.${name}.visible must be boolean.`)
  for (const key of ['stroke', 'fill', 'strokeDasharray']) {
    if (part[key] !== undefined && (typeof part[key] !== 'string' || !part[key]))
      throw new TypeError(`ensemble.${name}.${key} must be a non-empty string.`)
  }
  if (part.width !== undefined && (!Number.isFinite(part.width) || Number(part.width) < 0))
    throw new RangeError(`ensemble.${name}.width must be nonnegative.`)
  if (
    part.opacity !== undefined &&
    (!Number.isFinite(part.opacity) || Number(part.opacity) < 0 || Number(part.opacity) > 1)
  )
    throw new RangeError(`ensemble.${name}.opacity must be in [0, 1].`)
  return true
}

/** Resolves the control member to an index; throws for unknown members. */
export function controlMemberIndex(store: EnsembleStore, member: number | string) {
  const index = typeof member === 'string' ? store.memberIndex(member) : member
  if (!Number.isInteger(index) || index < 0 || index >= store.memberCount)
    throw new RangeError(`ensemble.control.member ${String(member)} is not a member of the store.`)
  return index
}

function validateOptions(options: Readonly<EnsembleOptions>, data: EnsembleStore) {
  if (options.id !== undefined && (typeof options.id !== 'string' || !options.id))
    throw new Error('ensemble.id must be a non-empty string.')
  if (typeof options.x !== 'string' || !options.x || typeof options.y !== 'string' || !options.y)
    throw new Error('ensemble.x and ensemble.y must name scales.')
  if (typeof options.visible !== 'boolean') throw new TypeError('ensemble.visible must be boolean.')
  if (typeof options.label !== 'string') throw new TypeError('ensemble.label must be a string.')
  validateLegendGroup(options.legendGroup, 'ensemble')
  if (options.renderer !== 'svg' && options.renderer !== 'canvas')
    throw new Error('ensemble.renderer must be svg or canvas.')
  const lineKeys = ['stroke', 'width', 'strokeDasharray']
  if (validatePart(options.members, 'members', ['stroke', 'width', 'opacity', 'max'])) {
    const max = (options.members as EnsembleMembersOptions).max
    if (max !== undefined && (!Number.isSafeInteger(max) || max < 0))
      throw new RangeError('ensemble.members.max must be a nonnegative integer.')
  }
  if (validatePart(options.spread, 'spread', ['bands', 'fill', 'opacity'])) {
    const bands = (options.spread as EnsembleSpreadOptions).bands
    if (bands !== undefined) {
      if (!Array.isArray(bands)) throw new TypeError('ensemble.spread.bands must be an array.')
      for (const band of bands) {
        if (
          !Array.isArray(band) ||
          band.length !== 2 ||
          !(band[0] >= 0 && band[0] < band[1] && band[1] <= 100)
        )
          throw new RangeError('ensemble.spread.bands must be [low, high] percentiles in [0, 100].')
      }
    }
  }
  validatePart(options.median, 'median', lineKeys)
  validatePart(options.mean, 'mean', lineKeys)
  if (validatePart(options.control, 'control', [...lineKeys, 'member'])) {
    controlMemberIndex(data, (options.control as EnsembleControlOptions).member)
  }
  if (validatePart(options.exceedance, 'exceedance', ['threshold'], false)) {
    const threshold = (options.exceedance as EnsembleExceedanceOptions).threshold
    if (typeof threshold !== 'number' || !Number.isFinite(threshold))
      throw new RangeError('ensemble.exceedance.threshold must be finite.')
  }
}

export function ensemble(data: EnsembleStore, initial: OptionPatch<EnsembleOptions>): EnsembleMark {
  if (!data || !isEnsembleStore(data))
    throw new TypeError('ensemble requires a createEnsemble store.')
  validateKeys(initial, keys, 'ensemble')
  const consumers = new Set<(options: Readonly<EnsembleOptions>) => void>()
  const state = createOptionState<EnsembleOptions>(initial, {
    defaults: () => ({
      x: '',
      y: '',
      label: '',
      visible: true,
      renderer: 'svg',
      members: {},
      spread: false,
      median: false,
      mean: false,
      control: false,
      exceedance: false,
    }),
    validate(options) {
      validateOptions(options, data)
      for (const consumer of consumers) consumer(options)
    },
  })
  const signals = optionSignal(state)
  const mark: EnsembleMark = Object.freeze({
    data,
    options: signals.snapshot,
    get id() {
      return state.getSnapshot().resolved.id
    },
    get x() {
      return state.getSnapshot().resolved.x
    },
    get y() {
      return state.getSnapshot().resolved.y
    },
    get visible() {
      return state.getSnapshot().resolved.visible
    },
    update(patch: OptionPatch<EnsembleOptions>) {
      validateKeys(patch, keys, 'ensemble')
      if (Object.hasOwn(patch, 'id') && patch.id !== state.getSnapshot().resolved.id)
        throw new Error('ensemble.id is immutable; replace the ensemble handle instead.')
      if (state.update(patch)) signals.publish()
    },
  })
  handles.add(mark)
  validators.set(mark, consumers)
  return mark
}

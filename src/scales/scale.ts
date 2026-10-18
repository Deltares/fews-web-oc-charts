import { scaleBand, scaleLinear, scaleUtc } from 'd3-scale'
import { createOptionState, type OptionPatch, type OptionStateSnapshot } from '../core/options.js'
import { reactive, optionSignal } from '../core/runtime.js'
import type { ReadonlySignal, Signal } from '../core/reactive.js'
import { finiteNonnegative, validateKeys } from '../core/validation.js'
import { niceDegreeSteps } from '../Utils/niceDegreeSteps.js'

export type ScaleValue = number | string
export type ScaleKind = 'linear' | 'time' | 'band' | 'degrees'
export type PixelRange = readonly [number, number]

export interface ScaleOptions {
  domain?: readonly ScaleValue[] | undefined
  defaultDomain: readonly ScaleValue[]
  reverse: boolean
  nice: boolean
  includeZero: boolean
  symmetric: boolean
  padding: number
  timeZone: string
  locale: string
}

export interface ScaleHandle {
  readonly kind: ScaleKind
  readonly domain: Signal<readonly ScaleValue[]>
  readonly options: ReadonlySignal<OptionStateSnapshot<ScaleOptions>>
  update(patch: OptionPatch<ScaleOptions>): void
}

export interface ScaleBinding {
  readonly scale: ScaleHandle
  readonly range: ReadonlySignal<PixelRange>
  project(value: ScaleValue): number
  invert(pixel: number): number
  ticks(count?: number): readonly ScaleValue[]
  readonly bandwidth: number
}

const handles = new WeakSet<object>()

export function isScaleHandle(value: object): value is ScaleHandle {
  return handles.has(value)
}

function equalDomain(left: readonly ScaleValue[], right: readonly ScaleValue[]) {
  return left.length === right.length && left.every((value, i) => value === right[i])
}

function createScale(kind: ScaleKind, initial: OptionPatch<ScaleOptions>): ScaleHandle {
  function validate(options: Readonly<ScaleOptions>) {
    for (const key of ['domain', 'defaultDomain'] as const) {
      if (options[key] !== undefined && !Array.isArray(options[key])) {
        throw new Error(`scale.${key} must be an array.`)
      }
    }
    const values = options.domain ?? options.defaultDomain
    if (!Array.isArray(values)) throw new Error('scale.domain must be an array.')
    if (kind === 'band') {
      if (
        values.some((value) => typeof value !== 'string') ||
        new Set(values).size !== values.length
      ) {
        throw new Error('scale.domain must contain unique strings for a band scale.')
      }
    } else if (
      values.length !== 2 ||
      values.some((value) => typeof value !== 'number' || !Number.isFinite(value)) ||
      Number(values[0]) > Number(values[1])
    ) {
      throw new Error('scale.domain must be an ascending pair of finite numbers.')
    }
    if (kind === 'time' && values.some((value) => Math.abs(Number(value)) > 8.64e15)) {
      throw new Error('scale.domain must be within the JavaScript Date range.')
    }
    for (const key of ['reverse', 'nice', 'includeZero', 'symmetric'] as const) {
      if (typeof options[key] !== 'boolean') throw new Error(`scale.${key} must be boolean.`)
    }
    finiteNonnegative(options.padding, 'scale.padding')
    if (options.padding >= 1) throw new Error('scale.padding must be less than 1.')
    if (kind !== 'linear' && (options.includeZero || options.symmetric)) {
      throw new Error('scale.includeZero and scale.symmetric require a linear scale.')
    }
    new Intl.DateTimeFormat(options.locale, { timeZone: options.timeZone })
    resolveDomain(options)
  }
  const defaults = (): ScaleOptions => ({
    defaultDomain: kind === 'band' ? [] : kind === 'degrees' ? [0, 360] : [0, 1],
    reverse: false,
    nice: false,
    includeZero: false,
    symmetric: false,
    padding: 0,
    timeZone: 'UTC',
    locale: 'en-GB',
  })
  const keys = [...Object.keys(defaults()), 'domain']
  validateKeys(initial, keys, 'scale')
  const state = createOptionState<ScaleOptions>(initial, { defaults, validate })
  const optionState = optionSignal(state)
  const options = optionState.snapshot
  function resolveDomain(config: Readonly<ScaleOptions>): readonly ScaleValue[] {
    const source = config.domain ?? config.defaultDomain
    if (kind === 'band') return Object.freeze([...source])
    let low = Number(source[0])
    let high = Number(source[1])
    if (config.includeZero) {
      low = Math.min(low, 0)
      high = Math.max(high, 0)
    }
    if (config.symmetric) {
      high = Math.max(Math.abs(low), Math.abs(high))
      low = -high
    }
    const pad = (high - low) * config.padding
    low -= pad
    high += pad
    const numeric =
      kind === 'time' ? scaleUtc().domain([low, high]) : scaleLinear().domain([low, high])
    if (config.nice) numeric.nice()
    const result = numeric.domain().map(Number)
    if (
      result.some(
        (value) => !Number.isFinite(value) || (kind === 'time' && Math.abs(value) > 8.64e15),
      )
    ) {
      throw new Error('scale.domain resolution overflowed.')
    }
    return Object.freeze(result)
  }
  const domain = reactive.computed(() => resolveDomain(options.get().resolved), equalDomain)
  const handle: ScaleHandle = {
    kind,
    options,
    domain: {
      get: () => domain.get(),
      get version() {
        return domain.version
      },
      set: (value) => handle.update({ domain: value }),
      update: (updater) => handle.update({ domain: updater(domain.get()) }),
    },
    update(patch) {
      validateKeys(patch, keys, 'scale')
      if (state.update(patch)) optionState.publish()
    },
  }
  handles.add(handle)
  return Object.freeze(handle)
}

export const linear = (options: OptionPatch<ScaleOptions> = {}) => createScale('linear', options)
export const time = (options: OptionPatch<ScaleOptions> = {}) => createScale('time', options)
export const band = (options: OptionPatch<ScaleOptions> = {}) => createScale('band', options)
export const degrees = (options: OptionPatch<ScaleOptions> = {}) => createScale('degrees', options)

/** Scales are shareable by default; this documents ownership without copying state. */
export function sharedScale(scale: ScaleHandle): ScaleHandle {
  if (!isScaleHandle(scale)) throw new Error('sharedScale requires a scale handle.')
  return scale
}

export function bindScale(scale: ScaleHandle, range: ReadonlySignal<PixelRange>): ScaleBinding {
  const derived = reactive.computed(() => {
    const domain = scale.domain.get()
    const config = scale.options.get().resolved
    const pixels = [...range.get()]
    if (config.reverse) pixels.reverse()
    if (scale.kind === 'band') {
      return scaleBand<ScaleValue>()
        .domain([...domain])
        .range(pixels)
        .padding(config.padding)
    }
    return scaleLinear().domain(domain.map(Number)).range(pixels)
  })
  return {
    scale,
    range,
    project(value) {
      const current = derived.get()
      if (!('bandwidth' in current) && typeof value !== 'number') {
        throw new Error(`Cannot project "${value}" on ${scale.kind} scale.`)
      }
      const pixel = 'bandwidth' in current ? current(value) : current(Number(value))
      if (pixel === undefined || !Number.isFinite(pixel)) {
        throw new Error(`Cannot project "${value}" on ${scale.kind} scale.`)
      }
      return pixel
    },
    invert(pixel) {
      if (!Number.isFinite(pixel)) throw new Error('scale.invert requires a finite pixel.')
      const current = derived.get()
      if (!('invert' in current)) throw new Error('Cannot invert a band scale.')
      return current.invert(pixel)
    },
    ticks(count = 10) {
      if (!Number.isInteger(count) || count <= 0)
        throw new Error('scale.tickCount must be a positive integer.')
      const current = derived.get()
      if (scale.kind === 'time') {
        return scaleUtc().domain(scale.domain.get().map(Number)).ticks(count).map(Number)
      }
      if (scale.kind === 'degrees') {
        const [low, high] = scale.domain.get().map(Number)
        const step = niceDegreeSteps((high - low) / count)
        if (step === 0) return [low]
        const first = Math.ceil(low / step) * step
        return Array.from(
          { length: Math.floor((high - first) / step) + 1 },
          (_, i) => first + i * step,
        )
      }
      return 'ticks' in current ? current.ticks(count) : current.domain()
    },
    get bandwidth() {
      const current = derived.get()
      return 'bandwidth' in current ? current.bandwidth() : 0
    },
  }
}

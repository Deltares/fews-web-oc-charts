import { color } from 'd3-color'
import { scaleLinear } from 'd3-scale'
import { createOptionState, type OptionPatch, type OptionStateSnapshot } from '../core/options.js'
import type { ReadonlySignal } from '../core/reactive.js'
import { optionSignal } from '../core/runtime.js'
import { validateKeys } from '../core/validation.js'

export interface ColorScaleOptions {
  domain: readonly [number, number]
  colors: readonly string[]
  clamp: boolean
  unknown: string
}

export interface ColorScale {
  readonly options: ReadonlySignal<OptionStateSnapshot<ColorScaleOptions>>
  map(value: number): string
  update(patch: OptionPatch<ColorScaleOptions>): void
}

const handles = new WeakSet<object>()
export const isColorScale = (value: object): value is ColorScale => handles.has(value)

/** Shared value-to-colour mapping, independent of positional plot scales. */
export function colorScale(initial: OptionPatch<ColorScaleOptions> = {}): ColorScale {
  const keys = ['domain', 'colors', 'clamp', 'unknown']
  validateKeys(initial, keys, 'colorScale')
  const state = createOptionState<ColorScaleOptions>(initial, {
    defaults: () => ({
      domain: [0, 1],
      colors: ['#f7fbff', '#08306b'],
      clamp: true,
      unknown: 'transparent',
    }),
    validate(options) {
      const { domain, colors } = options
      if (
        !Array.isArray(domain) ||
        domain.length !== 2 ||
        !Number.isFinite(domain[0]) ||
        !Number.isFinite(domain[1]) ||
        domain[0] > domain[1] ||
        !Number.isFinite(domain[1] - domain[0])
      )
        throw new Error('colorScale.domain must be an ascending pair with finite span.')
      if (
        !Array.isArray(colors) ||
        colors.length < 2 ||
        Array.from(colors).some((value) => typeof value !== 'string' || !color(value))
      )
        throw new Error('colorScale.colors requires at least two CSS colour literals.')
      if (typeof options.clamp !== 'boolean') throw new Error('colorScale.clamp must be boolean.')
      if (typeof options.unknown !== 'string' || !color(options.unknown))
        throw new Error('colorScale.unknown must be a CSS colour literal.')
    },
  })
  const signals = optionSignal(state)
  let version = -1
  let mapping = scaleLinear<string>()
  let options = signals.snapshot.get().resolved
  const handle: ColorScale = Object.freeze({
    options: signals.snapshot,
    map(value: number) {
      if (version !== signals.snapshot.version) {
        options = signals.snapshot.get().resolved
        mapping = scaleLinear<string>()
          .domain(options.colors.map((_, index) => index / (options.colors.length - 1)))
          .range([...options.colors])
          .clamp(options.clamp)
        version = signals.snapshot.version
      }
      if (!Number.isFinite(value)) return options.unknown
      const [low, high] = options.domain
      return mapping(low === high ? 0.5 : (value - low) / (high - low))
    },
    update(patch: OptionPatch<ColorScaleOptions>) {
      validateKeys(patch, keys, 'colorScale')
      if (state.update(patch)) signals.publish()
    },
  })
  handles.add(handle)
  return handle
}

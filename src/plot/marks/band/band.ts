import { validateKeys } from '../../../core/validation.js'
import { reactive, untracked } from '../../../core/runtime.js'
import {
  registerReactiveStaticLegend,
  staticLegendKeys,
  validateStaticLegendOptions,
  type StaticLegendOptions,
} from '../static-legend.js'
import { copyNumericRanges } from '../mark-values.js'

export type BandRange = readonly [number, number]
export type BandRangeValue = BandRange | null | undefined
export type BandRangeValues = ArrayLike<BandRangeValue>

export interface BandOptions extends StaticLegendOptions {
  shapeRendering?: 'auto' | 'crispEdges' | 'geometricPrecision'
  curve?: 'linear' | 'basis' | 'step' | 'step-before' | 'step-after'
  id?: string
  x: string
  y: string
  xValues: BandRangeValues
  yValues: BandRangeValues
  fill?: string
  opacity?: number
}

export interface BandMark {
  readonly shapeRendering?: BandOptions['shapeRendering']
  readonly curve?: BandOptions['curve']
  readonly id: string | undefined
  readonly x: string
  readonly y: string
  readonly xValues: readonly BandRangeValue[]
  readonly yValues: readonly BandRangeValue[]
  readonly fill: string | undefined
  readonly opacity: number
  readonly label: string | undefined
  readonly legendGroup: string | undefined
  readonly visible: boolean
  update(patch: BandUpdate): void
}

/** Updates data, appearance, scale bindings and legend options without changing identity. */
export type BandUpdate = Partial<Omit<BandOptions, 'id'>>

const bandMarks = new WeakSet<object>()
const updateValidators = new WeakMap<BandMark, Set<(candidate: BandMark) => void>>()

export function validateBandUpdates(mark: BandMark, validate: (candidate: BandMark) => void) {
  const validators = updateValidators.get(mark)!
  validators.add(validate)
  return () => {
    validators.delete(validate)
  }
}

export function isBandMark(value: object): value is BandMark {
  return bandMarks.has(value)
}

function validateCurve(curve: BandOptions['curve'], xValues: readonly BandRangeValue[]) {
  if (curve === undefined) return
  if (!['linear', 'basis', 'step', 'step-before', 'step-after'].includes(curve)) {
    throw new Error('band.curve must be linear, basis, step, step-before or step-after.')
  }
  if (xValues.some((value) => value && value[0] !== value[1])) {
    throw new Error('Curved bands require equal x endpoints at each sample.')
  }
}

function validateScaleNames(options: BandOptions) {
  for (const key of ['x', 'y'] as const) {
    if (typeof options[key] !== 'string' || options[key].length === 0) {
      throw new Error(`band.${key} must name a plot scale.`)
    }
  }
}

function normalizeBand(options: BandOptions, previous?: Omit<BandMark, 'update'>) {
  if (!options || typeof options !== 'object') throw new Error('band options must be an object.')
  validateKeys(
    options,
    [
      'id',
      'x',
      'y',
      'xValues',
      'yValues',
      'fill',
      'opacity',
      'curve',
      'shapeRendering',
      ...staticLegendKeys,
    ],
    'band',
  )
  if (
    options.shapeRendering !== undefined &&
    !['auto', 'crispEdges', 'geometricPrecision'].includes(options.shapeRendering)
  ) {
    throw new Error('band.shapeRendering must be auto, crispEdges or geometricPrecision.')
  }
  if (options.id !== undefined && (typeof options.id !== 'string' || options.id.length === 0)) {
    throw new Error('band.id must be a non-empty string.')
  }
  validateScaleNames(options)
  validateStaticLegendOptions(options, 'band')
  const xValues =
    previous && options.xValues === previous.xValues
      ? previous.xValues
      : copyNumericRanges(options.xValues, 'band', 'xValues')
  const yValues =
    previous && options.yValues === previous.yValues
      ? previous.yValues
      : copyNumericRanges(options.yValues, 'band', 'yValues')
  if (xValues.length !== yValues.length) {
    throw new Error('band.xValues and band.yValues must have equal lengths.')
  }
  validateCurve(options.curve, xValues)
  if (options.fill !== undefined && (typeof options.fill !== 'string' || !options.fill)) {
    throw new Error('band.fill must be a non-empty string.')
  }
  const opacity = options.opacity ?? 1
  if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
    throw new Error('band.opacity must be between 0 and 1.')
  }
  return Object.freeze({
    shapeRendering: options.shapeRendering,
    curve: options.curve,
    id: options.id,
    x: options.x,
    y: options.y,
    xValues,
    yValues,
    fill: options.fill,
    opacity,
    label: options.label,
    legendGroup: options.legendGroup,
    visible: options.visible ?? true,
  })
}

export function band(options: BandOptions): BandMark {
  const state = reactive.signal(normalizeBand(options))
  const validators = new Set<(candidate: BandMark) => void>()
  const mark: BandMark = Object.freeze({
    id: options.id,
    get x() {
      return state.get().x
    },
    get y() {
      return state.get().y
    },
    get shapeRendering() {
      return state.get().shapeRendering
    },
    get curve() {
      return state.get().curve
    },
    get xValues() {
      return state.get().xValues
    },
    get yValues() {
      return state.get().yValues
    },
    get fill() {
      return state.get().fill
    },
    get opacity() {
      return state.get().opacity
    },
    get label() {
      return state.get().label
    },
    get legendGroup() {
      return state.get().legendGroup
    },
    get visible() {
      return state.get().visible
    },
    update(patch: BandUpdate) {
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
        throw new Error('band update must be an object.')
      }
      validateKeys(
        patch,
        [
          'x',
          'y',
          'xValues',
          'yValues',
          'fill',
          'opacity',
          'curve',
          'shapeRendering',
          ...staticLegendKeys,
        ],
        'band',
      )
      untracked(() => {
        const previous = state.get()
        const next = normalizeBand({ ...previous, ...patch }, previous)
        const candidate: BandMark = { ...next, update: mark.update }
        for (const validate of validators) validate(candidate)
        state.set(next)
      })
    },
  })
  bandMarks.add(mark)
  updateValidators.set(mark, validators)
  registerReactiveStaticLegend(
    mark,
    () => state.get(),
    (visible) => mark.update({ visible }),
  )
  return mark
}

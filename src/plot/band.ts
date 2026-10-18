import { validateKeys } from '../core/validation.js'

export type BandRange = readonly [number, number]
export type BandRangeValue = BandRange | null | undefined
export type BandRangeValues = ArrayLike<BandRangeValue>

export interface BandOptions {
  id?: string
  x: string
  y: string
  xValues: BandRangeValues
  yValues: BandRangeValues
  fill?: string
  opacity?: number
}

export interface BandMark {
  readonly id: string | undefined
  readonly x: string
  readonly y: string
  readonly xValues: readonly BandRangeValue[]
  readonly yValues: readonly BandRangeValue[]
  readonly fill: string | undefined
  readonly opacity: number
}

const bandMarks = new WeakSet<object>()

export function isBandMark(value: object): value is BandMark {
  return bandMarks.has(value)
}

function copyRanges(values: BandRangeValues, name: string): readonly BandRangeValue[] {
  if (!values || !Number.isSafeInteger(values.length) || values.length < 0) {
    throw new Error(`band.${name} must be an array-like value.`)
  }
  return Object.freeze(
    Array.from({ length: values.length }, (_, index) => {
      const value = values[index]
      if (value === null || value === undefined) return value
      if (
        !value ||
        typeof value !== 'object' ||
        value.length !== 2 ||
        !Number.isFinite(value[0]) ||
        !Number.isFinite(value[1]) ||
        value[0] > value[1]
      ) {
        throw new Error(`band.${name}[${index}] must be an ascending pair of finite numbers.`)
      }
      const range: BandRange = Object.freeze([value[0], value[1]])
      return range
    }),
  )
}

export function band(options: BandOptions): BandMark {
  if (!options || typeof options !== 'object') throw new Error('band options must be an object.')
  validateKeys(options, ['id', 'x', 'y', 'xValues', 'yValues', 'fill', 'opacity'], 'band')
  if (options.id !== undefined && (typeof options.id !== 'string' || options.id.length === 0)) {
    throw new Error('band.id must be a non-empty string.')
  }
  for (const key of ['x', 'y'] as const) {
    if (typeof options[key] !== 'string' || options[key].length === 0) {
      throw new Error(`band.${key} must name a plot scale.`)
    }
  }
  const xValues = copyRanges(options.xValues, 'xValues')
  const yValues = copyRanges(options.yValues, 'yValues')
  if (xValues.length !== yValues.length) {
    throw new Error('band.xValues and band.yValues must have equal lengths.')
  }
  if (options.fill !== undefined && (typeof options.fill !== 'string' || !options.fill)) {
    throw new Error('band.fill must be a non-empty string.')
  }
  const opacity = options.opacity ?? 1
  if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
    throw new Error('band.opacity must be between 0 and 1.')
  }
  const mark = Object.freeze({
    id: options.id,
    x: options.x,
    y: options.y,
    xValues,
    yValues,
    fill: options.fill,
    opacity,
  })
  bandMarks.add(mark)
  return mark
}

import { validateKeys } from '../../../core/validation.js'
import { copyNumericRanges } from '../mark-values.js'

export type BandRange = readonly [number, number]
export type BandRangeValue = BandRange | null | undefined
export type BandRangeValues = ArrayLike<BandRangeValue>

export interface BandOptions {
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
}

const bandMarks = new WeakSet<object>()

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

export function band(options: BandOptions): BandMark {
  if (!options || typeof options !== 'object') throw new Error('band options must be an object.')
  validateKeys(
    options,
    ['id', 'x', 'y', 'xValues', 'yValues', 'fill', 'opacity', 'curve', 'shapeRendering'],
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
  const xValues = copyNumericRanges(options.xValues, 'band', 'xValues')
  const yValues = copyNumericRanges(options.yValues, 'band', 'yValues')
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
  const mark = Object.freeze({
    shapeRendering: options.shapeRendering,
    curve: options.curve,
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

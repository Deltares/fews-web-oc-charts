import { validateKeys } from '../../../core/validation.js'
import { validateVectorValues, type VectorValues } from './arrows.js'

export interface DirectionOptions {
  id?: string
  x: string
  y: string
  xValues: VectorValues
  yValues: VectorValues
  directionValues: VectorValues
  size?: number
  every?: number
  color?: string
  strokeWidth?: number
}

export interface DirectionMark {
  readonly id: string | undefined
  readonly x: string
  readonly y: string
  readonly xValues: VectorValues
  readonly yValues: VectorValues
  readonly directionValues: VectorValues
  readonly size: number
  readonly every: number
  readonly color: string | undefined
  readonly strokeWidth: number
}

const directionMarks = new WeakSet<object>()

export function isDirectionMark(value: object): value is DirectionMark {
  return directionMarks.has(value)
}

export function direction(options: DirectionOptions): DirectionMark {
  if (!options || typeof options !== 'object')
    throw new Error('direction options must be an object.')
  validateKeys(
    options,
    [
      'id',
      'x',
      'y',
      'xValues',
      'yValues',
      'directionValues',
      'size',
      'every',
      'color',
      'strokeWidth',
    ],
    'direction',
  )
  if (options.id !== undefined && (typeof options.id !== 'string' || !options.id)) {
    throw new Error('direction.id must be a non-empty string.')
  }
  for (const key of ['x', 'y'] as const) {
    if (typeof options[key] !== 'string' || !options[key]) {
      throw new Error(`direction.${key} must name a plot scale.`)
    }
  }
  for (const key of ['xValues', 'yValues', 'directionValues'] as const) {
    validateVectorValues(options[key], key, 'direction')
  }
  const length = options.xValues.length
  if (options.yValues.length !== length || options.directionValues.length !== length) {
    throw new Error('direction coordinate and direction arrays must have equal lengths.')
  }
  const size = options.size ?? 12
  const every = options.every ?? 1
  const strokeWidth = options.strokeWidth ?? 1.5
  if (!Number.isFinite(size) || size <= 0) {
    throw new Error('direction.size must be a positive finite number.')
  }
  if (!Number.isSafeInteger(every) || every <= 0) {
    throw new Error('direction.every must be a positive integer.')
  }
  if (options.color !== undefined && (typeof options.color !== 'string' || !options.color)) {
    throw new Error('direction.color must be a non-empty string.')
  }
  if (!Number.isFinite(strokeWidth) || strokeWidth <= 0) {
    throw new Error('direction.strokeWidth must be a positive finite number.')
  }
  const mark = Object.freeze({
    id: options.id,
    x: options.x,
    y: options.y,
    xValues: options.xValues,
    yValues: options.yValues,
    directionValues: options.directionValues,
    size,
    every,
    color: options.color,
    strokeWidth,
  })
  directionMarks.add(mark)
  return mark
}

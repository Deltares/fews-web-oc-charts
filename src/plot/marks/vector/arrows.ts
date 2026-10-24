import { validateKeys } from '../../../core/validation.js'

export type VectorValue = number | null | undefined
export type VectorValues = ArrayLike<VectorValue>

export interface ArrowsOptions {
  id?: string
  x: string
  y: string
  xValues: VectorValues
  yValues: VectorValues
  xEndValues: VectorValues
  yEndValues: VectorValues
  color?: string
  strokeWidth?: number
  headSize?: number
}

export interface ArrowsMark {
  readonly id: string | undefined
  readonly x: string
  readonly y: string
  readonly xValues: VectorValues
  readonly yValues: VectorValues
  readonly xEndValues: VectorValues
  readonly yEndValues: VectorValues
  readonly color: string | undefined
  readonly strokeWidth: number
  readonly headSize: number
}

const arrowMarks = new WeakSet<object>()

export function isArrowsMark(value: object): value is ArrowsMark {
  return arrowMarks.has(value)
}

export function validateVectorValues(values: VectorValues, path: string, markType = 'arrows') {
  if (!values || !Number.isSafeInteger(values.length) || values.length < 0) {
    throw new Error(`${markType}.${path} must be an array-like value.`)
  }
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (
      value !== null &&
      value !== undefined &&
      (typeof value !== 'number' || !Number.isFinite(value))
    ) {
      throw new Error(`${markType}.${path}[${index}] must be a finite number or gap.`)
    }
  }
}

export function arrows(options: ArrowsOptions): ArrowsMark {
  if (!options || typeof options !== 'object') throw new Error('arrows options must be an object.')
  validateKeys(
    options,
    [
      'id',
      'x',
      'y',
      'xValues',
      'yValues',
      'xEndValues',
      'yEndValues',
      'color',
      'strokeWidth',
      'headSize',
    ],
    'arrows',
  )
  if (options.id !== undefined && (typeof options.id !== 'string' || !options.id)) {
    throw new Error('arrows.id must be a non-empty string.')
  }
  for (const key of ['x', 'y'] as const) {
    if (typeof options[key] !== 'string' || !options[key]) {
      throw new Error(`arrows.${key} must name a plot scale.`)
    }
  }
  for (const key of ['xValues', 'yValues', 'xEndValues', 'yEndValues'] as const) {
    validateVectorValues(options[key], key)
  }
  const length = options.xValues.length
  if (
    options.yValues.length !== length ||
    options.xEndValues.length !== length ||
    options.yEndValues.length !== length
  ) {
    throw new Error('arrows coordinate arrays must have equal lengths.')
  }
  if (options.color !== undefined && (typeof options.color !== 'string' || !options.color)) {
    throw new Error('arrows.color must be a non-empty string.')
  }
  const strokeWidth = options.strokeWidth ?? 1.5
  const headSize = options.headSize ?? 8
  if (!Number.isFinite(strokeWidth) || strokeWidth <= 0) {
    throw new Error('arrows.strokeWidth must be a positive finite number.')
  }
  if (!Number.isFinite(headSize) || headSize <= 0) {
    throw new Error('arrows.headSize must be a positive finite number.')
  }
  const mark = Object.freeze({
    id: options.id,
    x: options.x,
    y: options.y,
    xValues: options.xValues,
    yValues: options.yValues,
    xEndValues: options.xEndValues,
    yEndValues: options.yEndValues,
    color: options.color,
    strokeWidth,
    headSize,
  })
  arrowMarks.add(mark)
  return mark
}

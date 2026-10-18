import { validateKeys } from '../core/validation.js'

export type ProgressValue = number | null | undefined
export type ProgressValues = ArrayLike<ProgressValue>
export type ProgressAngleRange = readonly [number, number] | null | undefined
export type ProgressAngleRanges = ArrayLike<ProgressAngleRange>

export interface ProgressOptions {
  id?: string
  x: string
  y: string
  xValues: ProgressAngleRanges
  yValues: ProgressValues
  thickness?: number
  fill?: string
  opacity?: number
}

export interface ProgressMark {
  readonly id: string | undefined
  readonly x: string
  readonly y: string
  readonly xValues: readonly ProgressAngleRange[]
  readonly yValues: readonly ProgressValue[]
  readonly thickness: number
  readonly fill: string | undefined
  readonly opacity: number
}

const progressMarks = new WeakSet<object>()

export function isProgressMark(value: object): value is ProgressMark {
  return progressMarks.has(value)
}

function copyAngleRanges(values: ProgressAngleRanges): readonly ProgressAngleRange[] {
  if (!values || !Number.isSafeInteger(values.length) || values.length < 0) {
    throw new Error('progress.xValues must be an array-like value.')
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
        throw new Error(`progress.xValues[${index}] must be an ascending pair of finite numbers.`)
      }
      return Object.freeze([value[0], value[1]] as const)
    }),
  )
}

function copyValues(values: ProgressValues): readonly ProgressValue[] {
  if (!values || !Number.isSafeInteger(values.length) || values.length < 0) {
    throw new Error('progress.yValues must be an array-like value.')
  }
  return Object.freeze(
    Array.from({ length: values.length }, (_, index) => {
      const value = values[index]
      if (
        value !== null &&
        value !== undefined &&
        (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
      ) {
        throw new Error(`progress.yValues[${index}] must be a nonnegative finite number or gap.`)
      }
      return value
    }),
  )
}

export function progress(options: ProgressOptions): ProgressMark {
  if (!options || typeof options !== 'object')
    throw new Error('progress options must be an object.')
  validateKeys(
    options,
    ['id', 'x', 'y', 'xValues', 'yValues', 'thickness', 'fill', 'opacity'],
    'progress',
  )
  if (options.id !== undefined && (typeof options.id !== 'string' || !options.id)) {
    throw new Error('progress.id must be a non-empty string.')
  }
  for (const key of ['x', 'y'] as const) {
    if (typeof options[key] !== 'string' || !options[key]) {
      throw new Error(`progress.${key} must name a plot scale.`)
    }
  }
  if (options.x === options.y)
    throw new Error('progress.x and progress.y must name distinct scales.')
  const xValues = copyAngleRanges(options.xValues)
  const yValues = copyValues(options.yValues)
  if (xValues.length !== yValues.length) {
    throw new Error('progress.xValues and progress.yValues must have equal lengths.')
  }
  const thickness = options.thickness ?? 12
  if (!Number.isFinite(thickness) || thickness <= 0) {
    throw new Error('progress.thickness must be a positive finite number.')
  }
  if (options.fill !== undefined && (typeof options.fill !== 'string' || !options.fill)) {
    throw new Error('progress.fill must be a non-empty string.')
  }
  const opacity = options.opacity ?? 1
  if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
    throw new Error('progress.opacity must be between 0 and 1.')
  }
  const mark = Object.freeze({
    id: options.id,
    x: options.x,
    y: options.y,
    xValues,
    yValues,
    thickness,
    fill: options.fill,
    opacity,
  })
  progressMarks.add(mark)
  return mark
}

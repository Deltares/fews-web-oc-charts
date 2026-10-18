import type { ScaleKind, ScaleValue } from '../scales/scale.js'
import { validateKeys } from '../core/validation.js'

export type LineValue = ScaleValue | null | undefined
export type LineValues = ArrayLike<LineValue>

export interface LineOptions {
  id?: string
  x: string
  y: string
  xValues: LineValues
  yValues: LineValues
  stroke?: string
  strokeWidth?: number
}

export interface LineMark {
  readonly id: string | undefined
  readonly x: string
  readonly y: string
  readonly xValues: LineValues
  readonly yValues: LineValues
  readonly stroke: string | undefined
  readonly strokeWidth: number
}

const lineMarks = new WeakSet<object>()

export function isLineMark(value: object): value is LineMark {
  return lineMarks.has(value)
}

function validateValues(values: LineValues, name: string) {
  if (!values || !Number.isSafeInteger(values.length) || values.length < 0) {
    throw new Error(`line.${name} must be an array-like value.`)
  }
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (
      value !== null &&
      value !== undefined &&
      !(typeof value === 'number' && !Number.isFinite(value)) &&
      typeof value !== 'number' &&
      typeof value !== 'string'
    ) {
      throw new Error(`line.${name}[${index}] must be a finite number, string, or gap.`)
    }
  }
}

export function validateLineValuesForScale(
  mark: LineMark,
  coordinate: 'x' | 'y',
  kind: ScaleKind,
): void {
  const values = coordinate === 'x' ? mark.xValues : mark.yValues
  const expected = kind === 'band' ? 'string' : 'number'
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (value === null || value === undefined) continue
    if (typeof value === 'number' && !Number.isFinite(value)) continue
    if (typeof value !== expected) {
      throw new TypeError(
        `line "${mark.id ?? ''}" ${coordinate}Values[${index}] must be a ${expected} for ${kind} scale "${mark[coordinate]}".`,
      )
    }
  }
}

export function line(options: LineOptions): LineMark {
  if (!options || typeof options !== 'object') throw new Error('line options must be an object.')
  validateKeys(options, ['id', 'x', 'y', 'xValues', 'yValues', 'stroke', 'strokeWidth'], 'line')
  if (options.id !== undefined && (typeof options.id !== 'string' || options.id.length === 0)) {
    throw new Error('line.id must be a non-empty string.')
  }
  if (typeof options.x !== 'string' || options.x.length === 0) {
    throw new Error('line.x must name a plot scale.')
  }
  if (typeof options.y !== 'string' || options.y.length === 0) {
    throw new Error('line.y must name a plot scale.')
  }
  validateValues(options.xValues, 'xValues')
  validateValues(options.yValues, 'yValues')
  if (options.xValues.length !== options.yValues.length) {
    throw new Error('line.xValues and line.yValues must have equal lengths.')
  }
  if (options.stroke !== undefined && (typeof options.stroke !== 'string' || !options.stroke)) {
    throw new Error('line.stroke must be a non-empty string.')
  }
  const strokeWidth = options.strokeWidth ?? 1.5
  if (!Number.isFinite(strokeWidth) || strokeWidth <= 0) {
    throw new Error('line.strokeWidth must be a positive finite number.')
  }

  const mark = Object.freeze({
    id: options.id,
    x: options.x,
    y: options.y,
    xValues: options.xValues,
    yValues: options.yValues,
    stroke: options.stroke,
    strokeWidth,
  })
  lineMarks.add(mark)
  return mark
}

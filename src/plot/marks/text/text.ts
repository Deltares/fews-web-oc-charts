import type { ScaleKind, ScaleValue } from '../../../scales/scale.js'
import { validateKeys } from '../../../core/validation.js'
import type { LineValue, LineValues } from '../line/line.js'
import { validateCoordinateValues } from '../mark-values.js'

export type TextValue = string | number | null | undefined
export type TextValues = ArrayLike<TextValue>
export type TextAnchor = 'start' | 'middle' | 'end'
export type TextBaseline =
  | 'auto'
  | 'text-bottom'
  | 'alphabetic'
  | 'ideographic'
  | 'middle'
  | 'central'
  | 'mathematical'
  | 'hanging'
  | 'text-top'

export interface TextOptions {
  id?: string
  x: string
  y: string
  xValues: LineValues
  yValues: LineValues
  textValues: TextValues
  dx?: number
  dy?: number
  angle?: number
  fill?: string
  fontFamily?: string
  fontSize?: number
  fontWeight?: string | number
  textAnchor?: TextAnchor
  dominantBaseline?: TextBaseline
}

export interface TextMark {
  readonly id: string | undefined
  readonly x: string
  readonly y: string
  readonly xValues: LineValues
  readonly yValues: LineValues
  readonly textValues: TextValues
  readonly dx: number
  readonly dy: number
  readonly angle: number
  readonly fill: string | undefined
  readonly fontFamily: string | undefined
  readonly fontSize: number | undefined
  readonly fontWeight: string | number | undefined
  readonly textAnchor: TextAnchor
  readonly dominantBaseline: TextBaseline
}

const textMarks = new WeakSet<object>()

export function isTextMark(value: object): value is TextMark {
  return textMarks.has(value)
}

function validateValues(values: TextValues) {
  if (!values || !Number.isSafeInteger(values.length) || values.length < 0) {
    throw new Error('text.textValues must be an array-like value.')
  }
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (
      value !== null &&
      value !== undefined &&
      typeof value !== 'string' &&
      !(typeof value === 'number' && Number.isFinite(value))
    ) {
      throw new Error(`text.textValues[${index}] must be a finite number, string, or gap.`)
    }
  }
}

export function validateTextValuesForScale(
  mark: TextMark,
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
        `text "${mark.id ?? ''}" ${coordinate}Values[${index}] must be a ${expected} for ${kind} scale "${mark[coordinate]}".`,
      )
    }
  }
}

export function isValidTextCoordinate(value: LineValue): value is ScaleValue {
  return typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))
}

export function text(options: TextOptions): TextMark {
  if (!options || typeof options !== 'object') throw new Error('text options must be an object.')
  validateKeys(
    options,
    [
      'id',
      'x',
      'y',
      'xValues',
      'yValues',
      'textValues',
      'dx',
      'dy',
      'angle',
      'fill',
      'fontFamily',
      'fontSize',
      'fontWeight',
      'textAnchor',
      'dominantBaseline',
    ],
    'text',
  )
  if (options.id !== undefined && (typeof options.id !== 'string' || options.id.length === 0)) {
    throw new Error('text.id must be a non-empty string.')
  }
  for (const coordinate of ['x', 'y'] as const) {
    if (typeof options[coordinate] !== 'string' || options[coordinate].length === 0) {
      throw new Error(`text.${coordinate} must name a plot scale.`)
    }
  }
  validateCoordinateValues(options.xValues, 'text', 'xValues')
  validateCoordinateValues(options.yValues, 'text', 'yValues')
  validateValues(options.textValues)
  if (
    options.xValues.length !== options.yValues.length ||
    options.xValues.length !== options.textValues.length
  ) {
    throw new Error('text.xValues, text.yValues and text.textValues must have equal lengths.')
  }
  for (const key of ['dx', 'dy', 'angle'] as const) {
    if (options[key] !== undefined && !Number.isFinite(options[key])) {
      throw new Error(`text.${key} must be finite.`)
    }
  }
  for (const key of ['fill', 'fontFamily'] as const) {
    if (options[key] !== undefined && (typeof options[key] !== 'string' || !options[key])) {
      throw new Error(`text.${key} must be a non-empty string.`)
    }
  }
  if (
    options.fontSize !== undefined &&
    (!Number.isFinite(options.fontSize) || options.fontSize <= 0)
  ) {
    throw new Error('text.fontSize must be a positive finite number.')
  }
  if (
    options.fontWeight !== undefined &&
    !(
      (typeof options.fontWeight === 'string' && options.fontWeight.length > 0) ||
      (typeof options.fontWeight === 'number' &&
        Number.isFinite(options.fontWeight) &&
        options.fontWeight > 0)
    )
  ) {
    throw new Error('text.fontWeight must be a non-empty string or positive finite number.')
  }
  if (
    options.textAnchor !== undefined &&
    !['start', 'middle', 'end'].includes(options.textAnchor)
  ) {
    throw new Error('text.textAnchor must be start, middle or end.')
  }
  const baselines: readonly TextBaseline[] = [
    'auto',
    'text-bottom',
    'alphabetic',
    'ideographic',
    'middle',
    'central',
    'mathematical',
    'hanging',
    'text-top',
  ]
  if (options.dominantBaseline !== undefined && !baselines.includes(options.dominantBaseline)) {
    throw new Error('text.dominantBaseline must be a valid SVG dominant-baseline value.')
  }
  const mark = Object.freeze({
    id: options.id,
    x: options.x,
    y: options.y,
    xValues: options.xValues,
    yValues: options.yValues,
    textValues: options.textValues,
    dx: options.dx ?? 0,
    dy: options.dy ?? 0,
    angle: options.angle ?? 0,
    fill: options.fill,
    fontFamily: options.fontFamily,
    fontSize: options.fontSize,
    fontWeight: options.fontWeight,
    textAnchor: options.textAnchor ?? 'middle',
    dominantBaseline: options.dominantBaseline ?? 'middle',
  })
  textMarks.add(mark)
  return mark
}

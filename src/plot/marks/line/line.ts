import type { ScaleKind, ScaleValue } from '../../../scales/scale.js'
import { validateKeys } from '../../../core/validation.js'
import {
  registerStaticLegend,
  staticLegendKeys,
  type StaticLegendOptions,
} from '../static-legend.js'
import { validateCoordinateValues } from '../mark-values.js'
import type { MarkerSymbol } from './marker-symbol.js'

export type LineValue = ScaleValue | null | undefined
export type LineValues = ArrayLike<LineValue>

export interface LineMarkerOptions {
  symbol?: MarkerSymbol
  skip?: number
  /** D3 symbol area in square CSS pixels; defaults to v4's 10. */
  size?: number
  fill?: string
  stroke?: string
  strokeWidth?: number
}

export interface LineAreaOptions {
  to: ScaleValue
  fill?: string
  opacity?: number
}

export interface LineOptions extends StaticLegendOptions {
  id?: string
  x: string
  y: string
  xValues: LineValues
  yValues: LineValues
  line?: boolean
  stroke?: string
  strokeWidth?: number
  strokeDasharray?: string
  strokeLinecap?: 'butt' | 'round' | 'square'
  strokeLinejoin?: 'miter' | 'round' | 'bevel'
  digits?: number
  vectorEffect?: 'none' | 'non-scaling-stroke'
  markers?: boolean | LineMarkerOptions
  area?: LineAreaOptions
}

export interface LineMark {
  readonly id: string | undefined
  readonly x: string
  readonly y: string
  readonly xValues: LineValues
  readonly yValues: LineValues
  readonly line: boolean
  readonly stroke: string | undefined
  readonly strokeWidth: number
  readonly strokeDasharray?: string
  readonly strokeLinecap?: 'butt' | 'round' | 'square'
  readonly strokeLinejoin?: 'miter' | 'round' | 'bevel'
  readonly digits?: number
  readonly vectorEffect?: 'none' | 'non-scaling-stroke'
  readonly markers: Readonly<Required<LineMarkerOptions>> | undefined
  readonly area: Readonly<Required<LineAreaOptions>> | undefined
}

const lineMarks = new WeakSet<object>()

export function isLineMark(value: object): value is LineMark {
  return lineMarks.has(value)
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
    if (kind === 'log' && typeof value === 'number' && value <= 0) {
      throw new TypeError(
        `line "${mark.id ?? ''}" ${coordinate}Values[${index}] must be positive for log scale "${mark[coordinate]}".`,
      )
    }
    if (typeof value !== expected) {
      throw new TypeError(
        `line "${mark.id ?? ''}" ${coordinate}Values[${index}] must be a ${expected} for ${kind} scale "${mark[coordinate]}".`,
      )
    }
  }
}

function validateLineOptionsObject(options: LineOptions): void {
  if (!options || typeof options !== 'object') throw new Error('line options must be an object.')
  validateKeys(
    options,
    [
      'id',
      'x',
      'y',
      'xValues',
      'yValues',
      'line',
      'stroke',
      'strokeWidth',
      'strokeDasharray',
      'strokeLinecap',
      'strokeLinejoin',
      'digits',
      'vectorEffect',
      'markers',
      'area',
      ...staticLegendKeys,
    ],
    'line',
  )
}

function validateLineCoordinates(options: LineOptions): void {
  if (options.id !== undefined && (typeof options.id !== 'string' || options.id.length === 0)) {
    throw new Error('line.id must be a non-empty string.')
  }
  if (typeof options.x !== 'string' || options.x.length === 0) {
    throw new Error('line.x must name a plot scale.')
  }
  if (typeof options.y !== 'string' || options.y.length === 0) {
    throw new Error('line.y must name a plot scale.')
  }
  validateCoordinateValues(options.xValues, 'line', 'xValues')
  validateCoordinateValues(options.yValues, 'line', 'yValues')
  if (options.xValues.length !== options.yValues.length) {
    throw new Error('line.xValues and line.yValues must have equal lengths.')
  }
  if (options.line !== undefined && typeof options.line !== 'boolean') {
    throw new TypeError('line.line must be a boolean.')
  }
}

function validateStrokeOptions(options: LineOptions): number {
  if (options.stroke !== undefined && (typeof options.stroke !== 'string' || !options.stroke)) {
    throw new Error('line.stroke must be a non-empty string.')
  }
  const strokeWidth = options.strokeWidth ?? 1.5
  if (!Number.isFinite(strokeWidth) || strokeWidth <= 0) {
    throw new Error('line.strokeWidth must be a positive finite number.')
  }
  if (options.strokeDasharray !== undefined && typeof options.strokeDasharray !== 'string') {
    throw new Error('line.strokeDasharray must be a string.')
  }
  if (
    options.strokeLinecap !== undefined &&
    !['butt', 'round', 'square'].includes(options.strokeLinecap)
  ) {
    throw new Error('line.strokeLinecap must be butt, round or square.')
  }
  if (
    options.strokeLinejoin !== undefined &&
    !['miter', 'round', 'bevel'].includes(options.strokeLinejoin)
  ) {
    throw new Error('line.strokeLinejoin must be miter, round or bevel.')
  }
  return strokeWidth
}

function validateLinePrecision(options: LineOptions): void {
  if (
    options.digits !== undefined &&
    (!Number.isInteger(options.digits) || options.digits < 0 || options.digits > 15)
  ) {
    throw new Error('line.digits must be an integer in [0, 15].')
  }
  if (
    options.vectorEffect !== undefined &&
    !['none', 'non-scaling-stroke'].includes(options.vectorEffect)
  ) {
    throw new Error('line.vectorEffect must be none or non-scaling-stroke.')
  }
}

function normalizeLineMarkers(markers: LineOptions['markers']): LineMark['markers'] {
  if (markers === undefined || markers === false) return undefined
  const markerOptions = markers === true ? {} : markers
  if (!markerOptions || typeof markerOptions !== 'object' || Array.isArray(markerOptions)) {
    throw new Error('line.markers must be a boolean or an options object.')
  }
  validateKeys(
    markerOptions,
    ['symbol', 'size', 'fill', 'stroke', 'strokeWidth', 'skip'],
    'line.markers',
  )
  const symbol = markerOptions.symbol ?? 'circle'
  if (
    ![
      'circle',
      'cross',
      'square',
      'diamond',
      'star',
      'wye',
      'triangle',
      'triangle-up',
      'triangle-down',
      'triangle-left',
      'triangle-right',
      'x',
      'plus',
      'rectangle',
    ].includes(symbol)
  ) {
    throw new Error('line.markers.symbol is not a supported marker shape.')
  }
  const skip = markerOptions.skip ?? 1
  if (!Number.isSafeInteger(skip) || skip < 1)
    throw new Error('line.markers.skip must be a positive integer.')
  const size = markerOptions.size ?? 10
  const strokeWidth = markerOptions.strokeWidth ?? (symbol === 'x' || symbol === 'plus' ? 1 : 0)
  validateMarkerDimensions(size, strokeWidth)
  validateMarkerColors(markerOptions)
  return Object.freeze({
    symbol,
    skip,
    size,
    fill: markerOptions.fill ?? '',
    stroke: markerOptions.stroke ?? '',
    strokeWidth,
  })
}

function validateMarkerDimensions(size: number, strokeWidth: number): void {
  for (const [key, value] of [
    ['size', size],
    ['strokeWidth', strokeWidth],
  ] as const) {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`line.markers.${key} must be a nonnegative finite number.`)
    }
  }
}

function validateMarkerColors(markerOptions: LineMarkerOptions): void {
  for (const key of ['fill', 'stroke'] as const) {
    if (
      markerOptions[key] !== undefined &&
      (typeof markerOptions[key] !== 'string' || !markerOptions[key])
    ) {
      throw new Error(`line.markers.${key} must be a non-empty string.`)
    }
  }
}

function normalizeLineArea(area: LineOptions['area']): LineMark['area'] {
  if (area === undefined) return undefined
  if (!area || typeof area !== 'object' || Array.isArray(area)) {
    throw new Error('line.area must be an options object.')
  }
  validateKeys(area, ['to', 'fill', 'opacity'], 'line.area')
  if (
    (typeof area.to !== 'number' && typeof area.to !== 'string') ||
    (typeof area.to === 'number' && !Number.isFinite(area.to))
  ) {
    throw new TypeError('line.area.to must be a finite number or string.')
  }
  if (area.fill !== undefined && (typeof area.fill !== 'string' || !area.fill)) {
    throw new Error('line.area.fill must be a non-empty string.')
  }
  const opacity = area.opacity ?? 0.2
  if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
    throw new Error('line.area.opacity must be between 0 and 1.')
  }
  return Object.freeze({
    to: area.to,
    fill: area.fill ?? '',
    opacity,
  })
}

export function line(options: LineOptions): LineMark {
  validateLineOptionsObject(options)
  validateLineCoordinates(options)
  const strokeWidth = validateStrokeOptions(options)
  validateLinePrecision(options)
  const markers = normalizeLineMarkers(options.markers)
  const area = normalizeLineArea(options.area)
  const mark = Object.freeze({
    id: options.id,
    x: options.x,
    y: options.y,
    xValues: options.xValues,
    yValues: options.yValues,
    line: options.line ?? true,
    stroke: options.stroke,
    strokeWidth,
    strokeDasharray: options.strokeDasharray,
    strokeLinecap: options.strokeLinecap,
    strokeLinejoin: options.strokeLinejoin,
    digits: options.digits,
    vectorEffect: options.vectorEffect,
    markers,
    area,
  })
  lineMarks.add(mark)
  registerStaticLegend(mark, options, 'line')
  return mark
}

import type { SymbolPrimitiveSpec, SymbolSpec } from './legend.js'
import { svgElement } from './svg.js'

export interface LegendSwatchOptions {
  readonly width?: number
  readonly height?: number
}

interface PaintAttributes {
  readonly fill?: string
  readonly stroke?: string
  readonly 'stroke-width'?: number
  readonly opacity?: number
  readonly 'fill-opacity'?: number
}

export type LegendSymbolPrimitive =
  | {
      readonly type: 'line'
      readonly attributes: PaintAttributes & {
        readonly x1: number
        readonly y1: number
        readonly x2: number
        readonly y2: number
        readonly 'stroke-dasharray'?: string
        readonly 'stroke-linecap'?: 'butt' | 'round' | 'square'
        readonly 'stroke-linejoin'?: 'miter' | 'round' | 'bevel'
      }
    }
  | {
      readonly type: 'circle'
      readonly attributes: PaintAttributes & {
        readonly cx: number
        readonly cy: number
        readonly r: number
      }
    }
  | {
      readonly type: 'rect'
      readonly attributes: PaintAttributes & {
        readonly x: number
        readonly y: number
        readonly width: number
        readonly height: number
      }
    }

function dimensions({ width = 36, height = 20 }: LegendSwatchOptions) {
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    throw new RangeError('Legend swatch width and height must be positive finite numbers.')
  }
  return { width, height }
}

/** Pure SVG geometry, usable by framework renderers without a document. Marker size is a radius. */
export function legendSymbolPrimitives(
  symbol: SymbolSpec,
  options: LegendSwatchOptions = {},
): readonly LegendSymbolPrimitive[] {
  const { width, height } = dimensions(options)
  if (symbol.type === 'group') return []
  const parts = symbol.type === 'composite' || symbol.type === 'stack' ? symbol.parts : [symbol]
  if (!parts.length) return []
  const maxStroke = Math.max(0, ...parts.map((part) => part.strokeWidth ?? 0))
  const inset = Math.min(1 + maxStroke / 2, width / 2, height / 2)
  const left = inset
  const right = width - inset
  const top = inset
  const bottom = height - inset
  const middle = height / 2
  const result: LegendSymbolPrimitive[] = []

  function draw(part: SymbolPrimitiveSpec, y: number, h: number, stacked: boolean) {
    if (part.type === 'line') {
      result.push({
        type: 'line',
        attributes: {
          x1: left,
          y1: stacked ? y + h / 2 : middle,
          x2: right,
          y2: stacked ? y + h / 2 : middle,
          stroke: part.stroke ?? 'currentColor',
          'stroke-width': part.strokeWidth ?? 1.5,
          'stroke-dasharray': part.strokeDasharray,
          'stroke-linecap': part.strokeLinecap ?? 'round',
          'stroke-linejoin': part.strokeLinejoin ?? 'round',
          opacity: part.opacity,
        },
      })
    } else if (part.type === 'marker') {
      result.push({
        type: 'circle',
        attributes: {
          cx: width / 2,
          cy: stacked ? y + h / 2 : middle,
          r: Math.min(
            part.size ?? 4,
            Math.max(0, (width - (part.strokeWidth ?? 0)) / 2),
            Math.max(0, ((stacked ? h : height) - (part.strokeWidth ?? 0)) / 2),
          ),
          fill: part.fill ?? 'currentColor',
          stroke: part.stroke ?? 'none',
          'stroke-width': part.strokeWidth ?? 0,
          opacity: part.opacity,
        },
      })
    } else {
      result.push({
        type: 'rect',
        attributes: {
          x: left,
          y: !stacked && part.type === 'area' ? middle : y,
          width: right - left,
          height: !stacked && part.type === 'area' ? bottom - middle : h,
          fill: part.fill ?? 'currentColor',
          'fill-opacity': part.opacity ?? 1,
          stroke: part.stroke ?? 'none',
          'stroke-width': part.strokeWidth ?? 0,
        },
      })
    }
  }

  if (symbol.type === 'stack') {
    const bandHeight = (bottom - top) / parts.length
    parts.forEach((part, index) => draw(part, bottom - (index + 1) * bandHeight, bandHeight, true))
  } else {
    for (const part of parts) draw(part, top, bottom - top, false)
  }
  return result
}

/** Creates only a decorative swatch; labels, visibility and controls belong to the caller. */
export function createLegendSwatch(
  symbol: SymbolSpec,
  options: LegendSwatchOptions = {},
): SVGSVGElement {
  const { width, height } = dimensions(options)
  const element = svgElement('svg', {
    width,
    height,
    viewBox: `0 0 ${width} ${height}`,
    'aria-hidden': 'true',
    focusable: 'false',
  })
  for (const primitive of legendSymbolPrimitives(symbol, { width, height })) {
    const node = svgElement(primitive.type)
    for (const [name, value] of Object.entries(primitive.attributes)) {
      if (value !== undefined) node.setAttribute(name, String(value))
    }
    element.append(node)
  }
  return element
}

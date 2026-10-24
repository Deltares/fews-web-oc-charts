import type { SymbolPrimitiveSpec, SymbolSpec } from './legend.js'
import { svgElement } from '../../rendering/svg.js'

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
  | {
      readonly type: 'path'
      readonly attributes: PaintAttributes & {
        readonly d: string
        readonly 'stroke-dasharray'?: string
        readonly 'stroke-linecap'?: 'butt' | 'round' | 'square'
      }
    }
  | {
      readonly type: 'text'
      readonly text: string
      readonly attributes: PaintAttributes & {
        readonly x: number
        readonly y: number
        readonly 'text-anchor': 'middle'
        readonly 'dominant-baseline': 'central'
        readonly 'font-size': number
        readonly 'font-family'?: string
        readonly 'font-weight'?: string | number
      }
    }

function dimensions({ width = 20, height = 20 }: LegendSwatchOptions) {
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    throw new RangeError('Legend swatch width and height must be positive finite numbers.')
  }
  return { width, height }
}

/** Arrowhead outline of the v4 `symbolArrow`, notch at the origin and tip along +y·(-2). */
function arrowHead(cx: number, cy: number, unit: number, horizontal: boolean) {
  const halfWidth = unit * 1.2
  const points = [
    [0, 0],
    [-halfWidth, unit],
    [0, -2 * unit],
    [halfWidth, unit],
  ].map(([x, y]) => (horizontal ? [cx - y, cy + x] : [cx + x, cy + y]))
  return `M${points.map(([x, y]) => `${x},${y}`).join('L')}Z`
}

/**
 * Pure SVG geometry, usable by framework renderers without a document. Shapes follow the v4
 * `drawLegendSymbol` layout on a 20×20 canvas; vertical sizes scale with the swatch height.
 * Marker size is a radius.
 */
export function legendSymbolPrimitives(
  symbol: SymbolSpec,
  options: LegendSwatchOptions = {},
): readonly LegendSymbolPrimitive[] {
  const { width, height } = dimensions(options)
  if (symbol.type === 'group') return []
  const parts = symbol.type === 'composite' || symbol.type === 'stack' ? symbol.parts : [symbol]
  if (!parts.length) return []
  const unit = height / 20
  const cx = width / 2
  const cy = height / 2
  // Stacked bands keep their strokes inside the swatch.
  const maxStroke = Math.max(
    0,
    ...parts.map((part) => ('strokeWidth' in part && part.strokeWidth) || 0),
  )
  const inset = symbol.type === 'stack' ? Math.min(1 + maxStroke / 2, width / 2, height / 2) : 0
  const result: LegendSymbolPrimitive[] = []

  function rect(
    part: Extract<SymbolPrimitiveSpec, { type: 'area' | 'bar' | 'steps' }>,
    x: number,
    y: number,
    w: number,
    h: number,
  ) {
    result.push({
      type: 'rect',
      attributes: {
        x,
        y,
        width: w,
        height: h,
        fill: part.fill ?? 'currentColor',
        'fill-opacity': part.opacity ?? 1,
        stroke: part.stroke ?? 'none',
        'stroke-width': part.strokeWidth ?? 0,
      },
    })
  }

  function draw(part: SymbolPrimitiveSpec, y: number, h: number, stacked: boolean) {
    const middle = stacked ? y + h / 2 : cy
    switch (part.type) {
      case 'line':
        result.push({
          type: 'line',
          attributes: {
            x1: inset,
            y1: middle,
            x2: width - inset,
            y2: middle,
            stroke: part.stroke ?? 'currentColor',
            'stroke-width': part.strokeWidth ?? 1.5,
            'stroke-dasharray': part.strokeDasharray,
            'stroke-linecap': part.strokeLinecap ?? 'round',
            'stroke-linejoin': part.strokeLinejoin ?? 'round',
            opacity: part.opacity,
          },
        })
        return
      case 'marker':
        result.push({
          type: 'circle',
          attributes: {
            cx,
            cy: middle,
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
        return
      case 'area':
      case 'bar':
      case 'steps':
        if (stacked) rect(part, inset, y, width - 2 * inset, h)
        else if (part.type === 'area') rect(part, 0, cy - 5 * unit, width, 10 * unit)
        else if (part.type === 'bar') rect(part, cx - 5 * unit, cy - 5 * unit, 10 * unit, 10 * unit)
        else {
          rect(part, 0, cy - 8 * unit, 5 * unit, 18 * unit)
          rect(part, 5 * unit, cy - 6 * unit, 5 * unit, 16 * unit)
          rect(part, 10 * unit, cy - 5 * unit, 5 * unit, 15 * unit)
        }
        return
      case 'rule':
        result.push({
          type: 'line',
          attributes: {
            x1: cx,
            y1: cy - 8 * unit,
            x2: cx,
            y2: cy + 8 * unit,
            stroke: part.stroke ?? 'currentColor',
            'stroke-width': part.strokeWidth ?? 1.5,
            'stroke-dasharray': part.strokeDasharray,
            opacity: part.opacity,
          },
        })
        return
      case 'arrow': {
        const size = Math.min(width / 4, height / 2.4)
        const color = part.color ?? 'currentColor'
        result.push(
          {
            type: 'line',
            attributes: {
              x1: 0,
              y1: cy,
              x2: 2 * size,
              y2: cy,
              stroke: color,
              'stroke-width': part.strokeWidth ?? 1.5,
              opacity: part.opacity,
            },
          },
          {
            type: 'path',
            attributes: {
              d: arrowHead(2 * size, cy, size, true),
              fill: color,
              stroke: 'none',
              opacity: part.opacity,
            },
          },
        )
        return
      }
      case 'direction':
        result.push({
          type: 'path',
          attributes: {
            d: arrowHead(cx, cy, Math.min(width, height) / 5, false),
            fill: part.color ?? 'currentColor',
            stroke: 'none',
            opacity: part.opacity,
          },
        })
        return
      case 'text':
        result.push({
          type: 'text',
          text: part.text ?? '+1.0',
          attributes: {
            x: cx,
            y: cy,
            'text-anchor': 'middle',
            'dominant-baseline': 'central',
            'font-size': 10 * unit,
            'font-family': part.fontFamily,
            'font-weight': part.fontWeight,
            fill: part.fill ?? 'currentColor',
            opacity: part.opacity,
          },
        })
    }
  }

  if (symbol.type === 'stack') {
    const bandHeight = (height - 2 * inset) / parts.length
    parts.forEach((part, index) =>
      draw(part, height - inset - (index + 1) * bandHeight, bandHeight, true),
    )
  } else {
    for (const part of parts) draw(part, 0, height, false)
  }
  return result
}

/** Builds the SVG node for one primitive. */
export function legendSymbolNode(primitive: LegendSymbolPrimitive): SVGElement {
  const node = svgElement(primitive.type)
  for (const [name, value] of Object.entries(primitive.attributes)) {
    if (value !== undefined) node.setAttribute(name, String(value))
  }
  if (primitive.type === 'text') node.textContent = primitive.text
  return node
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
  Object.assign(element.style, {
    width: `${width}px`,
    height: `${height}px`,
    background: 'none',
  })
  for (const primitive of legendSymbolPrimitives(symbol, { width, height })) {
    element.append(legendSymbolNode(primitive))
  }
  return element
}

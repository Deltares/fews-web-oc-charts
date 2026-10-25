import {
  symbol,
  symbolCircle,
  symbolCross,
  symbolDiamond,
  symbolSquare,
  symbolStar,
  symbolTriangle,
  symbolWye,
} from 'd3'

export type MarkerSymbol =
  | 'circle'
  | 'cross'
  | 'square'
  | 'diamond'
  | 'star'
  | 'wye'
  | 'triangle'
  | 'triangle-up'
  | 'triangle-down'
  | 'triangle-left'
  | 'triangle-right'
  | 'x'
  | 'plus'
  | 'rectangle'

const symbolTypes = {
  circle: symbolCircle,
  cross: symbolCross,
  square: symbolSquare,
  diamond: symbolDiamond,
  star: symbolStar,
  triangle: symbolTriangle,
  wye: symbolWye,
  'triangle-up': symbolTriangle,
  'triangle-down': symbolTriangle,
  'triangle-left': symbolTriangle,
  'triangle-right': symbolTriangle,
} as const

export function markerSymbolPath(shape: MarkerSymbol, area: number): string {
  const radius = Math.sqrt(area / Math.PI)
  if (shape === 'rectangle') {
    const halfWidth = Math.sqrt(area / 2)
    const halfHeight = Math.sqrt(area / 8)
    return `M${-halfWidth},${-halfHeight}H${halfWidth}V${halfHeight}H${-halfWidth}Z`
  }
  if (shape === 'plus') {
    const extent = Math.sqrt(area) / 2
    return `M${-extent},0H${extent}M0,${-extent}V${extent}`
  }
  if (shape === 'x') {
    const extent = Math.sqrt(area) / 2
    return `M${-extent},${-extent}L${extent},${extent}M${-extent},${extent}L${extent},${-extent}`
  }
  return symbol(symbolTypes[shape], area)() ?? ''
}

export function markerSymbolRotation(shape: MarkerSymbol): number {
  switch (shape) {
    case 'triangle-down':
      return 180
    case 'triangle-left':
      return -90
    case 'triangle-right':
      return 90
    default:
      return 0
  }
}

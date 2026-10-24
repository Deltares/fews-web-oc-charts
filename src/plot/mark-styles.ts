import type { ThemeTokens } from '../theme/theme.js'
import type { CompositeStyle } from './composite.js'
import type { LineMark } from './line.js'
import { accent } from './mark-definition.js'

export function resolveCompositeStyle(
  layer: CompositeStyle,
  options: CompositeStyle,
  themeAccent: string,
) {
  return {
    fill: layer.fill ?? options.fill ?? `var(--fews-chart-accent, ${themeAccent})`,
    opacity: layer.opacity ?? options.opacity ?? 1,
    stroke: layer.stroke ?? options.stroke ?? 'none',
    strokeWidth: layer.strokeWidth ?? options.strokeWidth ?? 0,
  }
}

export function resolveLineStyles(
  mark: Pick<
    LineMark,
    | 'stroke'
    | 'strokeWidth'
    | 'strokeDasharray'
    | 'strokeLinecap'
    | 'strokeLinejoin'
    | 'markers'
    | 'area'
  >,
  tokens: ThemeTokens,
) {
  const stroke = mark.stroke ?? accent(tokens)
  return {
    line: {
      stroke,
      strokeWidth: mark.strokeWidth,
      strokeDasharray: mark.strokeDasharray,
      strokeLinecap: mark.strokeLinecap ?? 'round',
      strokeLinejoin: mark.strokeLinejoin ?? 'round',
    },
    area: {
      fill: mark.area?.fill || stroke,
      opacity: mark.area?.opacity ?? 0,
    },
    marker: {
      shape: 'circle' as const,
      fill: mark.markers?.fill || stroke,
      stroke: mark.markers?.stroke ?? 'none',
      strokeWidth: mark.markers?.strokeWidth ?? 0,
      size:
        mark.markers?.symbolSize === undefined
          ? (mark.markers?.size ?? 0)
          : Math.sqrt(mark.markers.symbolSize / Math.PI),
    },
  }
}

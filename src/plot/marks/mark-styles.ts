import type { ThemeTokens } from '../../theme/theme.js'
import type { CompositeStyle } from './composite.js'
import type { LineMark } from './line/line.js'
import { accent } from './mark-definition.js'
import type { SymbolSpec, SymbolPrimitiveSpec } from '../plugins/legend/legend.js'

export function lineLegendSymbol(
  mark: Omit<LineMark, 'xValues' | 'yValues'>,
  tokens: ThemeTokens,
): SymbolSpec {
  const styles = resolveLineStyles(mark, tokens)
  const parts: SymbolPrimitiveSpec[] = []
  if (mark.area) parts.push({ type: 'area', ...styles.area })
  if (mark.line) parts.push({ type: 'line', ...styles.line })
  if (mark.markers) parts.push({ type: 'marker', ...styles.marker })
  return { type: 'composite', parts }
}

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
      shape: mark.markers?.symbol ?? 'circle',
      fill: mark.markers?.fill || stroke,
      stroke:
        mark.markers?.stroke ||
        (mark.markers?.symbol === 'x' || mark.markers?.symbol === 'plus' ? stroke : 'none'),
      strokeWidth: mark.markers?.strokeWidth ?? 0,
      size: mark.markers?.size ?? 10,
    },
  }
}

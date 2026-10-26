import type { ThemeTokens } from '../../theme/theme.js'
import type { CompositeStyle } from './composite.js'
import type { LineMark } from './line/line.js'
import { accent } from './mark-definition.js'
import type { SymbolSpec, SymbolPrimitiveSpec } from '../plugins/legend/legend.js'
import { resolveMarkColor } from '../../theme/color-contrast.js'

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
  tokens: ThemeTokens,
) {
  return {
    fill: resolveMarkColor(layer.fill ?? options.fill ?? accent(tokens), tokens),
    opacity: layer.opacity ?? options.opacity ?? 1,
    stroke: resolveMarkColor(layer.stroke ?? options.stroke ?? 'none', tokens),
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
      stroke: resolveMarkColor(stroke, tokens),
      strokeWidth: mark.strokeWidth,
      strokeDasharray: mark.strokeDasharray,
      strokeLinecap: mark.strokeLinecap ?? 'round',
      strokeLinejoin: mark.strokeLinejoin ?? 'round',
    },
    area: {
      fill: resolveMarkColor(mark.area?.fill || stroke, tokens),
      opacity: mark.area?.opacity ?? 0,
    },
    marker: {
      shape: mark.markers?.symbol ?? 'circle',
      fill: resolveMarkColor(mark.markers?.fill || stroke, tokens),
      stroke: resolveMarkColor(
        mark.markers?.stroke ||
          (mark.markers?.symbol === 'x' || mark.markers?.symbol === 'plus' ? stroke : 'none'),
        tokens,
      ),
      strokeWidth: mark.markers?.strokeWidth ?? 0,
      size: mark.markers?.size ?? 10,
    },
  }
}

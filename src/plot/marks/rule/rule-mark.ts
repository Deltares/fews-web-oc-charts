import type { ThemeTokens } from '../../../theme/theme.js'
import { isRuleMark, type RuleMark } from './rule.js'
import { svgElement } from '../../axes/render-axes.js'
import {
  accent,
  createKeyCache,
  scaleKey,
  setMarkId,
  type MarkDefinition,
  type MarkRenderContext,
  type MarkRenderer,
} from '../mark-definition.js'
import { applyStaticVisibility, isStaticMarkVisible, staticLegend } from '../static-legend.js'

function createRuleRenderer(): MarkRenderer<RuleMark> {
  const line = svgElement('line', { 'vector-effect': 'non-scaling-stroke', 'data-mark': 'rule' })
  const geometryKey = createKeyCache()
  const styleKey = createKeyCache()
  return {
    mount(layer, mark) {
      setMarkId(line, mark.id)
      layer.append(line)
    },
    geometry(mark: RuleMark, context: MarkRenderContext) {
      if (!applyStaticVisibility(mark, line)) return
      const scale = context.scales[mark.scale]
      const region = context.plot
      const key = [mark, ...scaleKey(scale), region.x, region.y, region.width, region.height]
      if (!geometryKey.changed(key)) return
      styleKey.clear()
      const position = scale.project(mark.value)
      if (context.direction(mark.scale) === 'x') {
        line.setAttribute('x1', String(position))
        line.setAttribute('x2', String(position))
        line.setAttribute('y1', String(region.y))
        line.setAttribute('y2', String(region.y + region.height))
      } else {
        line.setAttribute('x1', String(region.x))
        line.setAttribute('x2', String(region.x + region.width))
        line.setAttribute('y1', String(position))
        line.setAttribute('y2', String(position))
      }
    },
    style(mark: RuleMark, tokens: ThemeTokens) {
      if (!styleKey.changed([mark, mark.stroke, mark.strokeWidth, tokens.accent])) return
      line.setAttribute('stroke', mark.stroke ?? accent(tokens))
      line.setAttribute('stroke-width', String(mark.strokeWidth))
    },
    destroy() {
      line.remove()
    },
  }
}

export const ruleDefinition: MarkDefinition<RuleMark> = {
  name: 'rule',
  is: isRuleMark,
  validate(mark, { scales, coordinateSystem, direction }) {
    if (coordinateSystem !== 'cartesian') throw new Error('rule() supports cartesian plots only.')
    const scale = scales[mark.scale]
    if (!scale) throw new Error(`rule "${mark.id ?? ''}" references a missing scale.`)
    if (scale.kind !== 'linear' && scale.kind !== 'time') {
      throw new Error(`rule "${mark.id ?? ''}" requires a continuous linear or time scale.`)
    }
    direction(mark.scale)
  },
  legend: (mark, tokens) =>
    staticLegend(mark, {
      type: 'rule',
      stroke: mark.stroke ?? accent(tokens),
      strokeWidth: mark.strokeWidth,
    }),
  // Rules annotate a scale but never contribute to its autoscaled domain.
  extents() {},
  createRenderer: createRuleRenderer,
  track: (mark) => isStaticMarkVisible(mark),
}

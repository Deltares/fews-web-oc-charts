import type { ThemeTokens } from '../theme/theme.js'
import {
  barEndpoints,
  barLayers,
  isBarMark,
  validateBarScales,
  validateBarUpdates,
  type BarMark,
} from './bar.js'
import { barExtent } from './bar-geometry.js'
import { renderBars, styleBars } from './render-bars.js'
import { clearCompositeCanvas } from './render-composite-canvas.js'
import { svgElement } from './render-axes.js'
import {
  createKeyCache,
  extentWindow,
  scaleKey,
  setMarkId,
  type MarkDefinition,
  type MarkRenderContext,
  type MarkRenderer,
} from './mark-definition.js'
import { compositeLegend } from './composite-legend.js'

export function createBarRenderer(kind = 'bar'): MarkRenderer<BarMark> {
  const group = svgElement('g', { 'data-mark': kind })
  const geometryKey = createKeyCache()
  const styleKey = createKeyCache()
  return {
    mount(layer, mark) {
      setMarkId(group, mark.id)
      layer.append(group)
    },
    geometry(mark: BarMark, context: MarkRenderContext) {
      const config = mark.options.get().resolved
      const key = [
        mark,
        barEndpoints(mark),
        config.renderer,
        ...(config.renderer === 'canvas' ? [window.devicePixelRatio] : []),
        config.visible,
        config.orientation,
        config.scales.x,
        config.scales.y,
        config.interval?.start,
        config.interval?.end,
        config.width,
        config.groupPadding,
        config.layerPadding,
        ...scaleKey(context.scales[mark.x]),
        ...scaleKey(context.scales[mark.y]),
      ]
      if (!geometryKey.changed(key)) return
      styleKey.clear()
      renderBars(group, mark, context.scales)
    },
    style(mark: BarMark, tokens: ThemeTokens) {
      const canvas = mark.options.get().resolved.renderer === 'canvas'
      if (!styleKey.changed([mark, mark.options.version, canvas ? tokens : tokens.accent])) return
      styleBars(group, mark, tokens.accent)
    },
    destroy() {
      clearCompositeCanvas(group)
      group.remove()
    },
  }
}

export const barDefinition: MarkDefinition<BarMark> = {
  name: 'bar',
  is: isBarMark,
  legend: (mark, tokens) =>
    compositeLegend(
      'bar',
      () => mark.options.get().resolved,
      () => barLayers(mark.options.get().resolved),
      (visible, layers) =>
        mark.options.get().resolved.layers
          ? mark.update({ visible, layers })
          : mark.update({ visible: visible && layers[0]?.visible !== false }),
      tokens.accent,
    ),
  validate(mark, { scales, coordinateSystem, direction }) {
    if (coordinateSystem !== 'cartesian') throw new Error('bar() supports cartesian plots only.')
    validateBarScales(mark.data, mark.options.get().resolved, scales)
    if (direction(mark.x) !== 'x' || direction(mark.y) !== 'y') {
      throw new Error('Bar scale directions do not match its orientation.')
    }
  },
  extents(mark, context) {
    const options = mark.options.get().resolved
    const coordinate =
      options.scales.x === context.scale
        ? 'category'
        : options.scales.y === context.scale
          ? 'value'
          : undefined
    if (!coordinate) return
    const opposite = coordinate === 'category' ? options.scales.y : options.scales.x
    barExtent(mark, coordinate, extentWindow(context, opposite))?.forEach(context.add)
  },
  createRenderer: createBarRenderer,
  track(mark) {
    mark.options.get()
    const _version = mark.data.version
  },
  validateUpdates: (mark, context) =>
    validateBarUpdates(mark, (candidate) => {
      const { scales, direction } = context()
      validateBarScales(mark.data, candidate, scales)
      const vertical = candidate.orientation === 'vertical'
      const x = vertical ? candidate.scales.x : candidate.scales.y
      const y = vertical ? candidate.scales.y : candidate.scales.x
      if (direction(x) !== 'x' || direction(y) !== 'y') {
        throw new Error('Bar scale directions do not match its orientation.')
      }
    }),
}

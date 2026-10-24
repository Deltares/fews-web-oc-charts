import type { ThemeTokens } from '../../../theme/theme.js'
import {
  isStackedAreaMark,
  stackedAreaEndpoints,
  validateStackedAreaScales,
  validateStackedAreaUpdates,
  type StackedAreaMark,
} from './stacked-area.js'
import { renderStackedAreas, stackedAreaExtent, styleStackedAreas } from './render-stacked-areas.js'
import { clearCompositeCanvas } from '../../rendering/render-composite-canvas.js'
import { svgElement } from '../../axes/render-axes.js'
import {
  createKeyCache,
  extentWindow,
  scaleKey,
  setMarkId,
  type MarkDefinition,
  type MarkRenderContext,
  type MarkRenderer,
} from '../mark-definition.js'
import { compositeLegend } from '../composite-legend.js'
import { compositeHits } from '../../interaction/composite-hit-testing.js'

function createStackedAreaRenderer(): MarkRenderer<StackedAreaMark> {
  const group = svgElement('g', { 'data-mark': 'stacked-area' })
  const geometryKey = createKeyCache()
  const styleKey = createKeyCache()
  return {
    mount(layer, mark) {
      setMarkId(group, mark.id)
      layer.append(group)
    },
    geometry(mark: StackedAreaMark, context: MarkRenderContext) {
      const config = mark.options.get().resolved
      const key = [
        mark,
        stackedAreaEndpoints(mark),
        config.renderer,
        ...(config.renderer === 'canvas' ? [window.devicePixelRatio] : []),
        config.visible,
        config.curve,
        ...scaleKey(context.scales[mark.x]),
        ...scaleKey(context.scales[mark.y]),
      ]
      if (!geometryKey.changed(key)) return
      styleKey.clear()
      renderStackedAreas(group, mark, context.scales)
    },
    style(mark: StackedAreaMark, tokens: ThemeTokens) {
      const canvas = mark.options.get().resolved.renderer === 'canvas'
      if (!styleKey.changed([mark, mark.options.version, canvas ? tokens : tokens.accent])) return
      styleStackedAreas(group, mark, tokens.accent)
    },
    destroy() {
      clearCompositeCanvas(group)
      group.remove()
    },
  }
}

function validateDirections(
  scales: { readonly x: string; readonly y: string },
  direction: (scale: string) => string,
) {
  if (direction(scales.x) !== 'x' || direction(scales.y) !== 'y') {
    throw new Error('Stacked area scales require x and y directions respectively.')
  }
}

export const stackedAreaDefinition: MarkDefinition<StackedAreaMark> = {
  name: 'stackedArea',
  is: isStackedAreaMark,
  hits: (mark, { scales, point, axis, plot, pathContext }) =>
    compositeHits(mark, scales, point, axis, plot, pathContext()),
  legend: (mark, tokens) =>
    compositeLegend(
      'area',
      () => mark.options.get().resolved,
      () => mark.options.get().resolved.layers,
      (visible, layers) => mark.update({ visible, layers }),
      tokens.accent,
    ),
  validate(mark, { scales, coordinateSystem, direction }) {
    if (coordinateSystem !== 'cartesian') {
      throw new Error('stackedArea() supports cartesian plots only.')
    }
    validateStackedAreaScales(mark.options.get().resolved, scales)
    validateDirections(mark, direction)
  },
  extents(mark, context) {
    const coordinate = mark.x === context.scale ? 'x' : mark.y === context.scale ? 'y' : undefined
    if (!coordinate) return
    const window = extentWindow(context, coordinate === 'x' ? mark.y : mark.x)
    stackedAreaExtent(mark, coordinate, window)?.forEach(context.add)
  },
  createRenderer: createStackedAreaRenderer,
  track(mark) {
    mark.options.get()
    const _version = mark.data.version
  },
  validateUpdates: (mark, context) =>
    validateStackedAreaUpdates(mark, (candidate) => {
      const { scales, direction } = context()
      validateStackedAreaScales(candidate, scales)
      validateDirections(candidate.scales, direction)
    }),
}

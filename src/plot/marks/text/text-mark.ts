import type { ThemeTokens } from '../../../theme/theme.js'
import {
  isTextMark,
  isValidTextCoordinate,
  validateTextValuesForScale,
  type TextMark,
} from './text.js'
import { svgElement } from '../../axes/render-axes.js'
import {
  accent,
  createKeyCache,
  extentWindow,
  scaleKey,
  setMarkId,
  withinWindow,
  type MarkDefinition,
  type MarkRenderContext,
  type MarkRenderer,
} from '../mark-definition.js'

function createTextRenderer(): MarkRenderer<TextMark> {
  const group = svgElement('g', { 'data-mark': 'text' })
  const geometryKey = createKeyCache()
  const styleKey = createKeyCache()
  return {
    mount(layer, mark) {
      setMarkId(group, mark.id)
      layer.append(group)
    },
    geometry(mark: TextMark, context: MarkRenderContext) {
      const xScale = context.scales[mark.x]
      const yScale = context.scales[mark.y]
      if (
        !geometryKey.changed([
          mark,
          context.localCoordinates,
          ...scaleKey(xScale),
          ...scaleKey(yScale),
        ])
      )
        return
      styleKey.clear()
      for (let index = 0; index < mark.textValues.length; index += 1) {
        let label = group.children[index] as SVGTextElement | undefined
        if (!label) {
          label = svgElement('text', { 'data-mark': 'text-label' })
          group.append(label)
        }
        const x = mark.xValues[index]
        const y = mark.yValues[index]
        const value = mark.textValues[index]
        if (!isValidTextCoordinate(x) || !isValidTextCoordinate(y) || value == null) {
          label.setAttribute('display', 'none')
          label.textContent = ''
          continue
        }
        const px = xScale.project(x)
        const py = yScale.project(y)
        label.removeAttribute('display')
        label.setAttribute('x', String(context.localCoordinates ? 0 : px))
        label.setAttribute('y', String(context.localCoordinates ? 0 : py))
        label.setAttribute('dx', String(mark.dx))
        label.setAttribute('dy', String(mark.dy))
        if (context.localCoordinates) {
          label.setAttribute(
            'transform',
            `translate(${px},${py})${mark.angle ? ` rotate(${mark.angle})` : ''}`,
          )
        } else if (mark.angle) label.setAttribute('transform', `rotate(${mark.angle} ${px} ${py})`)
        else label.removeAttribute('transform')
        label.dataset.index = String(index)
        label.textContent = String(value)
      }
      while (group.children.length > mark.textValues.length) group.lastElementChild?.remove()
    },
    style(mark: TextMark, tokens: ThemeTokens) {
      const key = [mark, tokens.accent, tokens.fontFamily, tokens.fontSize]
      if (!styleKey.changed(key)) return
      for (const label of group.children) {
        label.setAttribute('fill', mark.fill ?? accent(tokens))
        label.setAttribute(
          'font-family',
          mark.fontFamily ?? `var(--fews-chart-font-family, ${tokens.fontFamily})`,
        )
        label.setAttribute('font-size', `${mark.fontSize ?? tokens.fontSize}px`)
        if (mark.fontWeight === undefined) label.removeAttribute('font-weight')
        else label.setAttribute('font-weight', String(mark.fontWeight))
        label.setAttribute('text-anchor', mark.textAnchor)
        label.setAttribute('dominant-baseline', mark.dominantBaseline)
      }
    },
    destroy() {
      group.remove()
    },
  }
}

export const textDefinition: MarkDefinition<TextMark> = {
  name: 'text',
  is: isTextMark,
  validate(mark, { scales, coordinateSystem, direction }) {
    if (coordinateSystem !== 'cartesian') throw new Error('text() supports cartesian plots only.')
    for (const coordinate of ['x', 'y'] as const) {
      const scale = scales[mark[coordinate]]
      if (!scale) {
        throw new Error(`text "${mark.id ?? ''}" references a missing ${coordinate} scale.`)
      }
      if (direction(mark[coordinate]) !== coordinate) {
        throw new Error(`text "${mark.id ?? ''}" requires a ${coordinate}-direction scale.`)
      }
      validateTextValuesForScale(mark, coordinate, scale.kind)
    }
  },
  extents(mark, context) {
    const coordinate = mark.x === context.scale ? 'x' : mark.y === context.scale ? 'y' : undefined
    if (!coordinate) return
    const window = extentWindow(context, coordinate === 'x' ? mark.y : mark.x)
    for (let index = 0; index < mark.textValues.length; index += 1) {
      const x = mark.xValues[index]
      const y = mark.yValues[index]
      if (
        mark.textValues[index] == null ||
        !isValidTextCoordinate(x) ||
        !isValidTextCoordinate(y)
      ) {
        continue
      }
      if (window && !withinWindow(coordinate === 'x' ? y : x, window)) continue
      context.add(coordinate === 'x' ? x : y)
    }
  },
  createRenderer: createTextRenderer,
}

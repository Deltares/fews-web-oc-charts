import { arc } from 'd3'
import type { ThemeTokens } from '../theme/theme.js'
import { isBandMark, type BandMark } from './band.js'
import { svgElement } from './render-axes.js'
import {
  accent,
  createKeyCache,
  extentWindow,
  scaleKey,
  setMarkId,
  type MarkDefinition,
  type MarkRenderContext,
  type MarkRenderer,
} from './mark-definition.js'

function createBandRenderer(): MarkRenderer<BandMark> {
  const group = svgElement('g', { 'data-mark': 'band' })
  const geometryKey = createKeyCache()
  const styleKey = createKeyCache()
  return {
    mount(layer, mark) {
      setMarkId(group, mark.id)
      layer.append(group)
    },
    geometry(mark: BandMark, context: MarkRenderContext) {
      const xScale = context.scales[mark.x]
      const yScale = context.scales[mark.y]
      const polar = context.coordinateSystem === 'polar'
      const region = context.plot
      const key = [
        mark,
        ...scaleKey(xScale),
        ...scaleKey(yScale),
        ...(polar ? [region.x, region.y, region.width, region.height] : []),
      ]
      if (!geometryKey.changed(key)) return
      styleKey.clear()
      if (polar) {
        group.setAttribute(
          'transform',
          `translate(${region.x + region.width / 2},${region.y + region.height / 2})`,
        )
      } else {
        group.removeAttribute('transform')
      }
      let rangeIndex = 0
      for (let index = 0; index < mark.xValues.length; index += 1) {
        const xRange = mark.xValues[index]
        const yRange = mark.yValues[index]
        if (!xRange || !yRange) continue
        if (polar) {
          let path = group.children[rangeIndex] as SVGPathElement | undefined
          if (!path) {
            path = svgElement('path', { 'data-mark': 'band-range', stroke: 'none' })
            group.append(path)
          }
          const angular = xScale.scale.options.get().resolved
          const direction = angular.direction === 'anticlockwise' ? -1 : 1
          const intercept = angular.intercept ?? 0
          const d =
            arc<null>()
              .innerRadius(Math.min(yScale.project(yRange[0]), yScale.project(yRange[1])))
              .outerRadius(Math.max(yScale.project(yRange[0]), yScale.project(yRange[1])))
              .startAngle(intercept + direction * xScale.project(xRange[0]))
              .endAngle(intercept + direction * xScale.project(xRange[1]))(null) ?? ''
          path.setAttribute('d', d)
        } else {
          let rect = group.children[rangeIndex] as SVGRectElement | undefined
          if (!rect) {
            rect = svgElement('rect', { 'data-mark': 'band-range', stroke: 'none' })
            group.append(rect)
          }
          const x0 = xScale.project(xRange[0])
          const x1 = xScale.project(xRange[1])
          const y0 = yScale.project(yRange[0])
          const y1 = yScale.project(yRange[1])
          rect.setAttribute('x', String(Math.min(x0, x1)))
          rect.setAttribute('y', String(Math.min(y0, y1)))
          rect.setAttribute('width', String(Math.abs(x1 - x0)))
          rect.setAttribute('height', String(Math.abs(y1 - y0)))
        }
        rangeIndex += 1
      }
      while (group.children.length > rangeIndex) group.lastElementChild?.remove()
    },
    style(mark: BandMark, tokens: ThemeTokens) {
      if (!styleKey.changed([mark, mark.fill, mark.opacity, tokens.accent])) return
      group.setAttribute('fill', mark.fill ?? accent(tokens))
      group.setAttribute('fill-opacity', String(mark.opacity))
    },
    destroy() {
      group.remove()
    },
  }
}

export const bandDefinition: MarkDefinition<BandMark> = {
  name: 'band',
  is: isBandMark,
  validate(mark, { scales, coordinateSystem, direction }) {
    if (!Object.hasOwn(scales, mark.x) || !Object.hasOwn(scales, mark.y)) {
      throw new Error(`band "${mark.id ?? ''}" references a missing x or y scale.`)
    }
    const xDirection = coordinateSystem === 'polar' ? 'angular' : 'x'
    const yDirection = coordinateSystem === 'polar' ? 'radial' : 'y'
    if (direction(mark.x) !== xDirection) {
      throw new Error(`band "${mark.id ?? ''}" requires a ${xDirection}-direction scale.`)
    }
    if (direction(mark.y) !== yDirection) {
      throw new Error(`band "${mark.id ?? ''}" requires a ${yDirection}-direction scale.`)
    }
    if (scales[mark.x].kind === 'band' || scales[mark.y].kind === 'band') {
      throw new Error(`band "${mark.id ?? ''}" requires numeric or time scales.`)
    }
  },
  extents(mark, context) {
    const coordinate = mark.x === context.scale ? 'x' : mark.y === context.scale ? 'y' : undefined
    if (!coordinate) return
    const window = extentWindow(context, coordinate === 'x' ? mark.y : mark.x)
    for (let index = 0; index < mark.xValues.length; index += 1) {
      const x = mark.xValues[index]
      const y = mark.yValues[index]
      if (!x || !y) continue
      const extent = coordinate === 'x' ? x : y
      const opposite = coordinate === 'x' ? y : x
      if (window && (opposite[1] < Number(window[0]) || opposite[0] > Number(window[1]))) continue
      context.add(extent[0])
      context.add(extent[1])
    }
  },
  createRenderer: createBandRenderer,
}

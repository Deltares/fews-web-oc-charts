import { arc, area, curveLinear, curveBasis, curveStep, curveStepBefore, curveStepAfter } from 'd3'
import type { ThemeTokens } from '../../../theme/theme.js'
import { isBandMark, validateBandUpdates, type BandMark, type BandRange } from './band.js'
import { svgElement } from '../../axes/render-axes.js'
import {
  accent,
  createKeyCache,
  extentWindow,
  scaleKey,
  setMarkId,
  type MarkDefinition,
  type MarkRenderContext,
  type MarkRenderer,
} from '../mark-definition.js'
import { applyStaticVisibility, isStaticMarkVisible, staticLegend } from '../static-legend.js'

function polarRangePath(
  xRange: BandRange,
  yRange: BandRange,
  mark: BandMark,
  context: MarkRenderContext,
) {
  const xScale = context.scales[mark.x]
  const yScale = context.scales[mark.y]
  const angular = xScale.scale.options.get().resolved
  const direction = angular.direction === 'anticlockwise' ? -1 : 1
  const intercept = angular.intercept ?? 0
  return (
    arc<null>()
      .innerRadius(Math.min(yScale.project(yRange[0]), yScale.project(yRange[1])))
      .outerRadius(Math.max(yScale.project(yRange[0]), yScale.project(yRange[1])))
      .startAngle(
        context.localCoordinates
          ? xScale.project(xRange[0])
          : intercept + direction * xScale.project(xRange[0]),
      )
      .endAngle(
        context.localCoordinates
          ? xScale.project(xRange[1])
          : intercept + direction * xScale.project(xRange[1]),
      )(null) ?? ''
  )
}

function renderBandRanges(group: SVGGElement, mark: BandMark, context: MarkRenderContext) {
  const xScale = context.scales[mark.x]
  const yScale = context.scales[mark.y]
  const polar = context.coordinateSystem === 'polar'
  const tag = polar ? 'path' : 'rect'
  const first = group.firstElementChild
  if (
    first &&
    (first.localName !== tag ||
      !(first instanceof SVGElement) ||
      first.dataset.mark !== 'band-range')
  ) {
    group.replaceChildren()
  }
  let rangeIndex = 0
  for (let index = 0; index < mark.xValues.length; index += 1) {
    const xRange = mark.xValues[index]
    const yRange = mark.yValues[index]
    if (!xRange || !yRange) continue
    let element = group.children[rangeIndex]
    if (!element) {
      element = svgElement(tag, { 'data-mark': 'band-range', stroke: 'none' })
      group.append(element)
    }
    if (polar) {
      element.setAttribute('d', polarRangePath(xRange, yRange, mark, context))
    } else {
      const x0 = xScale.project(xRange[0])
      const x1 = xScale.project(xRange[1])
      const y0 = yScale.project(yRange[0])
      const y1 = yScale.project(yRange[1])
      element.setAttribute('x', String(Math.min(x0, x1)))
      element.setAttribute('y', String(Math.min(y0, y1)))
      element.setAttribute('width', String(Math.abs(x1 - x0)))
      element.setAttribute('height', String(Math.abs(y1 - y0)))
    }
    rangeIndex += 1
  }
  while (group.children.length > rangeIndex) group.lastElementChild?.remove()
}

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
      if (!applyStaticVisibility(mark, group)) return
      const xScale = context.scales[mark.x]
      const yScale = context.scales[mark.y]
      const polar = context.coordinateSystem === 'polar'
      const region = context.plot
      const key = [
        mark,
        mark.xValues,
        mark.yValues,
        mark.curve,
        context.localCoordinates,
        ...scaleKey(xScale),
        ...scaleKey(yScale),
        ...(polar ? [region.x, region.y, region.width, region.height] : []),
      ]
      if (!geometryKey.changed(key)) return
      styleKey.clear()
      if (polar) {
        const angular = xScale.scale.options.get().resolved
        const direction = angular.direction === 'anticlockwise' ? -1 : 1
        const localTransform = context.localCoordinates
          ? ` rotate(${((angular.intercept ?? 0) * 180) / Math.PI}) scale(${direction},1)`
          : ''
        group.setAttribute(
          'transform',
          `translate(${region.x + region.width / 2},${region.y + region.height / 2})${localTransform}`,
        )
      } else {
        group.removeAttribute('transform')
      }
      if (mark.curve) {
        let path = group.querySelector<SVGPathElement>('[data-mark="band-area"]')
        if (!path) {
          path = svgElement('path', { 'data-mark': 'band-area', stroke: 'none' })
          group.replaceChildren(path)
        }
        const curve = {
          linear: curveLinear,
          basis: curveBasis,
          step: curveStep,
          'step-before': curveStepBefore,
          'step-after': curveStepAfter,
        }[mark.curve]
        const samples = Array.from({ length: mark.xValues.length }, (_, index) => index)
        const generator = area<number>()
          .defined((index) => Boolean(mark.xValues[index] && mark.yValues[index]))
          .x((index) => xScale.project(mark.xValues[index]![0]))
          .y0((index) => yScale.project(mark.yValues[index]![0]))
          .y1((index) => yScale.project(mark.yValues[index]![1]))
          .curve(curve)
        path.setAttribute('d', generator(samples) ?? '')
        return
      }
      renderBandRanges(group, mark, context)
    },
    style(mark: BandMark, tokens: ThemeTokens) {
      if (
        !styleKey.changed([
          mark,
          mark.fill,
          mark.opacity,
          mark.curve,
          mark.shapeRendering,
          tokens.accent,
        ])
      )
        return
      group.setAttribute('fill', mark.fill ?? accent(tokens))
      group.setAttribute('fill-opacity', String(mark.curve ? 1 : mark.opacity))
      group.setAttribute('opacity', String(mark.curve ? mark.opacity : 1))
      if (mark.shapeRendering) group.setAttribute('shape-rendering', mark.shapeRendering)
      else group.removeAttribute('shape-rendering')
    },
    destroy() {
      group.remove()
    },
  }
}

export const bandDefinition: MarkDefinition<BandMark> = {
  name: 'band',
  is: isBandMark,
  validate(mark, context) {
    const { scales, coordinateSystem } = context
    if (mark.curve && coordinateSystem !== 'cartesian') {
      throw new Error('Curved bands support cartesian plots only.')
    }
    if (!Object.hasOwn(scales, mark.x) || !Object.hasOwn(scales, mark.y)) {
      throw new Error(`band "${mark.id ?? ''}" references a missing x or y scale.`)
    }
    const xDirection = coordinateSystem === 'polar' ? 'angular' : 'x'
    const yDirection = coordinateSystem === 'polar' ? 'radial' : 'y'
    if (context.direction(mark.x) !== xDirection) {
      throw new Error(`band "${mark.id ?? ''}" requires a ${xDirection}-direction scale.`)
    }
    if (context.direction(mark.y) !== yDirection) {
      throw new Error(`band "${mark.id ?? ''}" requires a ${yDirection}-direction scale.`)
    }
    if (scales[mark.x].kind === 'band' || scales[mark.y].kind === 'band') {
      throw new Error(`band "${mark.id ?? ''}" requires numeric or time scales.`)
    }
  },
  legend: (mark, tokens) =>
    staticLegend(mark, { type: 'area', fill: mark.fill ?? accent(tokens), opacity: mark.opacity }),
  track(mark) {
    mark.xValues
    isStaticMarkVisible(mark)
  },
  validateUpdates: (mark, context) =>
    validateBandUpdates(mark, (candidate) => bandDefinition.validate(candidate, context())),
  extents(mark, context) {
    if (!isStaticMarkVisible(mark)) return
    let coordinate: 'x' | 'y' | undefined
    if (mark.x === context.scale) coordinate = 'x'
    else if (mark.y === context.scale) coordinate = 'y'
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

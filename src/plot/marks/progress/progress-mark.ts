import { arc } from 'd3'
import type { ThemeTokens } from '../../../theme/theme.js'
import { isProgressMark, type ProgressMark } from './progress.js'
import {
  accent,
  createKeyCache,
  extentWindow,
  scaleKey,
  setMarkId,
  type MarkDefinition,
  type MarkExtentContext,
  type MarkRenderContext,
  type MarkRenderer,
} from '../mark-definition.js'
import { svgElement } from '../../axes/render-axes.js'

function createProgressRenderer(): MarkRenderer<ProgressMark> {
  const group = svgElement('g', { 'data-mark': 'progress' })
  const geometryKey = createKeyCache()
  const styleKey = createKeyCache()
  return {
    mount(layer, mark) {
      setMarkId(group, mark.id)
      layer.append(group)
    },
    geometry(mark, context: MarkRenderContext) {
      const angular = context.scales[mark.x]
      const radial = context.scales[mark.y]
      const region = context.plot
      if (
        !geometryKey.changed([
          mark,
          ...scaleKey(angular),
          ...scaleKey(radial),
          region.x,
          region.y,
          region.width,
          region.height,
        ])
      )
        return
      styleKey.clear()
      group.setAttribute(
        'transform',
        `translate(${region.x + region.width / 2},${region.y + region.height / 2})`,
      )
      const angularOptions = angular.scale.options.get().resolved
      const direction = angularOptions.direction === 'anticlockwise' ? -1 : 1
      const intercept = angularOptions.intercept ?? 0
      let pathIndex = 0
      for (let index = 0; index < mark.xValues.length; index += 1) {
        const angles = mark.xValues[index]
        const radius = mark.yValues[index]
        if (!angles || radius === null || radius === undefined) continue
        const center = radial.project(radius)
        const innerRadius = Math.max(0, center - mark.thickness / 2)
        const outerRadius = center + mark.thickness / 2
        const path =
          (group.children[pathIndex] as SVGPathElement | undefined) ??
          svgElement('path', { 'data-mark': 'progress-arc', stroke: 'none' })
        if (!path.parentNode) group.append(path)
        const d =
          arc<null>()
            .innerRadius(innerRadius)
            .outerRadius(outerRadius)
            .cornerRadius(mark.thickness / 2)
            .startAngle(intercept + direction * angular.project(angles[0]))
            .endAngle(intercept + direction * angular.project(angles[1]))(null) ?? ''
        path.setAttribute('d', d)
        path.dataset.index = String(index)
        pathIndex += 1
      }
      while (group.children.length > pathIndex) group.lastElementChild?.remove()
    },
    style(mark: ProgressMark, tokens: ThemeTokens) {
      if (!styleKey.changed([mark, mark.fill, mark.opacity, tokens.accent])) return
      group.setAttribute('fill', mark.fill ?? accent(tokens))
      group.setAttribute('fill-opacity', String(mark.opacity))
    },
    destroy() {
      group.remove()
    },
  }
}

function progressExtents(mark: ProgressMark, context: MarkExtentContext) {
  const angular = mark.x === context.scale
  if (!angular && mark.y !== context.scale) return
  const window = extentWindow(context, angular ? mark.y : mark.x)
  for (let index = 0; index < mark.xValues.length; index += 1) {
    const angles = mark.xValues[index]
    const radius = mark.yValues[index]
    if (!angles || radius === null || radius === undefined) continue
    if (
      window &&
      (angular
        ? radius < Number(window[0]) || radius > Number(window[1])
        : angles[1] < Number(window[0]) || angles[0] > Number(window[1]))
    ) {
      continue
    }
    if (angular) {
      context.add(angles[0])
      context.add(angles[1])
    } else {
      context.add(radius)
    }
  }
}

export const progressDefinition: MarkDefinition<ProgressMark> = {
  name: 'progress',
  is(value) {
    return isProgressMark(value)
  },
  validate(mark, context) {
    if (context.coordinateSystem !== 'polar')
      throw new Error('progress() supports polar plots only.')
    if (!Object.hasOwn(context.scales, mark.x) || !Object.hasOwn(context.scales, mark.y)) {
      throw new Error(`progress "${mark.id ?? ''}" references a missing x or y scale.`)
    }
    if (
      context.scales[mark.x].kind !== 'angular' ||
      context.scales[mark.y].kind !== 'radial' ||
      context.direction(mark.x) !== 'angular' ||
      context.direction(mark.y) !== 'radial'
    ) {
      throw new Error(`progress "${mark.id ?? ''}" requires angular and radial scales.`)
    }
  },
  extents(mark, context) {
    progressExtents(mark, context)
  },
  createRenderer: createProgressRenderer,
}

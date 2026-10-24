import type { ThemeTokens } from '../../../theme/theme.js'
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
  type MarkValidationContext,
} from '../mark-definition.js'
import { isArrowsMark, type ArrowsMark, type VectorValue } from './arrows.js'
import { isDirectionMark, type DirectionMark } from './direction.js'
import { projectPolarPoint } from '../../coordinates/polar-geometry.js'
import { svgElement } from '../../axes/render-axes.js'

type VectorMark = ArrowsMark | DirectionMark

function valid(value: VectorValue): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function project(context: MarkRenderContext, mark: VectorMark, x: number, y: number) {
  if (context.coordinateSystem === 'polar') {
    return projectPolarPoint(context.scales[mark.x], context.scales[mark.y], context.plot, x, y)
  }
  return { x: context.scales[mark.x].project(x), y: context.scales[mark.y].project(y) }
}

function setArrowGeometry(
  shaft: SVGLineElement,
  head: SVGPathElement,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  headSize: number,
) {
  const dx = endX - startX
  const dy = endY - startY
  const length = Math.hypot(dx, dy)
  const unitX = length === 0 ? 0 : dx / length
  const unitY = length === 0 ? -1 : dy / length
  const headLength = Math.min(headSize, length)
  const halfWidth = headLength * 0.35
  const baseX = endX - unitX * headLength
  const baseY = endY - unitY * headLength
  const perpX = -unitY * halfWidth
  const perpY = unitX * halfWidth
  shaft.setAttribute('x1', String(startX))
  shaft.setAttribute('y1', String(startY))
  shaft.setAttribute('x2', String(baseX))
  shaft.setAttribute('y2', String(baseY))
  head.setAttribute(
    'd',
    `M${endX},${endY}L${baseX + perpX},${baseY + perpY}L${baseX - perpX},${baseY - perpY}Z`,
  )
}

function createVectorRenderer<M extends VectorMark>(
  markType: 'arrows' | 'direction',
): MarkRenderer<M> {
  const group = svgElement('g', { 'data-mark': markType })
  const geometryKey = createKeyCache()
  const styleKey = createKeyCache()

  return {
    mount(layer, mark) {
      setMarkId(group, mark.id)
      layer.append(group)
    },
    geometry(mark, context) {
      const xScale = context.scales[mark.x]
      const yScale = context.scales[mark.y]
      const key = [
        mark,
        ...scaleKey(xScale),
        ...scaleKey(yScale),
        ...(context.coordinateSystem === 'polar'
          ? [context.plot.x, context.plot.y, context.plot.width, context.plot.height]
          : []),
      ]
      if (!geometryKey.changed(key)) return
      styleKey.clear()
      const count = mark.xValues.length
      for (let index = 0; index < count; index += 1) {
        let item = group.children[index] as SVGGElement | undefined
        if (!item) {
          item = svgElement('g', { 'data-index': index })
          item.append(
            svgElement('line', { 'data-mark': `${markType}-shaft`, 'stroke-linecap': 'round' }),
            svgElement('path', { 'data-mark': `${markType}-head` }),
          )
          group.append(item)
        }
        const x0 = mark.xValues[index]
        const y0 = mark.yValues[index]
        const x1 = isArrowsMark(mark) ? mark.xEndValues[index] : x0
        const y1 = isArrowsMark(mark) ? mark.yEndValues[index] : y0
        const directionValue = isDirectionMark(mark) ? mark.directionValues[index] : undefined
        if (!valid(x0) || !valid(y0) || !valid(x1) || !valid(y1)) {
          item.setAttribute('display', 'none')
          continue
        }
        item.removeAttribute('display')
        const start = project(context, mark, x0, y0)
        let end = project(context, mark, x1, y1)
        let headSize: number
        if (isDirectionMark(mark)) {
          if (index % mark.every !== 0) {
            item.setAttribute('display', 'none')
            continue
          }
          if (!valid(directionValue)) {
            item.setAttribute('display', 'none')
            continue
          }
          const bearing = ((directionValue + 180) * Math.PI) / 180
          end = {
            x: start.x + mark.size * Math.sin(bearing),
            y: start.y - mark.size * Math.cos(bearing),
          }
          headSize = mark.size * 0.4
        } else {
          headSize = mark.headSize
        }
        setArrowGeometry(
          item.children[0] as SVGLineElement,
          item.children[1] as SVGPathElement,
          start.x,
          start.y,
          end.x,
          end.y,
          headSize,
        )
      }
      while (group.children.length > count) group.lastElementChild?.remove()
    },
    style(mark, tokens: ThemeTokens) {
      if (!styleKey.changed([mark, mark.color, mark.strokeWidth, tokens.accent])) return
      const color = mark.color ?? accent(tokens)
      for (const item of group.children) {
        const shaft = item.children[0] as SVGLineElement
        const head = item.children[1] as SVGPathElement
        shaft.setAttribute('stroke', color)
        shaft.setAttribute('stroke-width', String(mark.strokeWidth))
        head.setAttribute('fill', color)
      }
    },
    destroy() {
      group.remove()
    },
  }
}

function vectorExtents(mark: VectorMark, context: MarkExtentContext) {
  const coordinate = mark.x === context.scale ? 'x' : mark.y === context.scale ? 'y' : undefined
  if (!coordinate) return
  const window = extentWindow(context, coordinate === 'x' ? mark.y : mark.x)
  const length = mark.xValues.length
  for (let index = 0; index < length; index += 1) {
    if (isDirectionMark(mark) && index % mark.every !== 0) continue
    const x0 = mark.xValues[index]
    const y0 = mark.yValues[index]
    const x1 = isArrowsMark(mark) ? mark.xEndValues[index] : x0
    const y1 = isArrowsMark(mark) ? mark.yEndValues[index] : y0
    if (!valid(x0) || !valid(y0) || !valid(x1) || !valid(y1)) continue
    if (isDirectionMark(mark) && !valid(mark.directionValues[index])) continue
    const oppositeValues = coordinate === 'x' ? [y0, y1] : [x0, x1]
    if (
      window &&
      (Math.max(...oppositeValues) < Number(window[0]) ||
        Math.min(...oppositeValues) > Number(window[1]))
    ) {
      continue
    }
    context.add(coordinate === 'x' ? x0 : y0)
    if (isArrowsMark(mark)) context.add(coordinate === 'x' ? x1 : y1)
  }
}

function validateVectorMark(mark: VectorMark, context: MarkValidationContext) {
  const { coordinateSystem, scales, direction } = context
  if (!Object.hasOwn(scales, mark.x) || !Object.hasOwn(scales, mark.y)) {
    throw new Error(`${markTypeName(mark)} "${mark.id ?? ''}" references a missing x or y scale.`)
  }
  const xScale = scales[mark.x]
  const yScale = scales[mark.y]
  const xOrientation = coordinateSystem === 'polar' ? 'angular' : 'x'
  const yOrientation = coordinateSystem === 'polar' ? 'radial' : 'y'
  if (direction(mark.x) !== xOrientation || direction(mark.y) !== yOrientation) {
    throw new Error(
      `${markTypeName(mark)} "${mark.id ?? ''}" requires ${xOrientation}/${yOrientation} scales.`,
    )
  }
  const expectedKinds =
    coordinateSystem === 'polar'
      ? xScale.kind === 'angular' && yScale.kind === 'radial'
      : ['linear', 'time', 'degrees'].includes(xScale.kind) &&
        ['linear', 'time', 'degrees'].includes(yScale.kind)
  if (!expectedKinds) {
    throw new Error(`${markTypeName(mark)} requires continuous scales for its coordinate system.`)
  }
  if (coordinateSystem === 'polar') {
    const radialValues = isArrowsMark(mark) ? [mark.yValues, mark.yEndValues] : [mark.yValues]
    for (const values of radialValues) {
      for (let index = 0; index < values.length; index += 1) {
        const value = values[index]
        if (valid(value) && value < 0) {
          throw new Error(
            `${markTypeName(mark)} "${mark.id ?? ''}" requires nonnegative radial coordinates.`,
          )
        }
      }
    }
  }
}

function markTypeName(mark: VectorMark) {
  return isArrowsMark(mark) ? 'arrows' : 'direction'
}

export const arrowsDefinition: MarkDefinition<ArrowsMark> = {
  name: 'arrows',
  is: isArrowsMark,
  validate(mark, context) {
    validateVectorMark(mark, context)
  },
  extents: vectorExtents,
  createRenderer: () => createVectorRenderer<ArrowsMark>('arrows'),
}

export const directionDefinition: MarkDefinition<DirectionMark> = {
  name: 'direction',
  is: isDirectionMark,
  validate(mark, context) {
    validateVectorMark(mark, context)
  },
  extents: vectorExtents,
  createRenderer: () => createVectorRenderer<DirectionMark>('direction'),
}

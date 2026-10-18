import type { ThemeTokens } from '../theme/theme.js'
import { isLineMark, validateLineValuesForScale, type LineMark } from './line.js'
import { isSeriesMark, validateSeriesUpdates, type SeriesMark } from './series.js'
import { svgElement } from './render-axes.js'
import {
  accent,
  createKeyCache,
  extentWindow,
  isScaleValue,
  scaleKey,
  setMarkId,
  withinWindow,
  type MarkDefinition,
  type MarkExtentContext,
  type MarkRenderContext,
  type MarkRenderer,
  type MarkValidationContext,
} from './mark-definition.js'

type LineLikeMark = LineMark | SeriesMark

function validateLineLike(mark: LineLikeMark, context: MarkValidationContext, dataBacked: boolean) {
  if (context.coordinateSystem === 'polar') {
    throw new Error('line() marks are supported on cartesian plots only.')
  }
  const { scales } = context
  if (!Object.hasOwn(scales, mark.x) || !Object.hasOwn(scales, mark.y)) {
    throw new Error(`line "${mark.id ?? ''}" references a missing x or y scale.`)
  }
  if (context.direction(mark.x) !== 'x') {
    throw new Error(`line "${mark.id ?? ''}" requires an x-direction scale.`)
  }
  if (context.direction(mark.y) !== 'y') {
    throw new Error(`line "${mark.id ?? ''}" requires a y-direction scale.`)
  }
  if (isLineMark(mark)) {
    validateLineValuesForScale(mark, 'x', scales[mark.x].kind)
    validateLineValuesForScale(mark, 'y', scales[mark.y].kind)
  }
  if (dataBacked && (scales[mark.x].kind === 'band' || scales[mark.y].kind === 'band')) {
    throw new Error(
      'series() requires numeric/time scales; categorical tables are not supported yet.',
    )
  }
  if (mark.area) {
    const expected = scales[mark.y].kind === 'band' ? 'string' : 'number'
    if (typeof mark.area.to !== expected) {
      throw new TypeError(
        `line "${mark.id ?? ''}" area.to must be a ${expected} for ${scales[mark.y].kind} scale "${mark.y}".`,
      )
    }
  }
}

function lineExtents(mark: LineLikeMark, context: MarkExtentContext) {
  const store = isSeriesMark(mark) ? mark.data : undefined
  if (isSeriesMark(mark)) {
    mark.options.get()
    if (!mark.visible) return
  }
  if (
    (!mark.line && !mark.markers && !mark.area) ||
    (mark.x !== context.scale && mark.y !== context.scale)
  ) {
    return
  }
  const coordinate = mark.x === context.scale ? 'x' : 'y'
  const window = extentWindow(context, coordinate === 'x' ? mark.y : mark.x)
  const staticMark = isLineMark(mark) ? mark : undefined
  if (store) {
    const _version = store.version
  }
  const length = store?.length ?? staticMark?.xValues.length ?? 0
  let eligible = false
  for (let index = 0; index < length; index += 1) {
    const x = store ? store.xAt(index) : staticMark?.xValues[index]
    const y = store ? store.yAt(index) : staticMark?.yValues[index]
    if (!isScaleValue(x) || !isScaleValue(y)) continue
    if (window && !withinWindow(coordinate === 'x' ? y : x, window)) continue
    context.add(coordinate === 'x' ? x : y)
    eligible = true
  }
  if (eligible && coordinate === 'y' && mark.area) context.add(mark.area.to)
}

function createLineRenderer(): MarkRenderer<LineLikeMark> {
  const path = svgElement('path', {
    fill: 'none',
    'vector-effect': 'non-scaling-stroke',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'data-mark': 'line',
  })
  let areaPath: SVGPathElement | undefined
  let markerGroup: SVGGElement | undefined
  const geometryKey = createKeyCache()
  const styleKey = createKeyCache()

  function syncOptionalNodes(mark: LineLikeMark) {
    if (mark.area && !areaPath) {
      areaPath = svgElement('path', { 'data-mark': 'area', 'fill-rule': 'evenodd' })
      path.before(areaPath)
    } else if (!mark.area && areaPath) {
      areaPath.remove()
      areaPath = undefined
    }
    if (mark.markers && !markerGroup) {
      markerGroup = svgElement('g', { 'data-mark': 'markers' })
      path.after(markerGroup)
    } else if (!mark.markers && markerGroup) {
      markerGroup.remove()
      markerGroup = undefined
    }
    for (const node of [path, areaPath, markerGroup]) setMarkId(node, mark.id)
  }

  return {
    mount(layer) {
      for (const node of [areaPath, path, markerGroup]) if (node) layer.append(node)
    },
    geometry(mark: LineLikeMark, context: MarkRenderContext) {
      const xScale = context.scales[mark.x]
      const yScale = context.scales[mark.y]
      const store = isSeriesMark(mark) ? mark.data : undefined
      const staticMark = isLineMark(mark) ? mark : undefined
      const visible = !isSeriesMark(mark) || mark.visible
      const key = [
        mark,
        store?.version,
        visible,
        mark.line,
        Boolean(mark.markers),
        mark.area?.to,
        ...scaleKey(xScale),
        ...scaleKey(yScale),
      ]
      if (!geometryKey.changed(key)) return
      styleKey.clear()
      syncOptionalNodes(mark)
      let data = ''
      let areaData = ''
      let drawingSegment = false
      let segmentCount = 0
      let lastX = 0
      const baseline = mark.area ? yScale.project(mark.area.to) : 0
      let markerIndex = 0
      const length = visible ? (store?.length ?? staticMark?.xValues.length ?? 0) : 0
      for (let index = 0; index < length; index += 1) {
        const xValue = store ? store.xAt(index) : staticMark?.xValues[index]
        const yValue = store ? store.yAt(index) : staticMark?.yValues[index]
        if (!isScaleValue(xValue) || !isScaleValue(yValue)) {
          drawingSegment = false
          if (segmentCount > 1) areaData += `L${lastX},${baseline}Z`
          segmentCount = 0
          continue
        }
        const x = xScale.project(xValue)
        const y = yScale.project(yValue)
        data += `${drawingSegment ? 'L' : 'M'}${x},${y}`
        if (mark.area) {
          if (drawingSegment) {
            areaData += `L${x},${y}`
            segmentCount += 1
          } else {
            segmentCount = 1
            areaData += `M${x},${baseline}L${x},${y}`
          }
          lastX = x
        }
        if (markerGroup) {
          let marker = markerGroup.children[markerIndex] as SVGCircleElement | undefined
          if (!marker) {
            marker = svgElement('circle', { 'data-mark': 'marker' })
            markerGroup.append(marker)
          }
          marker.setAttribute('cx', String(x))
          marker.setAttribute('cy', String(y))
          markerIndex += 1
        }
        drawingSegment = true
      }
      if (segmentCount > 1) areaData += `L${lastX},${baseline}Z`
      path.setAttribute('d', data)
      path.setAttribute('display', mark.line ? '' : 'none')
      areaPath?.setAttribute('d', areaData)
      if (markerGroup) {
        while (markerGroup.children.length > markerIndex) markerGroup.lastElementChild?.remove()
      }
    },
    style(mark: LineLikeMark, tokens: ThemeTokens) {
      const key = [mark, mark.stroke, mark.strokeWidth, mark.markers, mark.area, tokens.accent]
      if (!styleKey.changed(key)) return
      path.setAttribute('stroke', mark.stroke ?? accent(tokens))
      path.setAttribute('stroke-width', String(mark.strokeWidth))
      if (areaPath) {
        areaPath.setAttribute('fill', mark.area?.fill || mark.stroke || accent(tokens))
        areaPath.setAttribute('fill-opacity', String(mark.area?.opacity ?? 0))
        areaPath.setAttribute('stroke', 'none')
      }
      if (markerGroup) {
        for (const marker of markerGroup.children) {
          marker.setAttribute('r', String(mark.markers?.size ?? 0))
          marker.setAttribute('fill', mark.markers?.fill || mark.stroke || accent(tokens))
          marker.setAttribute('stroke', mark.markers?.stroke ?? 'none')
          marker.setAttribute('stroke-width', String(mark.markers?.strokeWidth ?? 0))
        }
      }
    },
    destroy() {
      areaPath?.remove()
      path.remove()
      markerGroup?.remove()
    },
  }
}

export const lineDefinition: MarkDefinition<LineMark> = {
  name: 'line',
  is: isLineMark,
  reuseByPosition: true,
  validate: (mark, context) => validateLineLike(mark, context, false),
  extents: lineExtents,
  createRenderer: createLineRenderer,
}

export const seriesDefinition: MarkDefinition<SeriesMark> = {
  name: 'series',
  is: isSeriesMark,
  reuseByPosition: true,
  validate: (mark, context) => validateLineLike(mark, context, true),
  extents: lineExtents,
  createRenderer: createLineRenderer,
  track(mark) {
    mark.options.get()
    const _version = mark.data.version
  },
  validateUpdates: (mark, context) =>
    validateSeriesUpdates(mark, (candidate) => validateLineLike(candidate, context(), true)),
}

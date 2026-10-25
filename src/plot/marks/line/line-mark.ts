import type { ThemeTokens } from '../../../theme/theme.js'
import { symbol, symbolCircle } from 'd3'
import { projectSkewTPoint } from '../../coordinates/skew-t-geometry.js'
import { isLineMark, validateLineValuesForScale, type LineMark } from './line.js'
import { isSeriesMark, validateSeriesUpdates, type SeriesMark } from './series.js'
import { svgElement } from '../../axes/render-axes.js'
import {
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
} from '../mark-definition.js'
import { lineLegendSymbol, resolveLineStyles } from '../mark-styles.js'
import { nearestPoint } from '../../interaction/point-hit-testing.js'
import type { MarkHitContext } from '../mark-definition.js'
import { pointHighlight } from '../highlight-shapes.js'
import { isStaticMarkVisible, staticLegend } from '../static-legend.js'

type LineLikeMark = LineMark | SeriesMark
let nextSymbolId = 0

function validateLineLike(mark: LineLikeMark, context: MarkValidationContext, dataBacked: boolean) {
  const polar = context.coordinateSystem === 'polar'
  const { scales } = context
  if (!Object.hasOwn(scales, mark.x) || !Object.hasOwn(scales, mark.y)) {
    throw new Error(`line "${mark.id ?? ''}" references a missing x or y scale.`)
  }
  if (context.direction(mark.x) !== (polar ? 'angular' : 'x')) {
    throw new Error(
      `line "${mark.id ?? ''}" requires an ${polar ? 'angular' : 'x'}-direction scale.`,
    )
  }
  if (context.direction(mark.y) !== (polar ? 'radial' : 'y')) {
    throw new Error(`line "${mark.id ?? ''}" requires a ${polar ? 'radial' : 'y'}-direction scale.`)
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
    if (context.coordinateSystem === 'skewT') {
      throw new Error('Skew-T plots support sounding lines and markers, not area fills.')
    }
    if (polar) throw new Error('Polar series areas require band() interval marks.')
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
  } else if (!isStaticMarkVisible(mark)) return
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
  const symbolId = `fews-line-symbol-${nextSymbolId++}`
  let symbolPath: SVGPathElement | undefined
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
      const visible = isSeriesMark(mark) ? mark.visible : isStaticMarkVisible(mark)
      const polar = context.coordinateSystem === 'polar'
      const skewT = context.coordinateSystem === 'skewT'
      const angular = xScale.scale.options.get().resolved
      const key = [
        mark,
        store?.version,
        visible,
        mark.line,
        Boolean(mark.markers),
        mark.markers?.symbolSize,
        mark.markers?.skip,
        mark.digits,
        mark.area?.to,
        context.skew,
        ...scaleKey(xScale),
        ...scaleKey(yScale),
        ...(polar ? [context.plot.x, context.plot.y, context.plot.width, context.plot.height] : []),
      ]
      if (!geometryKey.changed(key)) return
      styleKey.clear()
      syncOptionalNodes(mark)
      for (const node of [path, markerGroup]) {
        if (!node) continue
        if (polar) {
          node.setAttribute(
            'transform',
            `translate(${context.plot.x + context.plot.width / 2},${context.plot.y + context.plot.height / 2}) rotate(${((angular.intercept ?? 0) * 180) / Math.PI}) scale(${angular.direction === 'anticlockwise' ? -1 : 1},1)`,
          )
        } else node.removeAttribute('transform')
      }
      let data = ''
      let areaData = ''
      let drawingSegment = false
      let segmentCount = 0
      let lastX = 0
      const baseline = mark.area ? yScale.project(mark.area.to) : 0
      let markerIndex = 0
      let symbolData = ''
      const symbolSize = mark.markers?.symbolSize
      if (markerGroup && symbolSize !== undefined) {
        markerGroup.replaceChildren()
        const definitions = svgElement('defs')
        const marker = svgElement('marker', {
          id: symbolId,
          fill: 'context-fill',
          stroke: 'context-stroke',
          markerWidth: symbolSize,
          markerHeight: symbolSize,
          refX: symbolSize / 2,
          refY: symbolSize / 2,
        })
        marker.append(
          svgElement('path', {
            d: symbol(symbolCircle, symbolSize)() ?? '',
            transform: `translate(${symbolSize / 2},${symbolSize / 2})`,
          }),
        )
        definitions.append(marker)
        symbolPath = svgElement('path', {
          'fill-opacity': 0,
          'stroke-opacity': 0,
          'marker-start': `url(#${symbolId})`,
          'marker-mid': `url(#${symbolId})`,
          'marker-end': `url(#${symbolId})`,
        })
        markerGroup.append(definitions, symbolPath)
      } else {
        symbolPath = undefined
        if (markerGroup?.querySelector('defs')) markerGroup.replaceChildren()
      }
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
        const round = (value: number) =>
          mark.digits === undefined ? value : Number(value.toFixed(mark.digits))
        const angle = polar ? xScale.project(xValue) : 0
        const radius = polar ? yScale.project(yValue) : 0
        const sounding = skewT
          ? projectSkewTPoint(xScale, yScale, Number(xValue), Number(yValue), context.skew!)
          : undefined
        const x = round(
          sounding ? sounding.x : polar ? radius * Math.sin(angle) : xScale.project(xValue),
        )
        const y = round(
          sounding ? sounding.y : polar ? -radius * Math.cos(angle) : yScale.project(yValue),
        )
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
        if (markerGroup && index % (mark.markers?.skip ?? 1) === 0) {
          if (symbolPath) {
            symbolData += `${markerIndex ? 'L' : 'M'}${x},${y}`
          } else {
            let marker = markerGroup.children[markerIndex] as SVGCircleElement | undefined
            if (!marker) {
              marker = svgElement('circle', { 'data-mark': 'marker' })
              markerGroup.append(marker)
            }
            marker.setAttribute('cx', String(x))
            marker.setAttribute('cy', String(y))
          }
          markerIndex += 1
        }
        drawingSegment = true
      }
      if (segmentCount > 1) areaData += `L${lastX},${baseline}Z`
      path.setAttribute('d', data)
      path.setAttribute('display', mark.line ? '' : 'none')
      areaPath?.setAttribute('d', areaData)
      if (markerGroup) {
        if (symbolPath) symbolPath.setAttribute('d', symbolData + (markerIndex === 1 ? 'Z' : ''))
        else
          while (markerGroup.children.length > markerIndex) markerGroup.lastElementChild?.remove()
      }
    },
    style(mark: LineLikeMark, tokens: ThemeTokens) {
      const key = [
        mark,
        mark.stroke,
        mark.strokeWidth,
        mark.strokeDasharray,
        mark.strokeLinecap,
        mark.strokeLinejoin,
        mark.vectorEffect,
        mark.markers,
        mark.area,
        tokens.accent,
      ]
      if (!styleKey.changed(key)) return
      const styles = resolveLineStyles(mark, tokens)
      path.setAttribute('stroke', styles.line.stroke)
      path.setAttribute('stroke-width', String(styles.line.strokeWidth))
      for (const [name, value] of [
        ['vector-effect', mark.vectorEffect ?? 'non-scaling-stroke'],
        ['stroke-linecap', styles.line.strokeLinecap],
        ['stroke-linejoin', styles.line.strokeLinejoin],
      ]) {
        if (path.getAttribute(name) !== value) path.setAttribute(name, value)
      }
      if (mark.strokeDasharray === undefined) path.removeAttribute('stroke-dasharray')
      else path.setAttribute('stroke-dasharray', mark.strokeDasharray)
      if (areaPath) {
        areaPath.setAttribute('fill', styles.area.fill)
        areaPath.setAttribute('fill-opacity', String(styles.area.opacity))
        areaPath.setAttribute('stroke', 'none')
      }
      if (markerGroup) {
        const markers = symbolPath ? [symbolPath] : markerGroup.children
        for (const marker of markers) {
          marker.setAttribute('r', String(styles.marker.size))
          marker.setAttribute('fill', styles.marker.fill)
          marker.setAttribute('stroke', styles.marker.stroke)
          marker.setAttribute('stroke-width', String(styles.marker.strokeWidth))
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

function pointMarkHits(mark: LineLikeMark, { scales, point, axis, plot }: MarkHitContext) {
  if (isLineMark(mark) && !isStaticMarkVisible(mark)) return []
  const hit = nearestPoint(mark, scales, point, axis, plot)
  return hit ? [hit] : []
}

export const lineDefinition: MarkDefinition<LineMark> = {
  name: 'line',
  is: isLineMark,
  hits: pointMarkHits,
  highlight: (mark, hit, { color }) => pointHighlight(mark, hit, color),
  legend: (mark, tokens) => staticLegend(mark, lineLegendSymbol(mark, tokens)),
  validate: (mark, context) => validateLineLike(mark, context, false),
  extents: lineExtents,
  createRenderer: createLineRenderer,
  track: (mark) => isStaticMarkVisible(mark),
}

export const seriesDefinition: MarkDefinition<SeriesMark> = {
  name: 'series',
  is: isSeriesMark,
  hits: pointMarkHits,
  highlight: (mark, hit, { color }) => pointHighlight(mark, hit, color),
  legend(mark, tokens) {
    const options = mark.options.get().resolved
    return {
      label: options.label,
      group: options.legendGroup,
      symbol: lineLegendSymbol(mark, tokens),
      visible: () => mark.visible,
      setVisible: (visible) => mark.update({ visible }),
    }
  },
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

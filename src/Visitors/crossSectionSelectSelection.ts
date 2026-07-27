import * as d3 from 'd3'
import type { Chart } from '../index.js'
import type { CrossSectionPoint } from './crossSectionSelectRenderer.js'

export type CrossSectionSelectAxis = {
  xScales: Array<{ invert(value: number): any; domain(): [any, any]; (value: any): number }>
  yScales: Array<{ domain(): [any, any]; (value: any): number }>
  chartsExtent: (axis: 'x' | 'y', index: number, options: Record<string, never>) => any[]
}

export function determineCrossSectionLabel(yExtent: any[], yValue: any): string {
  const specifier = d3.formatSpecifier('f')
  specifier.precision = d3.precisionFixed((yExtent[1] - yExtent[0]) / 100)

  if (Array.isArray(yValue)) {
    const labels: string[] = []
    for (let index = 0; index < yValue.length; index++) {
      labels[index] = d3.format(specifier.toString())(yValue[index])
    }
    return labels.join('–')
  }

  return d3.format(specifier.toString())(yValue)
}

export function findCrossSectionPoint(params: {
  axis: CrossSectionSelectAxis | undefined
  chart: Chart
  xPos: number
}): CrossSectionPoint {
  const { axis, chart, xPos } = params

  if (!axis || chart.data.length < 2) {
    return { id: chart.id, x: undefined, y: undefined, d: undefined }
  }

  const xIndex = chart.axisIndex?.x?.axisIndex
  const yIndex = chart.axisIndex?.y?.axisIndex
  if (xIndex === undefined || yIndex === undefined) {
    return { id: chart.id, x: undefined, y: undefined, d: undefined }
  }

  const xScale = axis.xScales[xIndex]
  const yScale = axis.yScales[yIndex]
  const xDataKey = chart.dataKeys?.x
  const yDataKey = chart.dataKeys?.y
  if (!xDataKey || !yDataKey) {
    return { id: chart.id, x: undefined, y: undefined, d: undefined }
  }

  const data = chart.data
  const bisector = d3.bisector((datum: any) => datum[xDataKey])
  const xValue = xScale.invert(xPos)

  let index = bisector.left(data, xValue)
  if (index < 0) return { id: chart.id, x: undefined, y: undefined, d: undefined }

  index = Math.min(index, data.length - 1)
  let yValue = data[index][yDataKey]

  if (yValue === null) {
    for (let candidate = index; candidate >= 0; candidate--) {
      yValue = data[candidate][yDataKey]
      if (yValue !== null) {
        index = candidate
        break
      }
    }
  }

  const x = xScale(data[index][xDataKey])
  const y = yScale(yValue)
  const d = data[index]

  if (yValue === null || yValue < yScale.domain()[0] || yValue > yScale.domain()[1]) {
    return { id: chart.id, x: undefined, y: undefined, d }
  }

  const yExtent = axis.chartsExtent('y', yIndex, {})
  return {
    id: chart.id,
    x,
    y,
    value: determineCrossSectionLabel(yExtent, yValue),
    d,
  }
}

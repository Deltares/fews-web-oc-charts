import * as d3 from 'd3'
import { AxisType, CartesianAxes, PolarAxes } from '../index.js'
import type { CartesianAxesIndex } from '../Axes/cartesianAxes.js'
import type { AxisIndex } from '../Axes/axes.js'
import { Chart, AUTO_SCALE } from './chart.js'
import { TooltipAnchor } from '../Tooltip/tooltip.js'
import type { DataPoint } from '../Data/types.js'

export class ChartMatrix extends Chart {
  static readonly GROUP_CLASS: 'chart-matrix'

  plotterCartesian(axis: CartesianAxes, axisIndex: CartesianAxesIndex) {
    const xKey = this.dataKeys.x
    const yKey = this.dataKeys.y
    const colorKey = this.dataKeys.color
    const valueKey = this.dataKeys.value ? this.dataKeys.value : this.dataKeys.color
    const data = this.data
    const xScale = axis.xScales[axisIndex.x.axisIndex]
    const yScale = axis.yScales[axisIndex.y.axisIndex]

    const x0 = xScale.copy()
    const y0 = yScale.copy()
    this.setPadding(x0, this.options.x)
    this.setPadding(y0, this.options.y)

    const axisOptions = axis.options.x[axisIndex.x.axisIndex]
    const isBandScale = axisOptions?.type === AxisType.band

    const mappedData = this.mapDataCartesian(xScale.domain())

    const xRect = (_d: unknown, i: number) => {
      return i === 0 ? 0 : xScale(mappedData[i - 1][xKey])
    }
    const getWidthRect = (_: unknown, i: number) => {
      return i === 0 ? 0 : xScale(mappedData[i][xKey]) - xScale(mappedData[i - 1][xKey])
    }

    const colorScale = d3.scaleLinear().domain([0, 1])
    if (this.options.colorScale === AUTO_SCALE) {
      const colorValues = this.data
        .map((d) => d[colorKey])
        .filter((value): value is number => typeof value === 'number')
      const colorExtent = d3.extent(colorValues)
      if (colorExtent[0] !== undefined && colorExtent[1] !== undefined) {
        colorScale.domain(colorExtent)
      }
    }

    const colorMap = this.getColorMap(colorScale)
    this.group = this.selectGroup(axis, ChartMatrix.GROUP_CLASS)
    d3.transition().duration(this.options.transitionTime)

    const elements = this.group
      .selectAll<SVGRectElement, DataPoint>('rect')
      .data(isBandScale ? data : mappedData)
      .join('rect')
      .attr('display', (d) => {
        return d[valueKey] === null ? 'none' : null
      })
      .attr('x', isBandScale ? (d) => x0(d[xKey]) : xRect)
      .attr('y', (d) => y0(d[yKey]))
      .attr('width', isBandScale ? x0.bandwidth() : getWidthRect)
      .attr('height', y0.bandwidth())
      .attr('stroke-width', 0)
      .attr('shape-rendering', 'crispEdges')
      .attr('fill', (d) => {
        const value = d[colorKey]
        return typeof value === 'number' || value instanceof Date ? colorMap(value) : 'none'
      })
    this.addTooltipHandlers(elements, axis, {
      expectedAnchor: TooltipAnchor.Top,
      positionFn: (_e: Event, d: DataPoint) => [
        axis.margin.left + x0(d[xKey]) + x0.bandwidth() / 2,
        axis.margin.top + y0(d[yKey]),
      ],
    })

    if (this.options.text !== undefined) {
      const textSelection = this.group
        .selectAll<SVGTextElement, DataPoint>('text')
        .data(data)
        .join('text')

      textSelection
        .attr('x', (d) => x0(d[xKey]) + x0.bandwidth() / 2)
        .attr('y', (d) => y0(d[yKey]) + y0.bandwidth() / 2)
        .attr('dx', this.options.text.dx ?? 0)
        .attr('dy', this.options.text.dy ?? 0)
        .text((d) => {
          return this.options.text?.formatter?.(d) ?? ''
        })

      for (const [key, value] of Object.entries(this.options.text.attributes ?? {})) {
        textSelection.attr(key, value)
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  plotterPolar(axis: PolarAxes, dataKeys: AxisIndex) {
    throw new Error('plotterPolar is not implemented for ChartMatrix')
  }

  drawLegendSymbol(legendId?: string, asSvgElement?: boolean) {
    const props = ['fill']
    const source = this.group.select('rect').node() as Element
    const { svg, group } = this.createLegendSymbolCanvas()
    const element = group.append('g')
    element.append('rect').attr('x', 0).attr('y', -8).attr('width', 5).attr('height', 18)
    this.applyStyle(source, element, props)
    element.append('rect').attr('x', 5).attr('y', -6).attr('width', 5).attr('height', 16)
    this.applyStyle(source, element, props)
    element.append('rect').attr('x', 10).attr('y', -5).attr('width', 5).attr('height', 15)
    this.applyStyle(source, element, props)
    return this.finalizeLegendSymbol(svg, element, asSvgElement)
  }
}

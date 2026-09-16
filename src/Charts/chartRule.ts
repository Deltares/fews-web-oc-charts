import type { DataPoint } from '../Data/types.js'
import { Chart } from './chart.js'
import { CartesianAxes, CartesianAxesIndex } from '../Axes/cartesianAxes.js'
import { PolarAxes } from '../Axes/polarAxes.js'
import type { AxisIndex } from '../Axes/axes.js'

export class ChartRule extends Chart {
  plotterCartesian(axis: CartesianAxes, axisIndex: CartesianAxesIndex) {
    const xKey = this.dataKeys.x
    const yKey = this.dataKeys.y
    if (xKey === undefined || yKey === undefined || axisIndex === undefined) {
      throw new Error('ChartRule requires both x and y data keys')
    }
    const xAxisIndex = axisIndex.x?.axisIndex ?? 0
    const yAxisIndex = axisIndex.y?.axisIndex ?? 0
    const xScale = axis.xScales[xAxisIndex]
    const yScale = axis.yScales[yAxisIndex]

    const mappedData = this.mapDataCartesian(xScale.domain())
    const getRange = (dataPoint: DataPoint): [number, number] => {
      const value = dataPoint[yKey]
      if (
        !Array.isArray(value) ||
        value.length < 2 ||
        typeof value[0] !== 'number' ||
        typeof value[1] !== 'number'
      ) {
        throw new Error('ChartRule requires y data to be a numeric range')
      }
      return [value[0], value[1]]
    }

    this.group = this.selectGroup(axis, 'chart-marker')
    this.group.datum(mappedData)
    const elements = this.group
      .selectAll<SVGLineElement, DataPoint>('line')
      .data((d) => d as DataPoint[])

    // exit selection
    elements.exit().remove()

    // enter + update selection
    elements
      .enter()
      .append('line')
      .merge(elements)
      .attr('x1', (d) => xScale(d[xKey]))
      .attr('x2', (d) => xScale(d[xKey]))
      .attr('y1', (d) => yScale(getRange(d)[0]))
      .attr('y2', (d) => yScale(getRange(d)[1]))

    this.addTooltipHandlers(elements, axis)
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  plotterPolar(axis: PolarAxes, dataKeys: AxisIndex) {
    console.error('plotterPolar is not implemented for ChartRule')
  }

  drawLegendSymbol(legendId?: string, asSvgElement?: boolean) {
    const props = ['stroke', 'stroke-width']
    const source = this.group.select('line').node() as Element
    const { svg, group } = this.createLegendSymbolCanvas()
    const element = group.append('line').attr('x1', 10).attr('x2', 10).attr('y1', -8).attr('y2', 8)
    this.applyStyle(source, element, props)
    return this.finalizeLegendSymbol(svg, element, asSvgElement)
  }
}

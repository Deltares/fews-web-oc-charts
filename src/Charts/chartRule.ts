import * as d3 from 'd3'
import type { AxisIndex } from '../Axes/axes.js'
import { Chart } from './chart.js'
import { CartesianAxes } from '../Axes/cartesianAxes.js'
import { PolarAxes } from '../Axes/polarAxes.js'

export class ChartRule extends Chart {
  plotterCartesian(axis: CartesianAxes, axisIndex: AxisIndex) {
    const xKey = this.dataKeys.x
    const yKey = this.dataKeys.y
    const xScale = axis.xScales[axisIndex.x.axisIndex]
    const yScale = axis.yScales[axisIndex.y.axisIndex]

    const mappedData = this.mapDataCartesian(xScale.domain())

    this.group = this.selectGroup(axis, 'chart-marker').datum(mappedData)
    const elements = this.group.selectAll<SVGLineElement, any>('line').data((d) => d)

    // exit selection
    elements.exit().remove()

    // enter + update selection
    elements
      .enter()
      .append('line')
      .merge(elements)
      .attr('x1', (d) => xScale(d[xKey]))
      .attr('x2', (d) => xScale(d[xKey]))
      .attr('y1', (d) => yScale(d[yKey][0]))
      .attr('y2', (d) => yScale(d[yKey][1]))

    this.addTooltipHandlers(elements, axis)
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  plotterPolar(axis: PolarAxes, dataKeys: any) {
    console.error('plotterPolar is not implemented for ChartRule')
  }

  drawLegendSymbol(legendId?: string, asSvgElement?: boolean) {
    const props = ['stroke', 'stroke-width']
    const source = this.group.select('line').node() as Element
    const svg = d3.create('svg').attr('width', 20).attr('height', 20)
    const group = svg.append('g').attr('transform', 'translate(0, 10)')
    const element = group.append('line').attr('x1', 10).attr('x2', 10).attr('y1', -8).attr('y2', 8)
    this.applyStyle(source, element, props)
    if (asSvgElement) return element.node()
    return svg.node()
  }
}

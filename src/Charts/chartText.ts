import * as d3 from 'd3'
import { CartesianAxis, PolarAxis } from '../Axis'
import { Chart, SymbolOptions } from './chart'

export class ChartText extends Chart {
  private previousData: any[] = []
  symbol!: SymbolOptions

  constructor(data: any, options: any) {
    super(data, options)
  }

  plotterCartesian(axis: CartesianAxis, axisIndex: any) {
    const xKey = this.dataKeys.x
    const yKey = this.dataKeys.y
    const xScale = axis.xScale[axisIndex.x.axisIndex]
    const yScale = axis.yScale[axisIndex.y.axisIndex]

    const mappedData = this.mapDataCartesian(xScale.domain())

    this.group = this.selectGroup(axis, 'chart-marker')
      .datum(mappedData)
    const elements = this.group.selectAll('path').data(d => d)

    // exit selection
    elements.exit().remove()

    // enter + update selection
    const text = elements
      .enter()
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
    text
      .merge(text)
      .attr('x',(d) => xScale(d[xKey]))
      .attr('x',(d) => yScale(d[yKey]))
      .text((d) => d[yKey])
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  plotterPolar(axis: PolarAxis, dataKeys: any) {
    throw new Error('Polar axis are not supported by ChartText')
  }

  drawLegendSymbol(legendId?: string, asSvgElement?: boolean) {
    const chartElement = this.group
      .select('path')
      .node() as Element
    const style = window.getComputedStyle(chartElement)
    const svg = d3.create('svg')
      .append('svg')
      .attr('width',20)
      .attr('height',20)
    const group = svg
      .append('g')
      .attr('transform', 'translate(10 10)')
    const element = group.append('text')
      .attr('text-anchor', 'middle')
      .text('+1.0')
      .style('stroke', style.getPropertyValue('stroke'))
      .style('fill', style.getPropertyValue('fill'))
    if (asSvgElement) return element.node()
    return svg.node()
  }

}

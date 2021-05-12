import * as d3 from 'd3'
import { CartesianAxis, PolarAxis } from '../Axis'
import { Chart, SymbolOptions } from './chart'

function mean(x: number[] | number) {
  if (x instanceof Array) {
    return d3.mean(x)
  }
  return x
}

export class ChartText extends Chart {
  private previousData: any[] = []
  symbol!: SymbolOptions

  constructor(data: any, options: any) {
    super(data, options)
  }

  plotterCartesian(axis: CartesianAxis, axisIndex: any) {
    let xKey = this.dataKeys.x
    let yKey = this.dataKeys.y
    const xScale = axis.xScale[axisIndex.x.axisIndex]
    const yScale = axis.yScale[axisIndex.y.axisIndex]

    let mappedData = this.mapDataCartesian(xScale.domain())

    this.group = this.selectGroup(axis, 'chart-marker')
      .datum(mappedData)
    let elements = this.group.selectAll('path').data(d => d)

    // exit selection
    elements.exit().remove()

    // enter + update selection
    elements
      .enter()
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .merge(elements)
      .attr('x',(d) => xScale(d[xKey]))
      .attr('x',(d) => yScale(d[yKey]))
      .text((d) => d[yKey])
  }

  plotterPolar(axis: PolarAxis, dataKeys: any) {}

  drawLegendSymbol(legendId?: string, asSvgElement?: boolean) {
    let chartElement = this.group
      .select('path')
      .node() as Element
    let style = window.getComputedStyle(chartElement)
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

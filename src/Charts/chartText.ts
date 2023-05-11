import * as d3 from 'd3'
import { CartesianAxes, PolarAxes } from '../index.js';
import { Chart, SymbolOptions } from './chart.js'

export class ChartText extends Chart {
  private previousData: any[] = []
  symbol!: SymbolOptions

  constructor(data: any, options: any) {
    super(data, options)
  }

  plotterCartesian(axis: CartesianAxes, axisIndex: any) {
    const xKey = this.dataKeys.x
    const yKey = this.dataKeys.y
    const xScale = axis.xScales[axisIndex.x.axisIndex]
    const yScale = axis.yScales[axisIndex.y.axisIndex]

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
      .attr('x', (d) => xScale(d[xKey]))
      .attr('x', (d) => yScale(d[yKey]))
      .text((d) => d[yKey])
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  plotterPolar(axis: PolarAxes, dataKeys: any) {
    throw new Error('Polar axis are not supported by ChartText')
  }

  drawLegendSymbol(legendId?: string, asSvgElement?: boolean) {
    const props = ['stroke', 'fill']
    const source = this.group
      .select('path')
      .node() as Element
    const svg = d3.create('svg')
      .append('svg')
      .attr('width', 20)
      .attr('height', 20)
    const group = svg
      .append('g')
      .attr('transform', 'translate(10 10)')
    const element = group.append('text')
      .attr('text-anchor', 'middle')
      .text('+1.0')
    this.applyStyle(source, element, props)
    if (asSvgElement) return element.node()
    return svg.node()
  }

}

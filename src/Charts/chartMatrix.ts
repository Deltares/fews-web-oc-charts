import * as d3 from 'd3'
import { CartesianAxis, PolarAxis } from '../Axis'
import { Chart, AUTO_SCALE } from './chart'

export class ChartMatrix extends Chart {
  plotterCartesian(axis: CartesianAxis, axisIndex: any) {
    let xKey = this.dataKeys.x
    let yKey = this.dataKeys.y
    let colorKey = this.dataKeys.color
    let data = this.data
    const xScale = axis.xScale[axisIndex.x.axisIndex]
    const yScale = axis.yScale[axisIndex.y.axisIndex]
    // const groupKeys: string[] = Array.from(new Set(data.map((item) => {return item[xKey]}) ) )

    let colorScale = d3.scaleLinear().domain([0, 1])
    if (this.options.colorScale === AUTO_SCALE) {
      colorScale.domain(
        d3.extent(this.data, function(d: any): number {
          return d[colorKey]
        })
      )
    }

    let colorMap = this.colorMap
    this.group = this.selectGroup(axis, 'chart-matrix')
    let t = d3
      .transition()
      .duration(this.options.transitionTime)


    const matrix = this.group
      .selectAll("rect")
      .data(data)
      .join("rect")
        .attr("x", d => xScale(d[xKey]))
        .attr("y", d => yScale(d[yKey]))
        .attr("width", xScale.bandwidth())
        .attr("height", yScale.bandwidth())
        .attr("fill", d => colorMap(colorScale(d[colorKey])))
        // .attr("fill", function(d: any) { console.log(d[colorKey], colorScale(d[colorKey]) );return colorMap(colorScale(d[colorKey]))});


      matrix.data(data)
          .order()
        .transition(t)
          .attr("x", d => xScale(d[xKey]))
          .attr("y", d => yScale(d[yKey]))
          .attr("width", xScale.bandwidth())
          .attr("height", yScale.bandwidth())
  }

  plotterPolar(axis: PolarAxis, dataKeys: any) {
    throw new Error('plotterPolar is not implemented for ChartBar')
  }
  drawLegendSymbol(asSvgElement?: boolean) {
    let chartElement = this.group
      .select('rect')
      .node() as Element
    let style = window.getComputedStyle(chartElement)
    const svg = d3.create('svg')
      .attr('width',20)
      .attr('height',20)
    const group = svg
      .append('g')
      .attr('transform', 'translate(0, 10)')
    const element = group.append('g')
    element
      .append('rect')
      .attr('x', 0)
      .attr('y', -8)
      .attr('width', 5)
      .attr('height', 18)
      .style('fill', style.getPropertyValue('fill'))
    element
      .append('rect')
      .attr('x', 5)
      .attr('y', -6)
      .attr('width', 5)
      .attr('height', 16)
      .style('fill', style.getPropertyValue('fill'))
    element
      .append('rect')
      .attr('x', 10)
      .attr('y', -5)
      .attr('width', 5)
      .attr('height', 15)
      .style('fill', style.getPropertyValue('fill'))
    if (asSvgElement) return element.node()
    return svg.node()
  }
}


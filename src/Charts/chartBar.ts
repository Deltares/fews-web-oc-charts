import * as d3 from 'd3'
import { CartesianAxis, PolarAxis } from '../Axis'
import { Chart, AUTO_SCALE } from './chart'

export class ChartBar extends Chart {
  plotterCartesian(axis: CartesianAxis, axisIndex: any) {
    let xKey = this.dataKeys.x
    let yKey = this.dataKeys.y
    let x1Key = this.dataKeys.x1
    let colorKey = this.dataKeys.color
    let data = this.data
    const xScale = axis.xScale[axisIndex.x.axisIndex]
    const yScale = axis.yScale[axisIndex.y.axisIndex]

    const filterKeys: string[] = Array.from(new Set(data.map((item) => {return item[x1Key]}) ) )
    // const groupKeys: string[] = Array.from(new Set(data.map((item) => {return item[xKey]}) ) )

    let x0 = xScale.copy()
    x0.domain(data.map(d => d[xKey]))
      .paddingInner(0.1)

    let x1 = d3.scaleBand()
      .domain(filterKeys)
      .rangeRound([0, x0.bandwidth()])
      .padding(0.05)

    let colorScale = d3.scaleLinear().domain([0, 1])
    if (this.options.colorScale === AUTO_SCALE) {
      colorScale.domain(
        d3.extent(this.data, function(d: any): number {
          return d[colorKey]
        })
      )
    }

    let colorMap = this.colorMap
    this.group = this.selectGroup(axis, 'chart-bar')
    let t = d3
      .transition()
      .duration(this.options.transitionTime)


    const bar = this.group
      .selectAll("rect")
      .data(data)
      .join("rect")
        .attr("x", (d) => {return x0(d[xKey]) + x1(d[x1Key])})
        .attr("y", d => yScale(d[yKey]))
        .attr("width", x1.bandwidth())
        .attr("height", d => yScale(0) - yScale(d[yKey]))
        .attr("fill", function(d: any) { return "#FF8800"});
        // .attr("fill", function(d: any) { console.log(d[colorKey], colorScale(d[colorKey]) );return colorMap(colorScale(d[colorKey]))});


      bar.data(data)
          .order()
        .transition(t)
          .delay((d, i) => i * 25)
          .attr("x", d => x0(d[xKey]) + x1(d[x1Key]));

      // gx.transition(t)
      //     .call(xAxis)
      //   .selectAll(".tick")
      //     .delay((d, i) => i * 20);



    // let elements: any = this.group.selectAll('rect').data(this.data)

    // let that = this
    // // remove
    // elements.exit().remove()
    // // enter + update
    // elements
    //   .enter()
    //   .append('rect')
    //   .style('fill', function(d: any) {
    //     return colorMap()
    //   })
    //   .attr('y', function(d: any) {
    //     return d[yKey] === null ? axis.height : yScale(d[yKey])
    //   })
    //   .attr('height', function(d: any) {
    //     return d[yKey] === null ? 0 : axis.height - yScale(d[yKey])
    //   })

    //   .merge(elements)
    //   .attr('x', function(d: any) {
    //     return histScale(d[xKey])
    //   })
    //   .on('mouseover', function(d: any) {
    //     axis.showTooltip(that.toolTipFormatterCartesian(d))
    //   })
    //   .on('mouseout', function(d: any) {
    //     axis.hideTooltip(d)
    //   })
    //   .attr('width', histScale.bandwidth())

    // elements
    //   .transition(t)
    //   .style('fill', function(d: any) {
    //     return colorMap(colorScale(d[colorKey]))
    //   })
    //   .attr('y', function(d: any) {
    //     return d[yKey] === null ? axis.height : yScale(d[yKey])
    //   })
    //   .attr('height', function(d: any) {
    //     return d[yKey] === null ? 0 : axis.height - yScale(d[yKey])
    //   })
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


import * as d3 from 'd3'
import { CartesianAxis, PolarAxis } from '../Axis'
import { Chart, AUTO_SCALE } from './chart'

export class ChartHistogram extends Chart {
  plotterCartesian(axis: CartesianAxis, axisIndex: any) {
    let xKey = this.dataKeys.x
    let yKey = this.dataKeys.y
    let colorKey = this.dataKeys.color
    let data = this.data
    const xScale = axis.xScale[axisIndex.x.axisIndex]
    const yScale = axis.yScale[axisIndex.y.axisIndex]

    let histScale = d3.scaleBand().domain(
      data.map(function(d: any) {
        return d[xKey]
      })
    )
    histScale.range(xScale.range())
    histScale.padding(0.05)

    let colorScale = d3.scaleLinear().domain([0, 1])
    if (this.options.colorScale === AUTO_SCALE) {
      colorScale.domain(
        d3.extent(this.data, function(d: any): number {
          return d[colorKey]
        })
      )
    }

    let colorMap = this.colorMap
    this.group = this.selectGroup(axis, 'chart-range')
    let t = d3
      .transition()
      .duration(this.options.transitionTime)
      .ease(d3.easeLinear)

    let elements: any = this.group.selectAll('rect').data(this.data)

    let that = this
    // remove
    elements.exit().remove()
    // enter + update
    elements
      .enter()
      .append('rect')
      .style('fill', function(d: any) {
        return colorMap(colorScale(d[colorKey]))
      })
      .attr('y', function(d: any) {
        return d[yKey] === null ? yScale(0) : Math.min(yScale(d[yKey]), yScale(0))
      })
      .attr('height', function(d: any) {
        return d[yKey] === null ? 0 : Math.abs(yScale(0) - yScale(d[yKey]))
      })

      .merge(elements)
      .attr('x', function(d: any) {
        return histScale(d[xKey])
      })
      .on('mouseover', function(d: any) {
        axis.showTooltip(that.toolTipFormatterCartesian(d))
      })
      .on('mouseout', function(d: any) {
        axis.hideTooltip(d)
      })
      .attr('width', histScale.bandwidth())

    elements
      .transition(t)
      .style('fill', function(d: any) {
        return colorMap(colorScale(d[colorKey]))
      })
      .attr('y', function(d: any) {
        return d[yKey] === null ? yScale(0) : Math.min(yScale(d[yKey]), yScale(0))
      })
      .attr('height', function(d: any) {
        return d[yKey] === null ? 0 : Math.abs(yScale(0) - yScale(d[yKey]))
      })
  }

  plotterPolar(axis: PolarAxis, dataKeys: any) {
    throw new Error('plotterPolar is not implemented for ChartHistogram')
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

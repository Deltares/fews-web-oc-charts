import * as d3 from 'd3'
import { CartesianAxis, PolarAxis } from '../Axis'
import { Chart } from './chart'

export class ChartLine extends Chart {
  plotterCartesian(axis: CartesianAxis, axisIndex: any) {
    let xKey = this.dataKeys.x
    let yKey = this.dataKeys.y
    const xScale = axis.xScale[axisIndex.x.axisIndex]
    const yScale = axis.yScale[axisIndex.y.axisIndex]


    let mappedData = this.mapDataCartesian(xScale.domain())
    let lineGenerator = d3
      .line()
      .x(function(d: any) {
        return xScale(d[xKey])
      })
      .y(function(d: any) {
        return yScale(d[yKey])
      })
      .defined(function(d: any) {
        return d[yKey] != null
      })

    this.group = this.selectGroup(axis, 'chart-line')
    if (this.group.select('path').size() === 0) {
      this.group.append('path')
    }
    let path = this.group
      .select('path')
      .datum(mappedData)
      .attr('d', lineGenerator)
  }

  plotterPolar(axis: PolarAxis, axisIndex: any) {
    let mappedData = this.mapDataPolar(axis)
    let rKey = this.dataKeys.radial
    let tKey = this.dataKeys.angular
    // const rScale = axis.rScale[axisIndex.x.axisIndex]
    // const tScale = axis.tScale[axisIndex.y.axisIndex]
    let lineGenerator = d3
      .lineRadial()
      .angle(function(d: any) {
        return d[tKey]
      })
      .radius(function(d: any) {
        return d[rKey]
      })
    this.group = this.selectGroup(axis, 'chart-line')
    if (this.group.select('path').size() === 0) {
      this.group.append('path')
    }
    let line = this.group.select('path')

    let t = d3
      .transition()
      .duration(this.options.transitionTime)
      .ease(d3.easeLinear)

    line.transition(t).attr('d', lineGenerator(mappedData))
    line.datum(this.data)
  }

  drawLegendSymbol(asSvgElement?: boolean) {
    let chartElement = this.group
      .select('path')
      .node() as Element
    let style = window.getComputedStyle(chartElement)
    const svg = d3.create('svg')
      .attr('width',20)
      .attr('height',20)
      .append('g')
      .attr('tranfrom','translate(0, 10)')
   const element = svg.append('line')
      .attr('x1', 0)
      .attr('x2', 20)
      .attr('y1', 0)
      .attr('y2', 0)
      .style('stroke', style.getPropertyValue('stroke'))
      .style('stroke-width', style.getPropertyValue('stroke-width'))
      .style('stroke-dasharray', style.getPropertyValue('stroke-dasharray'))
    if (asSvgElement) return element.node()
    return svg.node()
  }
}

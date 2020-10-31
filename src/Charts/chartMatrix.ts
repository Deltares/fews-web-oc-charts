import * as d3 from 'd3'
import { CartesianAxis, PolarAxis } from '../Axis'
import { Chart, AUTO_SCALE } from './chart'

export class ChartMatrix extends Chart {
  static readonly GROUP_CLASS: 'chart-matrix'

  plotterCartesian(axis: CartesianAxis, axisIndex: any) {
    let xKey = this.dataKeys.x
    let yKey = this.dataKeys.y
    let colorKey = this.dataKeys.color
    let data = this.data
    const xScale = axis.xScale[axisIndex.x.axisIndex]
    const yScale = axis.yScale[axisIndex.y.axisIndex]

    let x0 = xScale.copy()
    let y0 = yScale.copy()
    this.setPadding(x0, this.options.x)
    this.setPadding(y0, this.options.y)

    let colorScale = d3.scaleLinear().domain([0, 1])
    if (this.options.colorScale === AUTO_SCALE) {
      colorScale.domain(
        d3.extent(this.data, function(d: any): number {
          return d[colorKey]
        })
      )
    }

    let colorMap = this.getColorMap(colorScale)
    this.group = this.selectGroup(axis, ChartMatrix.GROUP_CLASS)
    let t = d3
      .transition()
      .duration(this.options.transitionTime)

    const that = this
    const matrix = this.group
      .selectAll("rect")
      .data(data)
      .join("rect")
        .attr("x", d => x0(d[xKey]))
        .attr("y", d => y0(d[yKey]))
        .attr("width", x0.bandwidth())
        .attr("height", y0.bandwidth())
        .attr("stroke-width", 0)
        .attr("shape-rendering", "auto")
        .attr("fill", d => d[colorKey] !== null ? colorMap(d[colorKey]) : 'none' )
        .on('mouseover', function(d: any) {
          axis.showTooltip(
            that.toolTipFormatterCartesian(d),
            axis.margin.left + x0(d[xKey]) + x0.bandwidth() / 2 ,
            axis.margin.top + y0(d[yKey])
          )
        })
        .on('mouseout', (d: any) => {
          axis.hideTooltip(d)
        })

      matrix.data(data)
          .order()
        .transition(t)
          .attr("x", d => x0(d[xKey]))
          .attr("y", d => y0(d[yKey]))
          .attr("width", x0.bandwidth())
          .attr("height", y0.bandwidth())
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

  getColorMap(scale?: any): (x: number | Date) => string {
    if ( this.options.color?.map ) {
      return this.options.color?.map
    } else {
      let colorMap = (value: any) => {
        const colorMap = d3.scaleSequential(d3.interpolateWarm)
        return colorMap(scale(value))
      }
      return colorMap
    }
  }

  setPadding(scale: any, options) {
    if ( options?.paddingOuter ) {
      scale.paddingOuter(options.paddingOuter)
    }
    if ( options?.paddingInner ) {
      scale.paddingInner(options.paddingInner)
    }
  }

}


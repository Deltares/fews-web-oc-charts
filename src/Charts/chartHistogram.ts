import * as d3 from 'd3'
import { CartesianAxis, PolarAxis } from '../Axis'
import { Chart, AUTO_SCALE } from './chart'

export class ChartHistogram extends Chart {
  plotterCartesian(axis: CartesianAxis, dataKeys: any) {
    let canvas = axis.canvas
    let xkey = dataKeys.xkey ? dataKeys.xkey : 'x'
    let ykey = dataKeys.ykey ? dataKeys.ykey : 'y'
    let colorkey = dataKeys.colorkey ? dataKeys.colorkey : ykey
    let data = this.data

    let x0 = (3 * data[0][xkey] - data[1][xkey]) / 2
    let x1 = (-data[data.length - 2][xkey] + 3 * data[data.length - 1][xkey]) / 2
    // axis.xScale.domain([x0, x1])

    let histScale = d3.scaleBand().domain(
      data.map(function(d: any) {
        return d[xkey]
      })
    )
    histScale.range(axis.xScale.range())
    histScale.padding(0.05)

    let colorScale = d3.scaleLinear().domain([0, 1])
    if (this.options.colorScale === AUTO_SCALE) {
      colorScale.domain(
        d3.extent(this.data, function(d: any): number {
          return d[colorkey]
        })
      )
    }

    let colorMap = this.colorMap
    let mappedData: any = this.data.map(function(d: any) {
      return {
        x: d[xkey],
        y: d[ykey],
        color: colorMap(colorScale(d[colorkey]))
      }
    })
    this.group = this.selectGroup(axis, 'chart-range')
    let t = d3
      .transition()
      .duration(this.options.transitionTime)
      .ease(d3.easeLinear)

    let elements: any = this.group.selectAll('rect').data(mappedData)

    // remove
    elements.exit().remove()
    // enter + update
    elements
      .enter()
      .append('rect')
      .style('fill', function(d: any) {
        return d.color
      })
      .attr('y', function(d: any) {
        return d.y === null ? axis.height : axis.yScale(d.y)
      })
      .attr('height', function(d: any) {
        return d.y === null ? 0 : axis.height - axis.yScale(d.y)
      })

      .merge(elements)
      .attr('x', function(d: any) {
        return histScale(d.x)
      })
      .on('mouseover', function(d: any) {
        axis.showTooltip(d)
      })
      .on('mouseout', function(d: any) {
        axis.hideTooltip(d)
      })
      .attr('width', histScale.bandwidth())

    elements
      .transition(t)
      .style('fill', function(d: any) {
        return d.color
      })
      .attr('y', function(d: any) {
        return d.y === null ? axis.height : axis.yScale(d.y)
      })
      .attr('height', function(d: any) {
        return d.y === null ? 0 : axis.height - axis.yScale(d.y)
      })
  }

  plotterPolar(axis: PolarAxis, dataKeys: any) {
    console.error('plotterPolar is not implemented for ChartHistogram')
  }
}

import * as d3 from 'd3'
import { CartesianAxis, PolarAxis } from '../Axis'
import { Chart } from './chart'

export class ChartLine extends Chart {
  plotterCartesian(axis: CartesianAxis, dataKeys: any) {
    const xkey = dataKeys.xkey ? dataKeys.xkey : 'x'
    const ykey = dataKeys.ykey ? dataKeys.ykey : 'y'

    let mappedData = this.mapDataCartesian(axis, dataKeys)
    let lineGenerator = d3
      .line()
      .x(function(d: any) {
        return d.x
      })
      .y(function(d: any) {
        return d.y
      })
      .defined(function(d: any) {
        return d.y != null
      })

    this.group = this.selectGroup(axis, 'chart-line')
    if (this.group.select('path').size() === 0) {
      this.group.append('path')
    }

    let line = this.group.select('path')
    line
      .attr('d', lineGenerator(mappedData))
      .on('mouseover', function(d: any) {
        const v = { x: d[xkey], y: d[ykey] }
        axis.showTooltip(v)
      })
      .on('mouseout', function(d: any) {
        axis.hideTooltip(d)
      })
    line.datum(mappedData)
  }

  plotterPolar(axis: PolarAxis, dataKeys: any) {
    let mappedData = this.mapDataPolar(axis, dataKeys)
    const tkey = dataKeys.tkey ? dataKeys.tkey : 't'
    const rkey = dataKeys.rkey ? dataKeys.rkey : 'r'
    let line = d3
      .lineRadial()
      .angle(function(d: any) {
        return d.t
      })
      .radius(function(d: any) {
        return d.r
      })
    this.group = this.selectGroup(axis, 'chart-line')
    let elements = this.group.selectAll('path').data(this.data)

    // exit selection
    elements.exit().remove()

    // enter + update selection
    elements
      .enter()
      .append('path')
      .attr('d', line(mappedData))
      .on('mouseover', function(d: any) {
        const v = { r: d[rkey], t: d[tkey] }
        axis.showTooltip(v)
      })
      .on('mouseout', function(d: any) {
        axis.hideTooltip(d)
      })
      .merge(elements)

    let t = d3
      .transition()
      .duration(this.options.transitionTime)
      .ease(d3.easeLinear)

    elements.transition(t).attr('d', line(mappedData))
  }
}

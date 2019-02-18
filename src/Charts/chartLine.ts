import * as d3 from 'd3'
import { CartesianAxis, PolarAxis } from '../Axis'
import { Chart } from './chart'
import { map } from 'd3'

export class ChartLine extends Chart {
  plotterCartesian(axis: CartesianAxis, dataKeys: any) {
    const xkey = dataKeys.xkey ? dataKeys.xkey : 'x'
    const ykey = dataKeys.ykey ? dataKeys.ykey : 'y'

    let mappedData = this.mapDataCartesian(axis, dataKeys, axis.xScale.domain())
    let lineGenerator = d3
      .line()
      .x(function(d: any) {
        return axis.xScale(d.x)
      })
      .y(function(d: any) {
        return axis.yScale(d.y)
      })
      .defined(function(d: any) {
        return d.y != null
      })

    this.group = this.selectGroup(axis, 'chart-line')
    if (this.group.select('path').size() === 0) {
      this.group.append('path')
    }
    this.group
      .select('path')
      .datum(mappedData)
      .attr('d', lineGenerator)
  }

  plotterPolar(axis: PolarAxis, dataKeys: any) {
    let mappedData = this.mapDataPolar(axis, dataKeys)
    const tkey = dataKeys.tkey ? dataKeys.tkey : 't'
    const rkey = dataKeys.rkey ? dataKeys.rkey : 'r'
    let lineGenerator = d3
      .lineRadial()
      .angle(function(d: any) {
        return d.t
      })
      .radius(function(d: any) {
        return d.r
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
}

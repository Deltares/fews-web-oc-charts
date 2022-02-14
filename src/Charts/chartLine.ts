import * as d3 from 'd3'
import { CartesianAxis, PolarAxis } from '../Axis'
import { Chart } from './chart'

export class ChartLine extends Chart {
  plotterCartesian(axis: CartesianAxis, axisIndex: any) {

    const xKey = this.dataKeys.x
    const yKey = this.dataKeys.y
    const xScale = axis.xScale[axisIndex.x.axisIndex]
    const yScale = axis.yScale[axisIndex.y.axisIndex]

    const mappedData = this.mapDataCartesian(xScale.domain())
    const lineGenerator = d3
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
    this.group
      .select('path')
      .datum(mappedData)
      .attr('d', lineGenerator)
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  plotterPolar(axis: PolarAxis, axisIndex: any) {
    const rKey = this.dataKeys.radial
    const tKey = this.dataKeys.angular
    const lineGenerator = d3
      .lineRadial()
      .angle(function(d: any) {
        return axis.angularScale(d[tKey])
      })
      .radius(function(d: any) {
        return axis.radialScale(d[rKey])
      })
    this.group = this.selectGroup(axis, 'chart-line')
    if (this.group.select('path').size() === 0) {
      this.group.append('path')
    }
    const line = this.group.select('path')

    const t = d3
      .transition()
      .duration(this.options.transitionTime)
      .ease(d3.easeLinear)

    line.transition(t).attr('d', lineGenerator(this.data))
    line.datum(this.data)
  }

  drawLegendSymbol(legendId?: string, asSvgElement?: boolean) {
    const props = ['stroke', 'stroke-width', 'stroke-dasharray']
    const svg = d3.create('svg')
      .attr('width',20)
      .attr('height',20)
    const group = svg
      .append('g')
      .attr('transform','translate(0, 10)')
    const element = group.append('line')
      .attr('x1', 0)
      .attr('x2', 20)
      .attr('y1', 0)
      .attr('y2', 0)
    if (this.style === undefined) {
      const chartElement = this.group
      .select('path')
      .node() as Element
      const style = window.getComputedStyle(chartElement)
      for ( const key of props) {
        element.style(key, style.getPropertyValue('stroke'))
      }
    } else {
      for ( const key of props) {
        if ( this.style[key] ) element.style(key, this.style[key])
      }
    }
    if (asSvgElement) return element.node()
    return svg.node()
  }
}

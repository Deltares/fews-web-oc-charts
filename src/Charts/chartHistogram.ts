import * as d3 from 'd3'
import { CartesianAxis, PolarAxis } from '../Axis'
import { Chart, AUTO_SCALE } from './chart'
import { TooltipAnchor, TooltipPosition } from '../Tooltip'

export class ChartHistogram extends Chart {
  plotterCartesian(axis: CartesianAxis, axisIndex: any) {
    const xKey = this.dataKeys.x
    const yKey = this.dataKeys.y
    const colorKey = this.dataKeys.color
    const data = this.data
    const xScale = axis.xScale[axisIndex.x.axisIndex]
    const yScale = axis.yScale[axisIndex.y.axisIndex]

    const x1 = d3.scaleBand().domain(
      data.map(function(d: any) {
        return d[xKey]
      })
    )
    x1.range(xScale.range())
    x1.padding(0.05)

    const colorScale = d3.scaleLinear().domain([0, 1])
    if (this.options.colorScale === AUTO_SCALE) {
      colorScale.domain(
        d3.extent(this.data, function(d: any): number {
          return d[colorKey]
        })
      )
    }

    const colorMap = this.colorMap
    this.group = this.selectGroup(axis, 'chart-range')
    const t = d3
      .transition()
      .duration(this.options.transitionTime)
      .ease(d3.easeLinear)

    const elements: any = this.group.selectAll('rect').data(this.data)

    // remove
    elements.exit().remove()
    // enter + update
    const update = elements
      .enter()
      .append('rect')
      .attr('y', function(d: any) {
        return d[yKey] === null ? yScale(0) : Math.min(yScale(d[yKey]), yScale(0))
      })
      .attr('height', function(d: any) {
        return d[yKey] === null ? 0 : Math.abs(yScale(0) - yScale(d[yKey]))
      })
      .merge(elements)
      .attr('x', function(d: any) {
        return x1(d[xKey])
      })
      .attr('width', x1.bandwidth())

    if (this.options.tooltip !== undefined) {
      update
      .on('pointerover', function(_e: any, d) {
        axis.tooltip.show()
        if (this.options.tooltip.anchor !== undefined && this.options.tooltip.anchor !== TooltipAnchor.Top) {
          console.error('Tooltip not implemented for anchor ', this.options.tooltip.anchor, ', using ', TooltipAnchor.Top, ' instead.')
        }
        axis.tooltip.update(
          this.toolTipFormatterCartesian(d),
          this.options.tooltip.position !== undefined ? this.options.tooltip.position : TooltipPosition.Top,
          axis.margin.left + x1(d[xKey]) + x1.bandwidth() / 2 ,
          axis.margin.top + Math.min(yScale(d[yKey]), yScale(0))
        )
      })
      .on('pointerout', () => {
        axis.tooltip.hide()
      })
    }
    update.style('fill', function(d: any) {
      return colorMap(colorScale(d[colorKey]))
    })

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

  drawLegendSymbol(legendId?: string, asSvgElement?: boolean) {
    const props = ['fill']
    const source = this.group
      .select('rect')
      .node() as Element
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
    this.applyStyle(source, element, props)
    element
      .append('rect')
      .attr('x', 5)
      .attr('y', -6)
      .attr('width', 5)
      .attr('height', 16)
    this.applyStyle(source, element, props)
    element
      .append('rect')
      .attr('x', 10)
      .attr('y', -5)
      .attr('width', 5)
      .attr('height', 15)
    this.applyStyle(source, element, props)
    if (asSvgElement) return element.node()
    return svg.node()
  }
}

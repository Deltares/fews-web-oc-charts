import * as d3 from 'd3'
import { CartesianAxis, PolarAxis } from '../Axis'
import { Chart, AUTO_SCALE } from './chart'
import { TooltipAnchor, TooltipPosition } from '../Tooltip'

export class ChartMatrix extends Chart {
  static readonly GROUP_CLASS: 'chart-matrix'

  plotterCartesian(axis: CartesianAxis, axisIndex: any) {
    const xKey = this.dataKeys.x
    const yKey = this.dataKeys.y
    const colorKey = this.dataKeys.color
    const valueKey = this.dataKeys.value ?  this.dataKeys.value : this.dataKeys.color
    const data = this.data
    const xScale = axis.xScale[axisIndex.x.axisIndex]
    const yScale = axis.yScale[axisIndex.y.axisIndex]

    const x0 = xScale.copy()
    const y0 = yScale.copy()
    this.setPadding(x0, this.options.x)
    this.setPadding(y0, this.options.y)

    const colorScale = d3.scaleLinear().domain([0, 1])
    if (this.options.colorScale === AUTO_SCALE) {
      colorScale.domain(
        d3.extent(this.data, function(d: any): number {
          return d[colorKey]
        })
      )
    }

    const colorMap = this.getColorMap(colorScale)
    this.group = this.selectGroup(axis, ChartMatrix.GROUP_CLASS)
    d3
      .transition()
      .duration(this.options.transitionTime)

    const elements = this.group
      .selectAll("rect")
      .data(data)
      .join("rect")
        .attr('display', d => { return d[valueKey] === null ? 'none' : undefined })
        .attr("x", d => x0(d[xKey]))
        .attr("y", d => y0(d[yKey]))
        .attr("width", x0.bandwidth())
        .attr("height", y0.bandwidth())
        .attr("stroke-width", 0)
        .attr("shape-rendering", "auto")
        .attr("fill", d => d[colorKey] !== null ? colorMap(d[colorKey]) : 'none' )
    if (this.options.tooltip !== undefined) {
      elements
        .on('pointerover', (_e: any, d: any) => {
          if (this.options.tooltip.anchor !== undefined && this.options.tooltip.anchor !== TooltipAnchor.Top) {
            console.error('Tooltip not implemented for anchor ', this.options.tooltip.anchor, ', using ', TooltipAnchor.Top, ' instead.')
          }
          axis.tooltip.show()
          axis.tooltip.update(
            this.toolTipFormatterCartesian(d),
            this.options.tooltip.position !== undefined ? this.options.tooltip.position : TooltipPosition.Top,
            axis.margin.left + x0(d[xKey]) + x0.bandwidth() / 2 ,
            axis.margin.top + y0(d[yKey])
          )
        })
        .on('pointerout', () => {
          axis.tooltip.hide()
        })
      }

    if (this.options.text !== undefined) {
      const textSelection = this.group
        .selectAll("text")
        .data(data)
        .join("text")

      textSelection
        .attr("x", d => x0(d[xKey]) + x0.bandwidth()/2)
        .attr("y", d => y0(d[yKey]) + y0.bandwidth()/2)
        .attr("dx", this.options.text.dx)
        .attr("dy", this.options.text.dy)
        .text(d => {
          return this.options.text.formatter(d)
        })

      for (const [key, value] of Object.entries(this.options.text.attributes)) {
        textSelection
        .attr(key, value)
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  plotterPolar(axis: PolarAxis, dataKeys: any) {
    throw new Error('plotterPolar is not implemented for ChartMatrix')
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

  getColorMap(scale?: any): (x: number | Date) => string {
    if ( this.options.color?.map ) {
      return this.options.color?.map
    } else {
      return (value: any) => {
        return d3.scaleSequential(d3.interpolateWarm)(scale(value))
      }
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


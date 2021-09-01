import * as d3 from 'd3'
import { AxisIndex, CartesianAxis, PolarAxis } from '../Axis'
import { TooltipPosition } from '../Tooltip'
import { Chart, AUTO_SCALE } from './chart'

export class ChartBar extends Chart {
  static readonly GROUP_CLASS: 'chart-bar'

  plotterCartesian(axis: CartesianAxis, axisIndex: AxisIndex) {
    let xKey = this.dataKeys.x
    let yKey = this.dataKeys.y
    let x1Key = this.dataKeys.x1
    let colorKey = this.dataKeys.color
    let data = this.data
    const xScale = axis.xScale[axisIndex.x.axisIndex]
    const yScale = axis.yScale[axisIndex.y.axisIndex]

    const filterKeys: string[] = Array.from(new Set(data.map((item) => {return item[x1Key]}) ) )
    this.legend = filterKeys

    let x0 = xScale.copy()
    x0.domain(data.map(d => d[xKey]))

    let x1 = d3.scaleBand()
      .domain(filterKeys)
      .range([0, x0.bandwidth()])

    this.setPadding(x0, this.options.x)
    this.setPadding(x1, this.options.x1)

    let colorScale = d3.scaleLinear().domain([0, 1])
    if (this.options.colorScale === AUTO_SCALE) {
      colorScale.domain(
        d3.extent(this.data, function(d: any): number {
          return d[colorKey]
        })
      )
    }

    let colorMap = this.getColorMap(colorScale)
    this.group = this.selectGroup(axis, ChartBar.GROUP_CLASS)

    const that = this
    const bar = this.group
      .selectAll("rect")
      .data(data)
      .join("rect")
        .attr("data-legend-id", (d) => this.legendId( d[x1Key]))
        .attr("x", (d) => {return x0(d[xKey]) + x1(d[x1Key])})
        .attr('y', function(d: any) {
          return d[yKey] === null ? yScale(0) : Math.min(yScale(d[yKey]), yScale(0))
        })
        .attr("width", x1.bandwidth())
        .attr('height', function(d: any) {
          return d[yKey] === null ? 0 : Math.abs(yScale(0) - yScale(d[yKey]))
        })
        .attr("fill", d => d[colorKey] !== null ? colorMap(d[colorKey]) : 'none' )
        .on('pointerover', function(_e: any, d) {
          axis.tooltip.show()
          axis.tooltip.update(
            that.toolTipFormatterCartesian(d),
            TooltipPosition.Top,
            axis.margin.left + x0(d[xKey]) + x1(d[x1Key]) + x1.bandwidth() / 2 ,
            axis.margin.top + Math.min(yScale(d[yKey]), yScale(0))
          )
        })
        .on('pointerout', () => {
          axis.tooltip.hide()
        })

        bar.data(data)
        .order()
        .attr("x", d => x0(d[xKey]) + x1(d[x1Key]));

        if (this.options.text !== undefined) {
          const textSelection = this.group
            .selectAll("text")
            .data(data)
            .join("text")
    
          textSelection
            .attr("x", d =>  x0(d[xKey]) + x1(d[x1Key]) + x1.bandwidth() / 2)
            .attr("y", d => Math.min(yScale(d[yKey]), yScale(0)) )
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

  plotterPolar(axis: PolarAxis, dataKeys: any) {
    throw new Error('plotterPolar is not implemented for ChartBar')
  }

  drawLegendSymbol(legendId?: string, asSvgElement?: boolean) {
    let chartElement = this.group
      .select(`[data-legend-id="${legendId}"]`)
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
      .attr('x', 5)
      .attr('y', -5)
      .attr('width', 10)
      .attr('height', 10)
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


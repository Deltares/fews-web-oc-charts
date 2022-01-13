import * as d3 from 'd3'
import { Axis, CartesianAxis } from '../Axis'
import { scaleBeaufort } from '../Scale';
import { Visitor } from './visitor'
import { Property } from 'csstype'

export interface BeaufortAxisOptions {
  x?: {
    axisIndex: number;
  };
  y?: {
    axisIndex: number;
  };
  colors: Record<string, Property.Color>
}

export class BeaufortAxis implements Visitor {
  private group: any
  private axis: CartesianAxis
  private options: any
  private isVertical = true

  constructor(options: BeaufortAxisOptions) {
    this.options = options
  }

  visit(axis: Axis): void {
    this.axis = axis as CartesianAxis
    this.create(axis as CartesianAxis)
  }

  create(axis: CartesianAxis): void {
    this.isVertical = this.options.x === undefined
    this.group = axis.canvas
    .insert('g','.group')
    if (this.isVertical) {
      this.group.attr('class', 'axis y2-axis')
    } else {
      this.group.attr('class', 'axis x2-axis')
    }
    this.group.attr('pointer-events', 'none')
    this.redraw()
  }

  redraw(): void {
    const axis = this.axis
    const sourceScale = this.isVertical ? this.axis.yScale[0] : this.axis.xScale[0]
    const windSpeedDomain = sourceScale.domain()
    const domain = scaleBeaufort.domain()
    domain.unshift(windSpeedDomain[0])
    const limits = domain.filter( (x: number) => {
      return windSpeedDomain[0] <= x && windSpeedDomain[1] > x
    })

    const limitsInPixels = limits.map( (x) => { return sourceScale(x) })
    const beaufortLimits = limits.map( (x) => { return scaleBeaufort(x) })
    const scale = d3.scaleLinear();

    scale.domain(beaufortLimits)
    scale.range(limitsInPixels)

    const beaufortAxis = this.isVertical ?  d3.axisRight(scale) : d3.axisTop(scale)

    beaufortAxis.tickValues(beaufortLimits)
    beaufortAxis.tickFormat( (v) => { return v === 0 ? "" : d3.format(".0f")(v) })

    const adjustTextLabels = (selection) => {
      const text = selection.selectAll('.tick text')
      const values = text.data().map((x) => scale(x))
      if (this.isVertical) {
        values.push(0)
      } else {
        values.push(this.axis.width)
      }
      const offset = ( i ) => { return (values[i+1] - values[i])/2}
      text
        .attr('transform', (d, i) => { return this.isVertical ? `translate(0,${offset(i)})` : `translate( ${offset(i)} ,0)`});
    }

    const translate = this.isVertical ? `translate(${axis.width},0)` : 'translate(0,0)'
    const ticks = this.group
      .attr('transform', translate)
      .call(beaufortAxis)
      .call(adjustTextLabels)

    const isVertical = this.isVertical
    const colors = this.options.colors === undefined ? {} : this.options.colors
    ticks.selectAll('.tick').each(function(d, i) {
      if ( d3.select(this).select('rect').size() === 0) {
        d3.select(this).append('rect')
      }
      const sections = d3.select(this).select('rect')
      let width = isVertical ? axis.width - 1: scale(d+1) - scale(d)
      let height = isVertical ? scale(d) - scale(d+1) : axis.height-1
      if (!this.nextSibling) {
        height = isVertical ? scale(d) : axis.height-1
        width = isVertical ? axis.width - 1: axis.width - scale(d)
      }
      const x = isVertical ? -width : 0
      const y = isVertical ? -height : 1

      sections
        .attr("width", width)
        .attr("x", x)
        .attr("y", y)
        .attr("height", height)
        .style("fill", colors[d] ? colors[d] : 'none' )
    })
  }
}

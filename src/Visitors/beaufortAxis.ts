import * as d3 from 'd3'
import { Axis, CartesianAxis } from '../Axis'
import { scaleBeaufort } from '../Scale';
import { Visitor } from './visitor'

export interface BeaufortAxisOptions {
  x?: {
    axisIndex: number;
  };
  y?: {
    axisIndex: number;
  };
}

export class BeaufortAxis implements Visitor {
  private group: any
  private axis: CartesianAxis
  private options: any

  constructor(options: BeaufortAxisOptions) {
    this.options = options
  }

  visit(axis: Axis): void {
    this.axis = axis as CartesianAxis
    this.create(axis as CartesianAxis)
  }

  create(axis: CartesianAxis): void {
    this.group = d3
    axis.canvas
      .append('g')
      .attr('class', 'axis x2-axis')
      .attr('transform', `translate(0,0)`)
    this.redraw()
  }

  redraw(): void {
    const windSpeedDomain = this.axis.xScale[0].domain()
    const limits = scaleBeaufort.domain().filter( (x: number) => {
      return windSpeedDomain[0] < x && windSpeedDomain[1] > x
    })
    const limitsInPixels = limits.map( (x) => { return this.axis.xScale[0](x) })
    const beaufortLimits = limits.map( (x) => { return scaleBeaufort(x) })
    const scale = d3.scaleLinear();

    scale.domain(beaufortLimits)
    scale.range(limitsInPixels)

    const beaufortAxis = d3
      .axisTop(scale)

    const adjustTextLabels = (selection) => {
      const text = selection.selectAll('.tick text')
      const values = text.data().map((x) => scale(x))
      values.push(this.axis.width)
      const offset = ( i ) => { return (values[i+1] - values[i])/2}
      text
        .attr('transform', (d, i) => { return `translate( ${offset(i)} ,0)`});
    }

    this.group
      .select('.x2-axis')
      .call(beaufortAxis)
      .call(adjustTextLabels)
  }
}

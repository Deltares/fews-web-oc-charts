import * as d3 from 'd3'
import { Axis, CartesianAxis } from '../Axis'
import { Visitor } from './visitor'

export class LevelSelect implements Visitor {
  group: any
  line: any
  axis: CartesianAxis
  value: number
  callback: Function
  format: any

  constructor(value: number, callback: Function) {
    this.value = value
    this.callback = callback
    this.format = d3.format('.2f')
  }

  visit(axis: Axis) {
    this.axis = axis as CartesianAxis
    this.create(axis as CartesianAxis)
  }

  create(axis: CartesianAxis) {
    if (!this.group) {
      this.group = axis.canvas.append('g').attr('class', 'level-select')
      this.group.append('line')
      let that = this
      this.group
        .append('polygon')
        .attr('points', '0,0 -5,-5 -8,-5 -8,5 -5,5')
        .attr('class', 'level-select-handle')
        .call(
          d3
            .drag()
            .on('start', function() {
              that.start(d3.event)
            })
            .on('drag', function() {
              that.drag(d3.event)
            })
            .on('end', function() {
              that.end(d3.event)
            })
        )
    }
    this.redraw()
  }

  redraw() {
    let y = this.axis.yScale(this.value)
    // line
    this.group
      .select('line')
      .attr('x1', 0)
      .attr('x2', this.axis.width)
      .attr('transform', 'translate( 0, ' + y + ')')
    // text
    this.group
      .select('text')
      .attr('y', y)
      .text(this.format(this.value))
    // handle
    this.group.select('polygon').attr('transform', 'translate( 0, ' + y + ')')
  }

  start(event) {
    this.value = this.axis.yScale.invert(event.y)
    this.group
      .append('text')
      .attr('x', 0)
      .attr('y', event.y)
      .attr('dx', 10)
      .attr('dy', -5)
      .text(this.format(this.value))
    this.redraw()
  }

  drag(event) {
    this.value = this.axis.yScale.invert(event.y)
    this.redraw()
  }

  end(event) {
    this.group.select('text').remove()
    this.callback(this.value)
  }
}

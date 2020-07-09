import * as d3 from 'd3'
import { Axis, CartesianAxis } from '../Axis'
import { Visitor } from './visitor'
import defaultsDeep from 'lodash/defaultsDeep'

type LevelSelectOptions = {
  [key in 'x' | 'y'] : { axisIndex: number }
}

export class LevelSelect implements Visitor {
  group: any
  line: any
  axis: CartesianAxis
  value: number
  callback: Function
  format: any
  options: LevelSelectOptions

  // use shared Visitor constuctor (Visitor should be a abstract class)
  constructor(value: number, callback: Function, options: LevelSelectOptions) {
    this.value = value
    this.callback = callback
    this.format = d3.format('.2f')
    defaultsDeep(this.options,
      options,
      {
        y: { axisIndex : 0 }
      },
    ) as LevelSelectOptions
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
    const axisIndex = this.options.y.axisIndex
    const scale = this.axis.yScale[axisIndex]
    let y = scale(this.value)
    y = (y === undefined) ? scale.range()[1] : y
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
    const axisIndex = this.options.y.axisIndex
    const scale = this.axis.yScale[axisIndex]
    this.value = scale.invert(event.y)
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
    const axisIndex = this.options.y.axisIndex
    const scale = this.axis.yScale[axisIndex]
    this.value = scale.invert(event.y)
    this.redraw()
  }

  end(event) {
    this.group.select('text').remove()
    if (typeof this.callback === 'function') {
      this.callback(this.value)
    }
  }
}

import * as d3 from 'd3'
import { Axis, CartesianAxis } from '../Axis'
import { Visitor } from './visitor'
import defaultsDeep from 'lodash/defaultsDeep'


type CrossSectionSelectOptions = {
  x : { axisIndex: number }
}

export class CrossSectionSelect implements Visitor {
  group: any
  line: any
  axis: CartesianAxis
  value: number
  callback: Function
  format: Function
  options: CrossSectionSelectOptions = {
    x: { axisIndex : 0 }
  }

  // use shared Visitor constuctor (Visitor should be a abstract class)
  constructor(value: number, callback: Function, options: CrossSectionSelectOptions) {
    this.value = value
    this.callback = callback
    this.format = d3.format('.2f')
    this.options = defaultsDeep(this.options,
      options
    ) as CrossSectionSelectOptions
  }

  visit(axis: Axis) {
    this.axis = axis as CartesianAxis
    this.create(axis as CartesianAxis)
  }

  create(axis: CartesianAxis) {
    if (!this.group) {
      this.group = axis.canvas.append('g').attr('class', 'cross-section-select')
      this.group.append('line')
      this.group
        .append('polygon')
        .attr('points', '0,0 -5,5 -5,8 5,8 5,5')
        .attr('class', 'cross-section-select-handle')
        .call(
          d3
            .drag()
            .on('start', (event) => {
              this.start(event)
            })
            .on('drag', (event) => {
              this.drag(event)
            })
            .on('end', (event) => {
              this.end()
            })
        )
    }
    this.redraw()
  }

  redraw() {
    const axisIndex = this.options.x.axisIndex
    const scale = this.axis.xScale[axisIndex]
    let x = scale(this.value)
    x = (x === undefined) ? scale.range()[1] : x
    let timeString = this.format(this.value)
    // line
    this.group
      .select('line')
      .attr('y1', 0)
      .attr('y2', this.axis.height)
      .attr('transform', 'translate(' + x + ', 0)')
    // text
    this.group
      .select('text')
      .attr('x', x)
      .text(timeString)
    // handle
    this.group.select('polygon').attr('transform', 'translate(' + x + ',' + this.axis.height + ')')
  }

  start(event) {
    const axisIndex = this.options.x.axisIndex
    const scale = this.axis.xScale[axisIndex]
    this.value = scale.invert(event.x)
    this.group
      .append('text')
      .attr('x', event.x)
      .attr('y', this.axis.height)
      .attr('dx', 10)
      .attr('dy', -5)
      .text(this.format(this.value))
    this.redraw()
  }

  drag(event) {
    const axisIndex = this.options.x.axisIndex
    const scale = this.axis.xScale[axisIndex]
    this.value = scale.invert(event.x)
    this.redraw()
  }

  end() {
    this.group.select('text').remove()
    if (typeof this.callback === 'function') {
      this.callback(this.value)
    }
  }
}

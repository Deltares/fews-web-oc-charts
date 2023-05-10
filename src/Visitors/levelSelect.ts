import * as d3 from 'd3'
import { Axes } from '../Axes/axes.js'
import { CartesianAxes } from '../index.js';
import { Visitor } from './visitor.js'
import { defaultsDeep } from 'lodash-es'

type LevelSelectOptions = {
  y: { axisIndex: number }
}

export class LevelSelect implements Visitor {
  group: any
  line: any
  axis: CartesianAxes
  value: number
  callback: Function
  format: any
  options: LevelSelectOptions = {
    y: { axisIndex: 0 }
  }

  // use shared Visitor constuctor (Visitor should be a abstract class)
  constructor(value: number, callback: Function, options: LevelSelectOptions) {
    this.value = value
    this.callback = callback
    this.format = d3.format('.2f')
    this.options = defaultsDeep(this.options,
      options
    ) as LevelSelectOptions
  }

  visit(axis: Axes) {
    this.axis = axis as CartesianAxes
    this.create(axis as CartesianAxes)
  }

  create(axis: CartesianAxes) {
    if (!this.group) {
      this.group = axis.canvas.append('g').attr('class', 'level-select')
      this.group.append('line')
      this.group
        .append('polygon')
        .attr('points', '0,0 -5,-5 -8,-5 -8,5 -5,5')
        .attr('class', 'level-select-handle')
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
              this.end(event)
            })
        )
    }
    this.redraw()
  }

  redraw() {
    const axisIndex = this.options.y.axisIndex
    const scale = this.axis.yScales[axisIndex]
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
    const scale = this.axis.yScales[axisIndex]
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
    const scale = this.axis.yScales[axisIndex]
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

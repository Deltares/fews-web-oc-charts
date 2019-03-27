import * as d3 from 'd3'
import { Axis, CartesianAxis } from '../Axis'
import * as WB from '../Utils'
import { Visitor } from './visitor'

export class CurrentTime implements Visitor {
  private timer: d3.Timer
  private group: any
  private line: any
  private indicator: any
  private axis: CartesianAxis
  private transition: any
  static readonly REFRESH_INTERVAL: number = 10000

  constructor() {}

  visit(axis: Axis) {
    this.axis = axis as CartesianAxis
    this.create(axis as CartesianAxis)
    let that = this
    this.timer = d3.interval(function(elapsed: number) {
      that.redraw()
    }, CurrentTime.REFRESH_INTERVAL)
  }

  create(axis: CartesianAxis) {
    if (!this.group) {
      this.group = axis.canvas.append('g').attr('class', 'current-time')
      this.line = this.group.append('line').attr('class', 'current-time')
    }
    this.redraw()
  }

  redraw() {
    let currentDate = new Date()
    let x = this.axis.xScale(currentDate)
    let domain = this.axis.xScale.domain()
    if (!this.line) {
      this.line = this.group.append('line')
    }
    if (currentDate < domain[0] || currentDate > domain[1]) {
      this.group.attr('display', 'none')
    } else {
      this.group.attr('display', 'initial')
      this.line
        .attr('x1', x)
        .attr('x2', x)
        .attr('y1', this.axis.height)
        .attr('y2', 0)
      if (!this.indicator) {
        this.indicator = this.group.append('g').attr('class', 'current-time-indicator')
        this.indicator.append('polygon').attr('points', '0,0 5,5 -5,5')
        this.indicator.append('text')
      }
      this.indicator.attr('transform', 'translate(' + x + ',' + this.axis.height + ')')
      let timezone = 'Etc/GMT' + this.axis.timeZoneOffset / 60
      let options = {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        timeZone: timezone,
        timeZoneOffset: this.axis.timeZoneOffset
      }
      let dateFormatter = WB.dateFormatter('nl-NL', options)
      this.indicator
        .select('text')
        .attr('x', 5)
        .attr('y', -5)
        .text(dateFormatter(currentDate))
    }
  }
}

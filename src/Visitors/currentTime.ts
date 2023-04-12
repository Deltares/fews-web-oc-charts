import * as d3 from 'd3'
import { Axes } from '../Axes/axes.js'
import { CartesianAxes } from '../index.js';
import { dateFormatter } from '../Utils/date.js'
import { Visitor } from './visitor.js'

type CurrentTimeOptions = {
  [key in 'x' | 'y']: { axisIndex: number }
}

export class CurrentTime implements Visitor {
  private group: any
  private line: any
  private indicator: any
  private axis: CartesianAxes
  private options: CurrentTimeOptions
  private datetime: Date
  static readonly REFRESH_INTERVAL: number = 10000

  constructor(options?) {
    this.datetime = null
    this.options = options
  }

  setDateTime(dt: Date): void {
    this.datetime = dt
  }

  visit(axis: Axes) {
    this.axis = axis as CartesianAxes
    this.create(axis as CartesianAxes)
    this.redraw()
    d3.interval(() => {
      this.redraw()
    }, CurrentTime.REFRESH_INTERVAL)
  }

  create(axis: CartesianAxes) {
    const front = axis.canvas.select('.front')
    this.group = front.append('g').attr('class', 'current-time')
    this.line = this.group.append('line').attr('class', 'current-time')
    this.redraw()
  }

  redraw() {
    const currentDate = this.datetime || new Date()
    let scale
    if (this.options.x) {
      const index = this.options.x.axisIndex
      scale = this.axis.xScale[index]
    } else if (this.options.y) {
      const index = this.options.y.axisIndex
      scale = this.axis.yScale[index]
    } else {
      return
    }

    const x = scale(currentDate)
    const domain = scale.domain()
    if (!this.line) {
      this.line = this.group.append('line')
    }
    if (currentDate > domain[0] && currentDate < domain[1]) {
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
      const axisIndex = this.options.x.axisIndex
      this.indicator
        .select('text')
        .attr('x', 5)
        .attr('y', -5)
        .text(dateFormatter(currentDate, 'yyyy-MM-dd HH:mm ZZZZ', { timeZone: this.axis.options.x[axisIndex].timeZone, locale: this.axis.options.x[axisIndex].locale }))
    } else {
      this.group.attr('display', 'none')
    }
  }
}

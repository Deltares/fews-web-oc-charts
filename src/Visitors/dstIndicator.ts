import { Axis, CartesianAxis, AxisType } from '../Axis'
import { Visitor } from './visitor'
import { DateTime, Duration } from 'luxon'
import defaultsDeep from 'lodash/defaultsDeep'

type DstIndicatorOptions = { x: { axisIndex: number } } | { y: { axisIndex: number } }

export class DstIndicator implements Visitor {
  private group: any
  private indicator: any
  private axis: CartesianAxis
  private dstDate: Date
  private options: DstIndicatorOptions

  // tslint:disable-next-line:no-empty
  constructor(options: DstIndicatorOptions ) {
    this.options = defaultsDeep({},
      options,
      {
        x: { axisIndex : 0 }
      },
    ) as DstIndicatorOptions
  }

  visit(axis: Axis) {
    this.axis = axis as CartesianAxis
    if ("x" in this.options) {
      let axisIndex = this.options.x.axisIndex
      if (this.axis.options.x[axisIndex] && this.axis.options.x[axisIndex].type === AxisType.time) {
        this.create(axis as CartesianAxis)
      } else {
        throw new Error (`x-axis [${axisIndex}] does not exist or is not of type 'time'`)
      }
    }
  }

  create(axis: CartesianAxis) {
    if (!this.group) {
      this.group = axis.canvas.append('g').attr('class', 'dst-indicator')
    }
    this.redraw()
  }

  redraw() {
    if ("x" in this.options) {
      const axisIndex = this.options.x.axisIndex
      const scale = this.axis.xScale[axisIndex]
      const domain = scale.domain()
      let startDate = DateTime.fromJSDate(domain[0]).setZone(this.axis.options.x[axisIndex].timeZone)
      let endDate = DateTime.fromJSDate(domain[1]).setZone(this.axis.options.x[axisIndex].timeZone)
      if (startDate.isInDST !== endDate.isInDST ) {
        this.dstDate = this.findDst(startDate, endDate)
        let x = scale(this.dstDate)
          this.group.attr('display', 'initial')
          if (!this.indicator) {
            this.indicator = this.group.append('g').attr('class', 'dst-indicator')
            this.indicator.append('polygon').attr('points', '0,0 6,6 -6,6')
            this.indicator.append('text')
          }
          this.indicator.attr('transform', 'translate(' + x + ',' + this.axis.height + ')')
          this.indicator
            .select('text')
            .attr('x', 5)
            .attr('y', -5)
            .attr('text-anchor','middle')
            .text('dst transition')

      } else {
        this.group.attr('display', 'none')
      }
    }
  }

  findDst(startDate: DateTime, endDate: DateTime) : Date {
    let d1 = startDate
    let d2 = endDate
    let duration = d2.diff(d1)
    while (duration.as('minutes') > 1) {
      let intermediate = d1.plus(Duration.fromMillis(duration.valueOf()/2))
      if (d1.offset === intermediate.offset ) {
        d1 = intermediate
      } else {
        d2 = intermediate
      }
      duration = duration = d2.diff(d1)

    }
    return d2.set({ second: 0 }).toJSDate()
  }


}

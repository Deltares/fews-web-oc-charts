import { Axis, CartesianAxis } from '../Axis'
import { dateFormatter }  from '../Utils'
import { Visitor } from './visitor'
import momenttz from 'moment-timezone';

export class DstIndicator implements Visitor {
  private group: any
  private indicator: any
  private axis: CartesianAxis
  private dstDate: Date

  // tslint:disable-next-line:no-empty
  constructor() {}

  visit(axis: Axis) {
    this.axis = axis as CartesianAxis
    if (this.axis.options.x && this.axis.options.x.time) {
      this.create(axis as CartesianAxis)
    }
  }

  create(axis: CartesianAxis) {
    if (!this.group) {
      this.group = axis.canvas.append('g').attr('class', 'dst-indicator')
    }
    this.redraw()
  }

  redraw() {
    let domain = this.axis.xScale.domain()
    let startMoment = momenttz(domain[0]).tz(this.axis.timeZone)
    let endMoment = momenttz(domain[1]).tz(this.axis.timeZone)
    if (startMoment.isDST() !== endMoment.isDST() ) {
      this.dstDate = this.findDst(startMoment,endMoment)
      let x = this.axis.xScale(this.dstDate)
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

  findDst(startMoment, endMoment) : Date {
    let m1 = startMoment.clone()
    let m2 = endMoment.clone()
    let duration = momenttz.duration(m2.diff(m1)).asMinutes()
    while (duration > 1) {
      let intermediate = m1.clone().add(duration/2, "minutes")
      if (m1.utcOffset() === intermediate.utcOffset() ) {
        m1 = intermediate
      } else {
        m2 = intermediate
      }
      duration = momenttz.duration(m2.diff(m1)).asMinutes()
    }
    console.log(m2.utcOffset()-m1.utcOffset())
    return m2.seconds(0).toDate()
  }


}

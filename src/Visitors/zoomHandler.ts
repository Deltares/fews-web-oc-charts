import * as d3 from 'd3'
import { Axis, CartesianAxis } from '../Axis'
import { Visitor } from './visitor'
import { ChartLine, ChartArea } from '../Charts'

export class ZoomHandler implements Visitor {
  // private brush: any
  private brushStartPoint: any
  private svg: any
  private brushEnded: any

  constructor() {
    console.log('zoom')
    this.brushStartPoint = null
  }

  visit(axis: Axis) {
    this.createHandler(axis as CartesianAxis)
  }

  createHandler(axis: CartesianAxis) {
    let x0 = axis.xScale.domain()
    let y0 = axis.yScale.domain()

    this.brushEnded = function() {
      let idleTimeout
      let idleDelay = 350
      function idled() {
        idleTimeout = null
      }
      let s = d3.event.selection
      if (!s) {
        if (!idleTimeout) return (idleTimeout = setTimeout(idled, idleDelay))
        axis.xScale.domain(x0)
        axis.yScale.domain(y0)
      } else {
        let x = axis.xScale
        let y = axis.yScale
        axis.xScale.domain([s[0][0], s[1][0]].map(x.invert, x))
        axis.yScale.domain([s[1][1], s[0][1]].map(y.invert, y))
        this.brushSvg.call(brush.move, null)
      }
      axis.zoom()
    }
    let brush = d3
      .brush()
      .extent([[0, 0], [axis.width, axis.height]])
      .on('end', () => {
        this.brushEnded()
      })
      .on('start.nokey', function() {
        d3.select(window).on('keydown.brush keyup.brush', null)
      })

    this.svg = axis.canvas
      .append('g')
      .attr('class', 'brush')
      .call(brush)
  }
}

import * as d3 from 'd3'
import { Axis, CartesianAxis } from '../Axis'
import { Visitor } from './visitor'

export class WarningLevels implements Visitor {
  private escalationLevels: any[]
  private group: any
  private axis: CartesianAxis
  private scale: any
  private warningAxis: any
  private sections: any

  constructor() {
    this.escalationLevels = [
      { id: 'normaal', val: -100, color: 'rgba(205, 133, 63,.5)', c: '<' },
      { id: 'verhoogd', val: 100, color: 'rgba(255, 215, 0,.5)', c: '>' },
      { id: 'hoog', val: 110, color: 'rgba(255, 150, 0,.5)', c: '>' },
      { id: 'extreem', val: 140, color: 'rgba(255, 0, 0,.5)', c: '>' }
    ]
  }

  visit(axis: Axis) {
    this.axis = axis as CartesianAxis
    this.create(axis as CartesianAxis)
  }

  create(axis: CartesianAxis) {
    if (!this.scale) {
      this.scale = d3.scaleLinear()
    }
    this.scale.domain(axis.yScale.domain()).range(axis.yScale.range())

    if (!this.warningAxis) {
      this.warningAxis = d3
        .axisRight(this.scale)
        .tickValues([-100, 100, 110, 140])
        .tickFormat(function(d, i) {
          return escalationLevels[i].id
        })
    }

    if (!this.group) {
      this.group = d3
      axis.canvas
        .append('g')
        .attr('class', 'axis y2-axis')
        .attr('transform', 'translate(' + axis.width + ' ,0)')
    }

    this.group.select('.y2-axis').attr('transform', 'translate(' + axis.width + ' ,0)')

    let escalationLevels = this.escalationLevels

    let axisHandle = axis.canvas.select('.y2-axis').call(this.warningAxis)
    axisHandle
      .selectAll('.tick text')
      .append('title')
      .attr('class', 'tooltip')
      .text(function(d, i) {
        return 'waarschuwing waardes' + escalationLevels[i].c + '' + d
      })

    if (!this.sections) {
      this.sections = this.axis.canvas
        .select('.axis-canvas')
        .append('g')
        .attr('class', 'warning-sections')
      this.sections
        .selectAll('rect')
        .data(this.warningAxis.tickValues())
        .enter()
        .append('rect')
    }

    this.redraw()
  }

  redraw() {
    let escalationLevels = this.escalationLevels

    let that = this
    let escY = function(d, i) {
      if (escalationLevels[i].c === '<') {
        return that.scale(d)
      } else {
        if (i === escalationLevels.length - 1) return 0
        return that.scale(escalationLevels[i + 1].val)
      }
    }

    let escHeight = function(d, i) {
      if (escalationLevels[i].c === '<') {
        if (i === 0) return that.axis.height - that.scale(d)
        return that.scale(escalationLevels[i - 1].val) - that.scale(d)
      } else {
        if (i === escalationLevels.length - 1) return that.scale(d)
        return that.scale(d) - that.scale(escalationLevels[i + 1].val)
      }
    }
    let escFill = function(d, i) {
      return escalationLevels[i].color
    }

    this.sections
      .selectAll('rect')
      .attr('y', escY)
      .attr('width', this.axis.width)
      .attr('height', escHeight)
      .attr('fill', escFill)
  }
}

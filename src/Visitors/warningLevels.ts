import * as d3 from 'd3'
import { Axis, CartesianAxis } from '../Axis'
import { Visitor } from './visitor'

export class WarningLevels implements Visitor {
  private escalationLevels: any[]

  constructor() {
    this.escalationLevels = [
      { id: 'normaal', val: -100, color: 'rgba(205, 133, 63,.5)', c: '<' },
      { id: 'verhoogd', val: 100, color: 'rgba(255, 215, 0,.5)', c: '>' },
      { id: 'hoog', val: 110, color: 'rgba(255, 150, 0,.5)', c: '>' },
      { id: 'extreem', val: 140, color: 'rgba(255, 0, 0,.5)', c: '>' }
    ]
  }

  visit(axis: Axis) {
    this.create(axis as CartesianAxis)
  }

  create(axis: CartesianAxis) {
    var escalationsScale = d3
      .scaleLinear()
      .domain(axis.yScale.domain())
      .range(axis.yScale.range())
    var escalations = axis.canvas
      .append('g')
      .attr('transform', 'translate(' + axis.width + ' ,0)')
      .attr('class', 'axis y2-axis')
    let escalationLevels = this.escalationLevels
    var escalationsAxis = d3
      .axisRight(escalationsScale)
      .tickValues([-100, 100, 110, 140])
      .tickFormat(function(d, i) {
        return escalationLevels[i].id
      })
    var axisHandle = axis.canvas.select('.y2-axis').call(escalationsAxis)
    axisHandle
      .selectAll('.tick text')
      .append('title')
      .attr('class', 'tooltip')
      .text(function(d, i) {
        return 'waarschuwing waardes' + escalationLevels[i].c + '' + d
      })

    var sections = axis.canvas
      .select('.axis-canvas')
      .append('g')
      .selectAll('rect')
      .data(escalationsAxis.tickValues())

    var escY = function(d, i) {
      if (escalationLevels[i].c == '<') {
        return escalationsScale(d)
      } else {
        if (i == escalationLevels.length - 1) return 0
        return escalationsScale(escalationLevels[i + 1].val)
      }
    }

    var escHeight = function(d, i) {
      if (escalationLevels[i].c == '<') {
        if (i == 0) return axis.height - escalationsScale(d)
        return escalationsScale(escalationLevels[i - 1].val) - escalationsScale(d)
      } else {
        if (i == escalationLevels.length - 1) return escalationsScale(d)
        return escalationsScale(d) - escalationsScale(escalationLevels[i + 1].val)
      }
    }
    var escFill = function(d, i) {
      return escalationLevels[i].color
    }

    sections
      .enter()
      .append('rect')
      .merge(sections)
      .attr('y', escY)
      .attr('width', axis.width)
      .attr('height', escHeight)
      .attr('fill', escFill)
  }
}

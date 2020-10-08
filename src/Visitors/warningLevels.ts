import * as d3 from 'd3'
import { Axis, CartesianAxis } from '../Axis'
import { Visitor } from './visitor'

export interface WarningLevelOptions {
  y?: {
    axisIndex: number;
  };
}


export class WarningLevels implements Visitor {
  private escalationLevels: any[]
  private group: any
  private axis: CartesianAxis
  private scale: any
  private warningAxis: any
  private sections: any
  private transitionTime: number
  private options: any

  constructor(escalationLevels, options: WarningLevelOptions) {
    this.escalationLevels = escalationLevels
    this.transitionTime = 0
    this.options = {
      ...{
        y: { axisIndex: 0 }
      },
      ...options
    }
  }

  visit(axis: Axis) {
    this.axis = axis as CartesianAxis
    this.create(axis as CartesianAxis)
  }

  create(axis: CartesianAxis) {
    let scale = (this.scale = d3.scaleLinear())
    this.scale.domain(axis.yScale[this.options.y.axisIndex].domain()).range(axis.yScale[this.options.y.axisIndex].range())
    let escalationLevels = this.escalationLevels

    let tickValues = escalationLevels
      .filter(function(el) {
        let domain = scale.domain()
        return el.val >= domain[0] && el.val <= domain[1]
      })
      .map(function(el) {
        return el.val
      })

    this.warningAxis = d3
      .axisRight(this.scale)
      .tickValues(tickValues)
      .tickFormat(function(d, i) {
        let level
        for (level of escalationLevels) {
          if (level.val === d) break
        }
        return level.id
      })

    this.group = d3
    axis.canvas
      .append('g')
      .attr('class', 'axis y2-axis')
      .attr('transform', 'translate(' + axis.width + ' ,0)')

    let axisHandle = axis.canvas.select('.y2-axis').call(this.warningAxis)
    axisHandle
      .selectAll('.tick text')
      .append('title')
      .attr('class', 'tooltip')
      .text(function(d, i) {
        return 'waarschuwing waardes' + escalationLevels[i].c + '' + d
      })

    this.sections = this.axis.canvas
      .select('.axis-canvas')
      .append('g')
      .attr('class', 'warning-sections')

    this.redraw()
  }

  redraw() {
    let escalationLevels = this.escalationLevels
    let scale = this.axis.yScale[0].copy()
    let tickValues = escalationLevels
      .filter(function(el) {
        let domain = scale.domain()
        return el.val >= domain[0] && el.val <= domain[1]
      })
      .map(function(el) {
        return el.val
      })

    this.warningAxis.tickValues(tickValues)
    this.warningAxis.scale(scale)

    let transition = d3.transition().duration(this.transitionTime)
    this.group
      .select('.y2-axis')
      .attr('transform', 'translate(' + this.axis.width + ' ,0)')
      .transition(transition)
      .call(this.warningAxis)

    let that = this
    let escY = function(d, i) {
      if (d.c === '<') {
        return scale(d.val)
      } else {
        if (i === escalationLevels.length - 1) return 0
        return scale(escalationLevels[i + 1].val)
      }
    }

    let escHeight = function(d, i) {
      if (d.c === '<') {
        if (i === 0) return Math.max(0, that.axis.height - scale(d.val))
        return Math.max(0, scale(escalationLevels[i - 1].val) - scale(d.val))
      } else {
        if (i === escalationLevels.length - 1) return Math.max(0, scale(d.val))
        return Math.max(0, scale(d.val) - scale(escalationLevels[i + 1].val))
      }
    }

    let rects = this.sections
      .selectAll('rect')
      .data(this.escalationLevels)

    rects
      .enter()
      .append('rect')
      .merge(rects)
      .attr('y', escY)
      .attr('width', this.axis.width)
      .attr('height', escHeight)
      .attr('fill', d => d.color)

    rects.exit().remove()
  }
}

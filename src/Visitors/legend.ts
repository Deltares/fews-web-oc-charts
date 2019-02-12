import * as d3 from 'd3'
import { Axis, CartesianAxis } from '../Axis'
import { Visitor } from './visitor'
import { ChartLine, ChartArea } from '../Charts'

export class Legend implements Visitor {
  private container: HTMLElement
  private labels: any
  private svg: any
  private group: any
  private axis: CartesianAxis

  constructor(labels: any, container?: HTMLElement) {
    this.container = container
    this.labels = labels
    this.svg = d3
      .select(container)
      .append('svg')
      .attr('class', 'legend')
    this.group = this.svg.append('g')
  }

  visit(axis: Axis) {
    this.axis = axis as CartesianAxis
    this.redraw()
  }

  redraw() {
    this.svg
      .attr('width', this.axis.margin.left + this.axis.width + this.axis.margin.right)
      .attr('height', 100)
    this.group.attr('transform', 'translate(' + this.axis.margin.left + ', 0)')
    let dx = Math.round(this.axis.width / Object.keys(this.labels).length)
    this.group.selectAll('g').remove()
    let entries = this.group.selectAll('g').data(this.labels)
    let that = this
    let enter = entries
      .enter()
      .append('g')
      .attr('class', 'legend-entry')
      .merge(entries)
      .attr('transform', function(d, i) {
        return 'translate(' + i * dx + ',10)'
      })
      .each(function(d, i) {
        let entry = d3.select(this)
        let chartElement = d3
          .select(d.selector)
          .select('path')
          .node() as Element
        if (chartElement) {
          let style = window.getComputedStyle(chartElement)
          let chart = that.axis.charts.filter(x => x.id === d.selector)
          if (chart[0] instanceof ChartLine) {
            entry
              .append('line')
              .attr('x1', 0)
              .attr('x2', 20)
              .attr('y1', 0)
              .attr('y2', 0)
              .style('stroke', style.getPropertyValue('stroke'))
              .style('stroke-width', style.getPropertyValue('stroke-width'))
              .style('stroke-dasharray', style.getPropertyValue('stroke-dasharray'))
          } else if (chart[0] instanceof ChartArea) {
            entry
              .append('rect')
              .attr('x', 0)
              .attr('y', -5)
              .attr('width', 20)
              .attr('height', 10)
              .style('fill', style.getPropertyValue('fill'))
          }
          entry.on('click', function() {
            let display = style.getPropertyValue('visibility')
            if (display === 'visible') {
              d3.selectAll(d.selector).style('visibility', 'hidden')
              entry.style('opacity', 0.5)
            } else {
              d3.selectAll(d.selector).style('visibility', 'visible')
              entry.style('opacity', 1.0)
            }
          })
        } else {
          entry
            .append('circle')
            .attr('class', 'spinner')
            .attr('cx', 10)
            .attr('cy', 0)
            .attr('r', 8)
        }
        entry
          .append('text')
          .text(d.label)
          .attr('x', 25)
          .attr('y', 0)
          .style('dominant-baseline', 'middle')
      })
    // update
    entries.attr('transform', function(d, i) {
      return 'translate(' + i * dx + ',10)'
    })
  }
}

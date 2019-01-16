import * as d3 from 'd3'
import { Axis } from '../Axis'
import { Visitor } from './visitor'
import { ChartLine, ChartArea } from '../Charts'

export class Legend implements Visitor {
  private container: HTMLElement
  private labels: any
  private svg: any
  private group: any

  constructor(labels: any, container?: HTMLElement) {
    this.container = container
    this.labels = labels
    this.svg = d3
      .select(container)
      .append('svg')
      .attr('class', 'legend')
  }

  visit(axis: Axis) {
    this.createLegend(axis)
  }

  createLegend(axis: Axis) {
    this.svg.attr('width', axis.margin.left + axis.width + axis.margin.right).attr('height', 20)
    if (this.group == null) this.group = this.svg.append('g')
    this.group.attr('transform', 'translate(' + axis.margin.left + ', 0)')
    let dx = Math.round(axis.width / Object.keys(this.labels).length)
    let entries = this.group.selectAll('g').data(this.labels)
    let enter = entries
      .enter()
      .append('g')
      .attr('transform', function(d, i) {
        return 'translate(' + i * dx + ',10)'
      })
      .attr('class', 'legend-entry')
      .each(function(d, i) {
        console.log(d, i)
        let entry = d3.select(this)
        let chartElement = d3
          .select(d.selector)
          .select('path')
          .node() as Element
        let style = window.getComputedStyle(chartElement)
        let chart = axis.charts.filter(x => x.id === d.selector)
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
            .attr('y', -4)
            .attr('width', 20)
            .attr('height', 10)
            .style('fill', style.getPropertyValue('fill'))
        }
        entry
          .append('text')
          .text(d.label)
          .attr('x', 25)
          .attr('y', 0)
          .style('dominant-baseline', 'middle')
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
      })
    //update
    entries.attr('transform', function(d, i) {
      return 'translate(' + i * dx + ',10)'
    })
  }
}

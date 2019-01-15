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
    let i = 0
    for (let selector in this.labels) {
      let style
      let group
      let element = this.group
        .append('g')
        .attr('transform', 'translate(' + i * dx + ',10)')
        .attr('class', 'legend-entry')
      if (selector.lastIndexOf('#',0)===0) {
        group = d3.select(selector)
        style = window.getComputedStyle(group.select('path').node() as Element)
        let chart = axis.charts.filter(x => x.id === selector)[0]
        if (chart instanceof ChartLine) {
          element
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
      } else if (selector.lastIndexOf('#',0)===0) {
        group = d3.selectAll(selector)
        let charts = axis.charts.filter(x => x.id === selector)
        let groupElement = d3.select(selector)
        style = window.getComputedStyle(groupElement.select('path').node() as Element)
        element
          .append('line')
          .attr('x1', 0)
          .attr('x2', 20)
          .attr('y1', 0)
          .attr('y2', 0)
          .style('stroke', style.getPropertyValue('stroke'))
      }
      element
        .append('text')
        .text(this.labels[selector])
        .attr('x', 25)
        .attr('y', 0)
        .style('dominant-baseline', 'middle')
      element.on('click', function() {
        let display = style.getPropertyValue('visibility')
        if (display === 'visible') {
          group.style('visibility', 'hidden')
          element.style('opacity', 0.5)
        } else {
          group.style('visibility', 'visible')
          element.style('opacity', 1.0)
        }
      })

    //update
    entries.attr('transform', function(d, i) {
      return 'translate(' + i * dx + ',10)'
    })
  }
}

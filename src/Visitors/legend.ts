import * as d3 from 'd3'
import { Axis } from '../Axis'
import { Visitor } from './visitor'
import { ChartLine, ChartArea } from '../Charts'
import { style } from 'd3'

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
    this.group = this.svg.append('g').attr('transform', 'translate(' + axis.margin.left + ', 0)')
    let dx = Math.round(axis.width / axis.charts.length)
    for (let i = 0; i < axis.charts.length; i++) {
      let chart = axis.charts[i]
      let group = d3.select('#' + chart.id)
      let style = window.getComputedStyle(<Element>group.select('path').node())
      let element = this.group
        .append('g')
        .attr('transform', 'translate(' + i * dx + ',10)')
        .attr('class', 'legend-entry')
      if (chart instanceof ChartLine) {
        element
          .append('line')
          .attr('x1', 0)
          .attr('x2', 20)
          .attr('y1', 0)
          .attr('y2', 0)
          .style('stroke', style.getPropertyValue('stroke'))
      } else if (chart instanceof ChartArea) {
        element
          .append('rect')
          .attr('x', 0)
          .attr('y', -4)
          .attr('width', 20)
          .attr('height', 10)
          .style('fill', style.getPropertyValue('stroke'))
      }
      element
        .append('text')
        .text(this.labels['#' + chart.id])
        .attr('x', 22)
        .attr('y', 0)
        .style('dominant-baseline', 'middle')
      element.on('click', function() {
        let display = style.getPropertyValue('visibility')
        if (display == 'visible') {
          group.style('visibility', 'hidden')
          element.style('opacity', 0.5)
        } else {
          group.style('visibility', 'visible')
          element.style('opacity', 1.0)
        }
        console.log(display)
      })
    }
  }
}

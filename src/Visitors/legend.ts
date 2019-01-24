<<<<<<< HEAD
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
    this.group = this.svg.append('g').attr('transform', 'translate(' + axis.margin.left + ', 0)')
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
        } else if (chart instanceof ChartArea) {
          element
            .append('rect')
            .attr('x', 0)
            .attr('y', -4)
            .attr('width', 20)
            .attr('height', 10)
            .style('fill', style.getPropertyValue('fill'))
        }
      } else if (selector.lastIndexOf('.',0)===0) {
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
        if (group.style('display')=== 'none') {
          group.style('display', 'inline')
          element.style('opacity', 1.0)
        } else {
          group.style('display', 'none')
          element.style('opacity', 0.5)
        }
      })
      i++
    }
  }
}
=======
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
  }

  visit(axis: Axis) {
    this.axis = axis as CartesianAxis
    this.createLegend(axis)
  }

  createLegend(axis: Axis) {
    this.svg.attr('width', axis.margin.left + axis.width + axis.margin.right).attr('height', 100)
    if (!this.group) this.group = this.svg.append('g')
    this.redraw()
  }

  redraw() {
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
        console.log(d, i)
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
>>>>>>> bce8d237f4c31d843a0852bbab0155c789ae23c0

import * as d3 from 'd3'
import { Axis, CartesianAxis } from '../Axis'
import { Visitor } from './visitor'
import { ChartLine, ChartArea, ChartMarker } from '../Charts'

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
    this.group.selectAll('g').remove()
    let entries = this.group.selectAll('g').data(this.labels)
    let that = this
    let maxWidth = 0

    const s = new XMLSerializer();
    let enter = entries
      .enter()
      .append('g')
      .attr('class', 'legend-entry')
      .merge(entries)
      .each(function(d, i) {
        let entry = d3.select(this)
        let chartElement = that.axis.chartGroup
          .select(`[data-id="${d.selector}"]`)
          .select('path')
          .node() as Element
        if (chartElement) {
          let style = window.getComputedStyle(chartElement)
          let chart = that.axis.charts.filter(x => x.id === d.selector)
          let svgElement = chart[0].drawLegendSymbol(true)
          let entryNode = entry.node() as Element
          entryNode.appendChild(svgElement)
          entry.on('click', function() {
            let display = style.getPropertyValue('visibility')
            if (display === 'visible') {
              that.axis.chartGroup.selectAll(`[data-id="${d.selector}"]`).style('visibility', 'hidden')
              entry.style('opacity', 0.5)
            } else {
              that.axis.chartGroup.selectAll(`[data-id="${d.selector}"]`).style('visibility', 'visible')
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
          .attr('dy', '0.32em')
        maxWidth = Math.max(maxWidth, entry.node().getBoundingClientRect().width)
      })
    // update
    let columns = Math.floor(this.axis.width / maxWidth)
    if (columns >= this.labels.length) columns = this.labels.length
    else {
      let rows = Math.ceil(this.labels.length / columns)
      let lastRow = this.labels.length % columns
      if (columns - lastRow > rows - 1) columns--
    }
    let rows = Math.ceil(this.labels.length / columns)
    let dx = Math.floor(this.axis.width / columns)
    let y = 10
    let dy = 15
    enter.attr('transform', function(d, i) {
      let column = Math.floor(i / rows)
      let row = i % rows
      return 'translate(' + column * dx + ',' + (y + row * dy) + ')'
    })
  }
}

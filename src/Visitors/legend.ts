import * as d3 from 'd3'
import { Axis, CartesianAxis } from '../Axis'
import { Visitor } from './visitor'

export class Legend implements Visitor {
  private container: HTMLElement
  private labels: any
  private svg: any
  private group: any
  private axis: CartesianAxis
  private configuredLabels: boolean = false

  constructor(labels: any, container?: HTMLElement) {
    this.container = container
    if (labels) {
      this.labels = labels
      this.configuredLabels = true
    }
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
    if ( !this.configuredLabels) {
      this.labels = []
      for( const chart of this.axis.charts) {
        for ( const legendItem of chart.legend ) {
          this.labels.push( {selector: chart.id, label: legendItem, legendId: chart.legendId(legendItem)})
        }
      }
    }
    let entries = this.group.selectAll('g').data(this.labels)
    let that = this
    let maxWidth = 0

    entries.exit().remove()

    let enter = entries.enter()
      .append('g')
      .attr('class', 'legend-entry')

    const updateSelection = entries
      .merge(enter)
      .each(function(d, i) {
        let entry = d3.select(this)
        const chartGroup = that.axis.chartGroup
          .select(`[data-chart-id="${d.selector}"]`)

        let chartElement
        if ( d.legendId !== undefined ) {
          chartElement = chartGroup
            .select(`[data-legend-id="${d.legendId}"]`)
            .node() as Element
        } else {
          chartElement = chartGroup
          .select('path')
          .node() as Element
        }

        if (chartElement) {
          let style = window.getComputedStyle(chartElement)
          let chart = that.axis.charts.find(x => x.id === d.selector)
          let svgElement = chart.drawLegendSymbol(d.legendId, true)
          const symbol = entry.append('g')
            .attr('transfrom','translate(0, -10)')
          let entryNode = symbol.node() as Element
          entryNode.appendChild(svgElement)
          if (that.configuredLabels){
            entry.on('click', function() {
              let display = style.getPropertyValue('visibility')
              if (display === 'visible') {
                if (that.configuredLabels){
                  that.axis.chartGroup.selectAll(`[data-chart-id="${d.selector}"]`).style('visibility', 'hidden')
                } else {
                  that.axis.chartGroup.selectAll(`[data-chart-id="${d.selector}"] > [data-legend-id="${d.legendId}"]`).style('visibility', 'hidden')
                }
                entry.style('opacity', 0.5)
              } else {
                if (that.configuredLabels){
                  that.axis.chartGroup.selectAll(`[data-chart-id="${d.selector}"]`).style('visibility', 'visible')
                } else {
                  that.axis.chartGroup.selectAll(`[data-chart-id="${d.selector}"] > [data-legend-id="${d.legendId}"]`).style('visibility', 'visible')
                }
                entry.style('opacity', 1.0)
              }
            })
          }
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
          // .attr('dy', '0.32em')
          .attr('dominant-baseline','middle')
        maxWidth = Math.max(maxWidth, entry.node().getBoundingClientRect().width)
      })
    // update
    let columns = Math.min(1, Math.floor(this.axis.width / maxWidth))
    if (columns >= this.labels.length) columns = this.labels.length
    else {
      let rows = Math.ceil(this.labels.length / columns)
      let lastRow = this.labels.length % columns
      if (columns - lastRow > rows - 1) columns--
    }
    let rows = Math.ceil(this.labels.length / columns)
    let dx = Math.floor(this.axis.width / columns)
    let y = 10
    let dy = 25
    this.svg
      .attr('height', rows * dy)

    updateSelection.attr('transform', function(d, i) {
      let column = Math.floor(i / rows)
      let row = i % rows
      return 'translate(' + column * dx + ',' + (y + row * dy) + ')'
    })
  }
}

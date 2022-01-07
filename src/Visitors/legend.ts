import * as d3 from 'd3'
import { Axis, CartesianAxis } from '../Axis'
import { Visitor } from './visitor'

export class Legend implements Visitor {
  private labels: any
  private svg: any
  private group: any
  private axis: CartesianAxis
  private configuredLabels = false

  constructor(labels: any, container?: HTMLElement) {
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
    const entries = this.group.selectAll('g').data(this.labels)
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const that = this
    let maxWidth = 1

    entries.exit().remove()

    const enter = entries.enter()
      .append('g')
      .attr('class', 'legend-entry')

    const updateSelection = entries
      .merge(enter)
      .each(function(d, i) {
        const entry = d3.select(this)
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
          const style = window.getComputedStyle(chartElement)
          const charts = that.axis.charts.filter(x => x.id === d.selector)

          const symbol = entry.append('g')
          const entryNode = symbol.node() as Element

          for ( let i = 0 ; i < charts.length ; i++) {
            const svgElement = charts[i].drawLegendSymbol(d.legendId, true)
            entryNode.appendChild(svgElement)
          }

          if (that.configuredLabels){
            entry.style('cursor', 'pointer')
            entry.on('click', function() {
              const display = style.getPropertyValue('visibility')
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

    if ( this.labels.length > 0) {
      const {columns, rows} = this.optimalColumnsRows(this.axis.width, maxWidth, this.labels.length)
      const dx = this.axis.width / columns
      const y = 15
      const dy = 25
      this.svg.attr('height', rows* dy)
      updateSelection.attr('transform', function(d, i) {
        const column = Math.floor(i / rows)
        const row = i % rows
        return 'translate(' + column * dx + ',' + (y + row * dy) + ')'
      })

    }
  }

  optimalColumnsRows(width: number, elementWidth: number, elementCount: number) {
    let columns = Math.floor( width / elementWidth)
    let rows = 1
    if (columns >= elementCount) {
      columns = elementCount
    }
    else {
      rows = Math.ceil(elementCount / columns)
      columns = Math.ceil(elementCount / rows)
    }
    return {columns, rows}
  }
}

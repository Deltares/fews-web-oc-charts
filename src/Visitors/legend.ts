import * as d3 from 'd3'
import { Axes } from '../Axes/axes.js'
import { CartesianAxes } from '../index.js';
import { Visitor } from './visitor.js'

interface LegendEntry {
  selector: string;
  label: string;
  legendId?: number;
}

export class Legend implements Visitor {
  private labels: LegendEntry[]
  private svg: any
  private group: any
  private axis: CartesianAxes
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

  visit(axis: Axes) {
    this.axis = axis as CartesianAxes
    this.redraw()
  }

  redraw() {
    this.updateDimensions()
    this.group.attr('transform', 'translate(' + this.axis.margin.left + ', 0)')
    this.group.selectAll('g').remove()
    if (!this.configuredLabels) {
      this.updateLabels()
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
      .each(function (d, i) {
        const legendElement = d3.select(this)
        const chartsInGroup = that.axis.charts.filter(c => c.id === d.selector)
        const symbol = legendElement.append('g')
        that.createLegendSymbol(d.selector, d.legendId, symbol.node())
        if (that.configuredLabels) {
          legendElement.style('cursor', 'pointer')
          legendElement.on('click', () => {
            const display = 'visible'
            for (const chart of chartsInGroup) {
              chart.visible = !chart.visible
            }
            if (display === 'visible') {
              legendElement.style('opacity', 0.5)
            } else {
              legendElement.style('opacity', 1.0)
            }
            that.axis.redraw()
          })
        }
        legendElement
          .append('text')
          .text(d.label)
          .attr('x', 25)
          .attr('dominant-baseline', 'middle')
        maxWidth = Math.max(maxWidth, legendElement.node().getBoundingClientRect().width)
      })
    // update

    this.updateLabelPositions(updateSelection, maxWidth)
  }

  createLegendSymbol(chartId: string, legendId: string, node: Element) {
    const charts = this.axis.charts.filter(c => c.id === chartId)
    for (const chart of charts) {
      const svgElement = chart.drawLegendSymbol(legendId, true)
      node.appendChild(svgElement)
    }
  }

  updateDimensions() {
    this.svg
      .attr('width', this.axis.margin.left + this.axis.width + this.axis.margin.right)
      .attr('height', 100)
  }

  updateLabels() {
    this.labels = []
    for (const chart of this.axis.charts) {
      for (const legendItem of chart.legend) {
        this.labels.push({ selector: chart.id, label: legendItem, legendId: chart.legendId(legendItem) })
      }
    }
  }

  updateLabelPositions(selection, maxWidth) {
    if (this.labels.length > 0) {
      const { columns, rows } = this.optimalColumnsRows(this.axis.width, maxWidth, this.labels.length)
      const dx = this.axis.width / columns
      const y = 15
      const dy = 25
      this.svg.attr('height', rows * dy)
      selection.attr('transform', function (d, i) {
        const column = Math.floor(i / rows)
        const row = i % rows
        return 'translate(' + column * dx + ',' + (y + row * dy) + ')'
      })
    }
  }

  optimalColumnsRows(width: number, elementWidth: number, elementCount: number) {
    let columns = Math.floor(width / elementWidth)
    let rows = 1
    if (columns >= elementCount) {
      columns = elementCount
    }
    else {
      rows = Math.ceil(elementCount / columns)
      columns = Math.ceil(elementCount / rows)
    }
    return { columns, rows }
  }
}

import * as d3 from 'd3'
import { Chart } from '../Charts'
import { Visitor } from '../Visitors'
// import { scaleLinear } from 'd3-scale'

export interface AxisOptions {
  transitionTime?: number
}

export abstract class Axis {
  tooltip: any = null
  type: string
  view: any
  defs: any
  canvas: any
  svg: any
  container: HTMLElement
  width: number
  height: number
  margin: any
  options: any
  chartGroup: any
  charts: Chart[]
  initialDraw: boolean = true

  constructor(container: HTMLElement, width: number, height: number, options: AxisOptions) {
    this.container = container
    this.options = options

    let containerWidth = width == null ? this.container.offsetWidth : width
    let containerHeight = height == null ? this.container.offsetHeight : height

    let margin = (this.margin = {
      top: 40,
      right: 40,
      bottom: 40,
      left: 40
    })

    this.setSize()
    this.canvas = d3
      .select(container)
      .append('svg')
      .attr('width', '100%')
      .attr('height', '100%')

    this.defs = this.canvas
    this.defs = this.defs.append('defs')
    this.canvas = this.canvas
      .append('g')
      .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')')
    this.createTooltip()
    this.charts = []
  }

  setSize() {
    this.height = this.container.offsetHeight - this.margin.top - this.margin.bottom
    this.width = this.container.offsetWidth - this.margin.left - this.margin.right
  }

  resize() {
    this.setSize()
    this.setRange()
    this.updateGrid()
    this.redraw()
  }

  abstract redraw()

  abstract updateGrid()

  accept(v: Visitor) {
    v.visit(this)
  }

  createChartGroup() {
    this.chartGroup = this.canvas.append('g').attr('class', 'charts')
  }

  createTooltip() {
    this.tooltip = d3
      .select('body')
      .append('div')
      .attr('class', 'tooltip')
      .style('opacity', 0)
  }

  abstract showTooltip(d: any)

  hideTooltip(d: any) {
    this.tooltip
      .transition()
      .duration(50)
      .style('opacity', 0)
  }

  protected abstract setRange()
  protected abstract initGrid()
}

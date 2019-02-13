import * as d3 from 'd3'
import { Chart } from '../Charts'
import { Visitor } from '../Visitors'
// import { scaleLinear } from 'd3-scale'

export interface Margin {
  top: number
  right: number
  bottom: number
  left: number
}

export interface AxisOptions {
  transitionTime?: number
  x?: any
  y?: any
  x2?: any
  y2?: any
  margin?: Margin
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
  margin: { top: number; right: number; bottom: number; left: number }
  options: AxisOptions
  chartGroup: any
  charts: Chart[]
  initialDraw: boolean = true
  visitors: Visitor[]

  constructor(container: HTMLElement, width: number, height: number, options: AxisOptions) {
    this.container = container
    this.options = options

    this.margin = { ...{ top: 40, right: 40, bottom: 40, left: 40 }, ...options.margin }
    this.setSize(height, width)
    this.svg = d3
      .select(container)
      .append('svg')
      .attr('width', '100%')
      .attr('height', '100%')

    this.defs = this.svg.append('defs')
    this.canvas = this.svg
      .append('g')
      .attr('transform', 'translate(' + this.margin.left + ',' + this.margin.top + ')')
    this.createTooltip()
    this.charts = []
    this.visitors = []
  }

  setSize(height?: number, width?: number) {
    // FIXME: does not work for arguments
    let containerWidth = width == null ? this.container.offsetWidth : width
    let containerHeight = height == null ? this.container.offsetHeight : height
    this.height = containerHeight - this.margin.top - this.margin.bottom
    this.width = containerWidth - this.margin.left - this.margin.right
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
    this.visitors.push(v)
    v.visit(this)
  }

  createChartGroup() {
    this.chartGroup = this.canvas.append('g').attr('class', 'charts')
  }

  createTooltip() {
    this.tooltip = d3
      .select(this.container)
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

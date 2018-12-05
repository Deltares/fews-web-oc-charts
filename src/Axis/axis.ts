import * as d3 from 'd3'
import { Chart } from '../Charts'
// import { scaleLinear } from 'd3-scale'

export interface AxisOptions {}

export abstract class Axis {
  tooltip: any = null
  type: string
  canvas: any
  svg: any
  container: HTMLElement
  width: number
  height: number
  margin: any
  options: any
  charts: Chart[]
  initialDraw: boolean = true

  constructor(container: HTMLElement, width: number, height: number, options: AxisOptions) {
    this.container = container
    this.options = options
    let margin = (this.margin = {
      top: 40,
      right: 40,
      bottom: 40,
      left: 40
    })
    this.height = height - margin.top - margin.bottom
    this.width = width - margin.left - margin.right
    this.svg = d3
      .select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
    this.canvas = this.svg
      .append('g')
      .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')')
    this.createTooltip()
    this.charts = []
  }

  abstract redraw()

  abstract updateGrid()

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

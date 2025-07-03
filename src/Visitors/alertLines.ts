import { Axes } from '../Axes/axes.js'
import { CartesianAxes } from '../index.js'
import { Visitor } from './visitor.js'

export interface AlertLineOptions {
  x1: number | Date
  x2: number | Date
  value: number
  labelPosition?: 'left' | 'right'
  description: string
  yAxisIndex: number
  color: string
}

export class AlertLines implements Visitor {
  public options: AlertLineOptions[]
  private group: d3.Selection<SVGGElement, unknown, null, unknown>
  private axis: CartesianAxes

  constructor(options?: AlertLineOptions[]) {
    if (options) {
      this.options = options
    } else {
      this.options = []
    }
  }

  visit(axis: Axes): void {
    this.axis = axis as CartesianAxes
    this.create(axis as CartesianAxes)
  }

  create(axis: CartesianAxes): void {
    this.group = this.axis.canvas
      .select('.front')
      .append('g')
      .attr('class', 'alert-lines')
      .attr('clip-path', 'url(#' + axis.clipPathId + ')')
    this.redraw()
  }

  redraw(): void {
    this.group.selectAll('g').remove()
    if (this.options.length === 0) {
      return
    }
    const xScale = this.axis.xScales[0]
    const selection = this.group.selectAll('g').data(this.options)
    const enter = selection.enter().append('g')

    enter
      .append('line')
      .style('stroke', (d: AlertLineOptions) => d.color)
      .style('stroke-dasharray', '40 2')
      .style('stroke-width', '40 2')
      .attr('x1', (d: any) => {
        const x = Math.max(xScale(d.x1) ?? NaN, 0)
        return Number.isFinite(x) ? x : 0
      })
      .attr('y1', (d: AlertLineOptions) => {
        const yScale = this.axis.yScales[d.yAxisIndex]
        return Number.isFinite(yScale(d.value)) ? yScale(d.value) : 0
      })
      .attr('x2', (d: AlertLineOptions) => {
        const x = Math.min(this.axis.width, xScale(d.x2) ?? NaN)
        return Number.isFinite(x) ? x : this.axis.width
      })
      .attr('y2', (d: AlertLineOptions) => {
        const yScale = this.axis.yScales[d.yAxisIndex]
        return Number.isFinite(yScale(d.value)) ? yScale(d.value) : 0
      })
    enter
      .append('text')
      .filter((d) => {
        return xScale(d.x1) < this.axis.width - 10
      })
      .attr('text-anchor', (d) => {
        if (d.labelPosition === 'left') {
          return 'end'
        } else {
          return 'start'
        }
      })
      .attr('x', (d: AlertLineOptions) => {
        if (d.labelPosition === 'left') {
          return Math.max(xScale(d.x1), 0)
        } else {
          return Math.min(xScale(d.x2), this.axis.width)
        }
      })
      .attr('y', (d: AlertLineOptions) => {
        const yScale = this.axis.yScales[d.yAxisIndex]
        return yScale(d.value)
      })
      .attr('dx', '-10px')
      .attr('dy', '-.35em')
      .style('fill', (d: AlertLineOptions) => d.color)
      .text((d: AlertLineOptions) => d.description)
  }
}

import { Axes } from '../Axes/axes.js'
import { CartesianAxes } from '../index.js';
import { Visitor } from './visitor.js'

export interface AlertLineOptions {
  x1: number | Date
  x2: number | Date
  value: number
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
    this.group = this.axis.canvas.select('.front')
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
    const selection = this.group.selectAll('g')
      .data(this.options)
    const enter = selection
      .enter()
      .append('g')

    enter.append('line')
      .style("stroke", (d: AlertLineOptions) => d.color)
      .style("stroke-dasharray", "40 2")
      .style("stroke-width", "40 2")
      .attr("x1", (d: any) => {
        return Math.max(xScale(d.x1), 0)
      })
      .attr("y1", (d: AlertLineOptions) => {
        const yScale = this.axis.yScales[d.yAxisIndex];
        return yScale(d.value)
      })
      .attr("x2", (d: AlertLineOptions) => {
        return Math.min(this.axis.width, xScale(d.x2))
      })
      .attr("y2", (d: AlertLineOptions) => {
        const yScale = this.axis.yScales[d.yAxisIndex]
        return yScale(d.value)
      })
    enter.append('text')
      .filter((d) => {
        return xScale(d.x1) < (this.axis.width - 10)
      })
      .attr('text-anchor', 'end')
      .attr("x", (d: AlertLineOptions) => {
        const x = xScale(d.x2);
        return Math.min(x, this.axis.width);
      })
      .attr("y", (d: AlertLineOptions) => {
        const yScale = this.axis.yScales[d.yAxisIndex];
        return yScale(d.value)
      })
      .attr("dx", "-10px")
      .attr("dy", "-.35em")
      .style("fill", (d: AlertLineOptions) => d.color)
      .text((d: AlertLineOptions) => d.description)
  }
}

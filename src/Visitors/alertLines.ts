import { Axes } from '../Axes/axes.js'
import { CartesianAxes } from '../index.js';
import { Visitor } from './visitor.js'

export class AlertLines implements Visitor {
  public options: any[]
  private group: any
  private axis: CartesianAxes

  constructor(options) {
    this.options = options
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
    if (this.options === undefined || this.options.length === 0) {
      return
    }
    const xScale = this.axis.xScale[0]
    const selection = this.group.selectAll('g')
      .data(this.options)
    const enter = selection
      .enter()
      .append('g')

    enter.append('line')
      .style("stroke", (d: any) => d.color)
      .style("stroke-dasharray", "40 2")
      .style("stroke-width", "40 2")
      .attr("x1", (d: any) => {
        return Math.max(xScale(d.x1), 0)
      })
      .attr("y1", (d: any) => {
        const yScale = this.axis.yScale[d.yAxisIndex];
        return yScale(d.value)
      })
      .attr("x2", (d: any) => {
        return Math.min(this.axis.width, xScale(d.x2))
      })
      .attr("y2", (d: any) => {
        const yScale = this.axis.yScale[d.yAxisIndex]
        return yScale(d.value)
      })
    enter.append('text')
      .filter((d) => {
        return xScale(d.x1) < (this.axis.width - 10)
      })
      .attr('text-anchor', 'end')
      .attr("x", (d: any) => {
        const x = xScale(d.x2);
        return Math.min(x, this.axis.width);
      })
      .attr("y", (d: any) => {
        const yScale = this.axis.yScale[d.yAxisIndex];
        return yScale(d.value)
      })
      .attr("dx", "-10px")
      .attr("dy", "-.35em")
      .style("fill", (d: any) => d.color)
      .text((d: any) => d.description)
  }
}

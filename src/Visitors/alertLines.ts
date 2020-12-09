import { Axis, CartesianAxis } from '../Axis'
import { Visitor } from './visitor'

export class AlertLines implements Visitor {
  public options: any[]
  private group: any
  private axis: CartesianAxis

  constructor(options) {
    this.options = options
  }

  visit(axis: Axis) {
    this.axis = axis as CartesianAxis
    this.create(axis as CartesianAxis)
  }

  create(axis: CartesianAxis) {

    this.group =this.axis.canvas.select('.front')
      .append('g')
      .attr('class', 'warning-sections')
    this.redraw()
  }

  redraw() {
    this.group.selectAll('g').remove()
    if ( this.options === undefined || this.options.length === 0) {
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
        return xScale(d.x1)
      })
      .attr("y1", (d: any) => {
        const yScale = this.axis.yScale[d.yAxisIndex];
        return yScale(d.value)})
      .attr("x2", (d: any) => {
        return xScale(d.x2)
      })
      .attr("y2", (d: any) => {
        const yScale = this.axis.yScale[d.yAxisIndex]
        return yScale(d.value)})
    enter.append('text')
      .filter((d) => { return xScale(d.x1) >= this.axis.width - 10 })
      .attr('text-anchor', 'end')
      .attr("x", (d: any) => {
        const x = xScale(d.x2);
        let xPos = Math.min(x, this.axis.width);
        return xPos})
        .attr("y", (d: any) => {
          const yScale = this.axis.yScale[d.yAxisIndex];
          return yScale(d.value)})
      .attr("dx", "-10px")
      .attr("dy", "-.35em")
      .style("fill", (d: any) => d.color)
      .text((d: any) => d.description)
  }
}

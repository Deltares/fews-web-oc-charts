import { Axis, CartesianAxis, PolarAxis } from '../Axis'
import { Visitor } from './visitor'

export class DataField implements Visitor {
  private container: any
  private group: any
  private labels: any
  private axis: Axis
  private text: any
  private value: any
  private formatter: any

  constructor(container, labels: any, formatter: any) {
    this.container = container
    this.labels = labels
    this.formatter = formatter
  }

  visit(axis: Axis) {
    this.axis = axis
    this.create(axis)
  }

  create(axis: Axis) {
    if (!this.group) {
      this.group = this.container.append('g').attr('class', 'data-field')
      this.text = this.group
        .append('text')
        .attr('class', 'data-field-label')
        .text(this.labels.label)
      this.value = this.group.append('text').attr('class', 'data-field-value')
      if (axis instanceof PolarAxis) {
        this.text.attr('dy', '-0.2em')
        this.value.attr('dy', '1.2em')
      } else {
        this.text.attr('dy', this.axis.margin.bottom + this.axis.height - 10 + 'px')
        this.value.attr('dy', this.axis.margin.bottom + this.axis.height - 10 + 'px')
        this.value.attr('dx', '100px')
      }
    }
    this.redraw()
  }

  redraw() {
    let element = this.axis.chartGroup.select(this.labels.selector).select('path')
    let data = element.datum()
    let style = window.getComputedStyle(element.node() as Element)

    this.value.text(this.formatter(data))
    this.value.style('fill', style.getPropertyValue('stroke'))
  }
}

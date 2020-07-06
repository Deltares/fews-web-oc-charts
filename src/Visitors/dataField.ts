import { Axis, PolarAxis } from '../Axis'
import { Visitor } from './visitor'
import * as d3 from 'd3'
import merge from 'lodash/merge'

export interface DataFieldOptions {
  selector? : string
  labelField?: {
    dx?: string | number
    dy?: string | number
    text?: string
  },
  valueField?: {
    dx?: string | number
    dy?: string | number
    units?: any
    precision?: string
  }
}

export class DataField implements Visitor {
  private container: any
  private group: any
  private options: DataFieldOptions
  private axis: Axis
  private text: any
  private value: any
  private formatter: any
  private clickCount = 0

  // TODO: we can provide an optional source element or axis where we look for the value
  constructor(container, options: DataFieldOptions, formatter?: any) {
    this.container = container
    this.options = merge(this.options,
      {
        labelField : {dx: 0, dy: 0},
        valueField : {dx: 0, dy: 0, units: [{unit: '', factor: 1.0} ], precision: "0.1f" }
      }, options )
    this.formatter = formatter !== undefined ? formatter : this.valueFormatter
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
        .text(this.options.labelField.text)
      this.value = this.group.append('text').attr('class', 'data-field-value')
      this.text.attr('dx', this.options.labelField.dx)
      this.text.attr('dy', this.options.labelField.dy)

      this.value.attr('dx', this.options.valueField.dx)
      this.value.attr('dy', this.options.valueField.dy)
      let that = this
      if ( this.options.valueField.units.length > 1 ) {
        this.value.on('click', function() { that.onClick() } )
        this.value.style('cursor','pointer')
      }
    }
    this.redraw()
  }

  redraw() {
    //TODO this only works with unique ids
    let element = d3.select(`[data-id="${this.options.selector}"]`).select('path')
    let data = element.datum()
    let style = window.getComputedStyle(element.node() as Element)

    this.value.text(this.formatter(data))
    this.value.style('fill', style.getPropertyValue('stroke'))
  }

  onClick() {
    this.clickCount++
    this.redraw()
  }

  valueFormatter(d) {
    const idx = this.clickCount % this.options.valueField.units.length
    const value = this.getValue(d)
    const units  = this.options.valueField.units[idx]
    if (value === null) {
      return '-' + units.unit;
    }
    if ( units.factor !== undefined ) {
      const format = units.precision !== undefined?  d3.format(units.precision)  : d3.format(".1f");
      const valueString = value !== null ? format(value * units.factor ) : '-';
      return valueString + units.unit;
    } else {
      let valueString: string = value !== null ? units.scale( value ) : '-';
      return valueString + units.unit;
    }
  }

  // TODO: we should specify a datakey or always require a formatter
  getValue(d) {
    if (this.axis instanceof PolarAxis) {
      return d[0] !== undefined ? d[0].y : null
    } else {
      return d[0] !== undefined ? d[0].y : null
    }
  }

}

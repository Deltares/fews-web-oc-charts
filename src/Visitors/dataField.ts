import { Axis } from '../Axis'
import { Visitor } from './visitor'
import * as d3 from 'd3'
import defaultsDeep from 'lodash/defaultsDeep'

export interface UnitOptions {
  unit: string;
  factor: number;
  precision: string;
  scale: (x: number) => string;
}

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
    units?: UnitOptions[]
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

  constructor(container, options: DataFieldOptions, formatter?: any) {
    this.container = container
    this.options = defaultsDeep({},
      options,
      {
        labelField : {dx: 0, dy: 0},
        valueField : {dx: 0, dy: 0, units: [{unit: '', factor: 1.0} ], precision: "0.1f" }
      })
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
      if ( this.options.valueField.units.length > 1 ) {
        this.value.on('click', () => { this.onClick() } )
        this.value.style('cursor','pointer')
      }
    }
    this.redraw()
  }

  redraw() {
    const element = d3.select(`[data-chart-id="${this.options.selector}"]`).select('path')
    const data = element.datum()
    const style = window.getComputedStyle(element.node() as Element)

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
      const valueString: string = value !== null ? units.scale( value ) : '-';
      return valueString + units.unit;
    }
  }

  getValue(d) {
    return d[0] !== undefined ? d[0].y : null
  }

}

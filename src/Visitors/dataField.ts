import { Axis } from '../Axis/axis.js'
import { Visitor } from './visitor.js'
import * as d3 from 'd3'
import { defaultsDeep } from 'lodash-es'

export interface UnitOptions {
  unit: string;
  factor: number;
  precision: string;
  scale: (x: number) => string;
}

export interface valueFieldOptions {
  dx?: string | number
  dy?: string | number
  margin?: string | number
  units?: UnitOptions[]
  hyphen?: string
  precision?: string
}

export interface DataFieldOptions {
  selector?: string | string[]
  labelField?: {
    dx?: string | number
    dy?: string | number
    text?: string
  },
  valueField?: valueFieldOptions | valueFieldOptions[]
}

export class DataField implements Visitor {
  private container: any
  private group: any
  private options: DataFieldOptions
  private axis: Axis
  private text: any
  private value: any
  private values: any[] = []
  private units: any[] = []
  private formatter: any
  private clickCount = 0

  constructor(container, options: DataFieldOptions, formatter?: any) {
    this.container = container
    this.options = defaultsDeep({},
      options,
      {
        labelField: { dx: 0, dy: 0 },
        valueField: { dx: 0, dy: 0, units: [{ unit: '', factor: 1.0 }], precision: "0.1f" }
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
      this.text.attr('dx', this.options.labelField.dx)
      this.text.attr('dy', this.options.labelField.dy)

      this.value = this.group.append('text').attr('class', 'data-field-value')

      if (this.options.valueField instanceof Array) {
        for (const valueField of this.options.valueField) {
          this.values.push(this.value.append('tspan'))
          if (valueField.hasOwnProperty('dx')) {
            this.value.attr('dx', valueField.dx)
          }
          if (valueField.hasOwnProperty('dy')) {
            this.value.attr('dy', valueField.dy)
          }
          if (valueField.units !== undefined && valueField.units.length > 1) {
            this.units = valueField.units
          }
        }
      } else {
        this.value.attr('dx', this.options.valueField.dx)
        this.value.attr('dy', this.options.valueField.dy)
        this.values.push(this.value.append('tspan'))
        if (this.options.valueField.units !== undefined && this.options.valueField.units.length > 1) {
          this.units = this.options.valueField.units
        }
      }

      if (this.units.length > 1) {
        this.value.on('click', () => { this.onClick() })
        this.value.style('cursor', 'pointer')
      }
    }
    this.redraw()
  }

  redraw() {
    for (let i = 0; i < this.values.length; i++) {
      const selector = this.getSelector(i)
      const element = d3.select(`[data-chart-id="${selector}"]`).select('path')
      if (element.node() !== null) {
        const data = element.datum()
        const style = window.getComputedStyle(element.node() as Element)
        this.values[i].text(this.formatter(data, i))
        this.values[i].style('fill', style.getPropertyValue('stroke'))
      } else {
        this.values[i].text('')
      }
    }
  }

  onClick() {
    this.clickCount++
    this.redraw()
  }

  valueFormatter(d, i) {
    const value = this.getValue(d)
    const units = this.getUnit()
    const symbol = this.getSymbol(units, i)
    if (value === null) {
      return '-' + symbol;
    }
    if (units.factor !== undefined) {
      const format = units.precision !== undefined ? d3.format(units.precision) : d3.format(".1f");
      const valueString = value !== null ? format(value * units.factor) : '-';
      return valueString + symbol;
    } else {
      const valueString: string = value !== null ? units.scale(value) : '-';
      return valueString + symbol;
    }
  }

  getSymbol(units, i) {
    if (this.options.valueField instanceof Array) {
      if (this.options.valueField[i].hasOwnProperty('hyphen')) {
        return this.options.valueField[i].hyphen
      }
    }
    return units.unit
  }

  getUnit() {
    const idx = this.clickCount % this.units.length
    return this.units[idx]
  }

  getValue(d) {
    return d[0] !== undefined ? d[0].y : null
  }

  getSelector(i) {
    if (this.options.selector instanceof Array) {
      return this.options.selector[i]
    } else {
      return this.options.selector
    }
  }

}

import { Axes } from '../Axes/axes.js'
import { Visitor } from './visitor.js'
import * as d3 from 'd3'
import { defaultsDeep } from 'lodash-es'
import { D3Selection } from '../index.js'

export interface UnitOptions {
  unit: string;
  factor: number;
  precision: string;
  scale?: (x: number) => string;
}

export interface ValueFieldOptions {
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
  valueField?: ValueFieldOptions | ValueFieldOptions[]
}

export class DataField implements Visitor {
  private container: D3Selection<SVGElement, SVGElement>
  private group: any
  private options: DataFieldOptions
  private axis: Axes
  private text: any
  private value: any
  private values: any[] = []
  private units: UnitOptions[] = []
  private formatter: any
  private clickCount = 0

  constructor(container: D3Selection<SVGElement, SVGElement>, options: DataFieldOptions, formatter?: any) {
    this.container = container
    this.options = defaultsDeep({},options)
    this.formatter = formatter !== undefined ? formatter : this.valueFormatter
  }

  visit(axis: Axes) {
    this.axis = axis
    this.create(axis)
  }

  create(axis: Axes) {
    if (!this.group) {
      this.group = this.container.append('g').attr('class', 'data-field')
      this.text = this.group
        .append('text')
        .attr('class', 'data-field-label')
        .text(this.options.labelField.text)

      this.value = this.group
        .append('text')
        .attr('class', 'data-field-value')

      const valueField = this.options.valueField
      const valueFields = valueField instanceof Array ? valueField : [valueField]

      for (const valueField of valueFields) {
        this.values.push(this.value.append('tspan'))
        if (valueField.units !== undefined && valueField.units.length > 1) {
          this.units = valueField.units
        }
      }

      if (this.units.length > 1) {
        this.value.on('click', () => { this.onClick() })
        this.value.style('cursor', 'pointer')
      }
    }
    this.updateOffsets()
    this.redraw()
  }

  updateOffsets() {
    const dataFields = this.container.selectChildren('.data-field')
    const offset = dataFields.size() - 1
    const lineHeight = 1.25
    dataFields.each(function (_, i) {
      const children = d3.select(this).selectChildren()
      children.attr('dy', (_, j) => {
        const index = i * children.size() + j
        return `${(index - offset) * lineHeight}em`
      })
    })
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
    const format  = (value): string => {
      if (value === null) return '-'
      if (units.factor !== undefined) {
        const d3Format = units.precision !== undefined ? d3.format(units.precision) : d3.format(".1f");
        return d3Format(value * units.factor)
      }
      return units.scale(value)
    }
    if (Array.isArray(value)) {
      if (value.every(value => value === null)) {
        return '-' + symbol;
      }
      const min = Math.min(...value)
      const max = Math.max(...value)
      if (min === max) {
        const valueString: string = format(min);
        return valueString + symbol;
      }
      const valueString: string = `${format(min)} - ${format(max)}`
      return valueString + symbol;
    }
    const valueString: string = format(value);
    return valueString + symbol;
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

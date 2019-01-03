import * as d3 from 'd3'
import { Axis, CartesianAxis, PolarAxis } from '../Axis'

export const AUTO_SCALE = 1

export interface Data {
  x: number[]
  y: number[]
}

function mean(x: number[] | number) {
  if (x instanceof Array) {
    return d3.mean(x)
  }
  return x
}

export abstract class Chart {
  data: any
  style: any
  group: any
  colorMap: any
  id: string
  options: any
  dataKeys: any

  constructor(data: any, options: any) {
    this.data = data
    this.options = options
    if (!('transitionTime' in this.options)) {
      this.options.transitionTime = 100
    }
    // https://github.com/d3/d3-scale-chromatic
    this.colorMap = d3.scaleSequential(d3.interpolateWarm)
  }

  addTo(axis: Axis, dataKeys: any, id?: string) {
    this.id = id ? id : ''
    this.dataKeys = dataKeys
    axis.charts.push(this)
    return this
  }

  abstract plotterCartesian(axis: CartesianAxis, dataKeys: any)
  abstract plotterPolar(axis: PolarAxis, dataKeys: any)

  protected selectGroup(axis: Axis, cssClass: string) {
    let direction = 1
    let intercept = 0
    if (axis instanceof PolarAxis) {
      direction = -axis.direction
      intercept = 90 - axis.intercept
    }
    if (this.group == null) {
      this.group = axis.chartGroup
        .append('g')
        .attr('transform', 'rotate(' + intercept + ')scale(' + direction + ' ,1)')
      if (this.id.lastIndexOf('#', 0) === 0) this.group.attr('id', this.id.substr(1))
      if (this.id.lastIndexOf('.', 0) === 0) {
        this.group.attr('class', cssClass + ' ' + this.id.substr(1))
      } else {
        this.group.attr('class', cssClass)
      }
    }
    return this.group
  }

  protected mapDataCartesian(axis: CartesianAxis, dataKeys: any) {
    let xkey = dataKeys.xkey ? dataKeys.xkey : 'x'
    let ykey = dataKeys.ykey ? dataKeys.ykey : 'y'
    let mappedData: any = this.data.map(function(d: any) {
      return {
        x: axis.xScale(d[xkey]),
        y: axis.yScale(d[ykey])
      }
    })
    return mappedData
  }

  protected mapDataPolar(axis: PolarAxis, dataKeys: any) {
    let tkey = dataKeys.tkey ? dataKeys.tkey : 't'
    let rkey = dataKeys.rkey ? dataKeys.rkey : 'r'

    let mappedData: any = this.data.map(function(d: any) {
      return {
        r: axis.radialScale(d[rkey]),
        t: axis.angularScale(d[tkey])
      }
    })
    return mappedData
  }
}

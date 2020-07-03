import * as d3 from 'd3'
import { SvgProperties } from 'csstype';
import { Axis, CartesianAxis, PolarAxis } from '../Axis'
import { merge } from "lodash";

export const AUTO_SCALE = 1

function mean(x: number[] | number) {
  if (x instanceof Array) {
    return d3.mean(x)
  }
  return x
}

export abstract class Chart {
  protected _data: any
  protected _extent: any[]
  group: any
  colorMap: any
  id: string
  options: any
  dataKeys: any
  style: SvgProperties
  cssSelector: string

  constructor(data: any, options: any) {
    this.data = data
    this.options = {
      r: { includeInTooltip: true, format: d => d },
      t: { includeInTooltip: true, format: d => d },
      x: { includeInTooltip: true, format: d => d },
      y: { includeInTooltip: true, format: d => d },
      transitionTime: 100
    },
    merge(
      this.options,
      options
    )

    // https://github.com/d3/d3-scale-chromatic
    this.colorMap = d3.scaleSequential(d3.interpolateWarm)
  }

  set data(d: any) {
    this._data = d
    this.extent = null
  }

  get data() {
    return this._data
  }

  set extent(extent: any[]) {
    this._extent = extent
  }

  get extent(): any[] {
    if (!this._extent) {
      this._extent = Array()
      for (let key in this.dataKeys) {
        let path = this.dataKeys[key]
        this._extent[path] = d3.extent(this._data, function(d) {
          return d[path]
        })
      }
    }
    return this._extent
  }

  addTo(axis: Axis, dataKeys: any, id: string, style: SvgProperties | string) {
    this.id = id ? id : ''
    if (typeof style === 'string') {
      this.cssSelector = style
    } else {
      this.style = style
    }
    this.dataKeys = dataKeys
    axis.charts.push(this)
    return this
  }

  plotter(axis: Axis, dataKeys: any) {
    if (axis instanceof CartesianAxis) {
      this.plotterCartesian(axis, dataKeys)
    } else if (axis instanceof PolarAxis) {
      this.plotterPolar(axis, dataKeys)
    }
  }

  protected toolTipFormatterCartesian(d) {
    let html = ''
    if (this.options.x.includeInTooltip) {
      html += 'x: ' + d.x.toFixed(2) + '<br/>'
    }
    if (this.options.y.includeInTooltip) {
      html += 'y: ' + d.y.toFixed(2)
    }
    return html
  }

  protected toolTipFormatterPolar(d) {
    let html = ''
    if (this.options.t.includeInTooltip) {
      html += 't: ' + d.t.toFixed(2) + '<br/>'
    }
    if (this.options.r.includeInTooltip) {
      html += 'r: ' + d.r.toFixed(2)
    }
    return html
  }

  abstract plotterCartesian(axis: CartesianAxis, dataKeys: any)
  abstract plotterPolar(axis: PolarAxis, dataKeys: any)
  abstract drawLegendSymbol(entry: any)

  protected selectGroup(axis: Axis, cssClass: string) {
    if (this.group == null) {
      this.group = axis.chartGroup.append('g')
      if (axis instanceof PolarAxis) {
        let direction = -axis.direction
        let intercept = 90 - 180 * axis.intercept / Math.PI
        this.group.attr('transform', 'rotate(' + intercept + ')scale(' + direction + ' ,1)')
      }
      this.group.attr('data-id', this.id)
      if ( this.cssSelector ) {
        if (this.cssSelector.lastIndexOf('#', 0) === 0) this.group.attr('id', this.cssSelector.substr(1))
        if (this.cssSelector.lastIndexOf('.', 0) === 0) {
          this.group.attr('class', cssClass + ' ' + this.cssSelector.substr(1))
        } else {
          this.group.attr('class', cssClass)
        }
      } else {
        Object.entries(this.style).forEach(
          ([prop, val]) => this.group.style(prop, val))
      }
    }
    return this.group
  }

  protected mapDataCartesian(axis: CartesianAxis, dataKeys: any, domain: any) {
    let xkey = dataKeys.xkey ? dataKeys.xkey : 'x'
    let ykey = dataKeys.ykey ? dataKeys.ykey : 'y'

    let bisectData = d3.bisector(function(d) {
      return d[xkey]
    })
    let i0 = bisectData.right(this.data, domain[0])
    let i1 = bisectData.left(this.data, domain[1])
    i0 = i0 > 0 ? i0 - 1 : 0
    i1 = i1 < this.data.length - 1 ? i1 + 1 : this.data.length

    let mappedData: any = this.data.slice(i0, i1).map(function(d: any) {
      return {
        x: d[xkey],
        y: d[ykey]
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

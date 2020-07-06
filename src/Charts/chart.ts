import * as d3 from 'd3'
import { SvgProperties } from 'csstype';
import { Axis, AxisIndex, CartesianAxis, PolarAxis } from '../Axis'
import merge from 'lodash/merge'

export const AUTO_SCALE = 1

function mean(x: number[] | number) {
  if (x instanceof Array) {
    return d3.mean(x)
  }
  return x
}

interface ChartOptionItem {
  includeInTooltip?: boolean;
}

interface ChartOptions {
  x? : ChartOptionItem;
  y? : ChartOptionItem;
  radial? : ChartOptionItem;
  angular? : ChartOptionItem;
  transitionTime: number
  colorScale?: any
  symbolId: number
}

export abstract class Chart {
  protected _data: any
  protected _extent: any[]
  group: any
  colorMap: any
  id: string
  options: ChartOptions
  axisIndex: AxisIndex
  style: SvgProperties
  cssSelector: string

  constructor(data: any, options: ChartOptions) {
    this.data = data
    this.options = merge(this.options,
      {
        radial: { includeInTooltip: true },
        angular: { includeInTooltip: true },
        x: { includeInTooltip: true },
        y: { includeInTooltip: true },
        transitionTime: 100
      },
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
      for (let axisKey in this.axisIndex) {
        let path = this.axisIndex[axisKey].key
        this._extent[path] = d3.extent(this._data, function(d) {
          return d[path]
        })
      }
    }
    return this._extent
  }

  addTo(axis: Axis, axisIndex: AxisIndex, id: string, style: SvgProperties | string) {
    this.id = id ? id : ''
    if (typeof style === 'string') {
      this.cssSelector = style
    } else {
      this.style = style
    }
    this.axisIndex = axisIndex
    if ( axisIndex.x && axisIndex.x.axisIndex === undefined) {
      this.axisIndex.x.axisIndex = 0
    }
    if ( axisIndex.y && axisIndex.y.axisIndex === undefined) {
      this.axisIndex.y.axisIndex = 0
    }
    if ( axisIndex.radial && axisIndex.radial.axisIndex === undefined) {
      this.axisIndex.radial.axisIndex = 0
    }
    if ( axisIndex.angular && axisIndex.angular.axisIndex === undefined) {
      this.axisIndex.angular.axisIndex = 0
    }
    axis.charts.push(this)
    return this
  }

  plotter(axis: Axis, axisIndex: AxisIndex) {
    if (axis instanceof CartesianAxis) {
      this.plotterCartesian(axis, axisIndex)
    } else if (axis instanceof PolarAxis) {
      this.plotterPolar(axis, axisIndex)
    }
  }

  protected toolTipFormatterCartesian(d) {
    const xKey = this.dataKeys.x
    const yKey = this.dataKeys.y
    let html = ''
    // TODO: supply formatter
    if (this.options.x.includeInTooltip) {
      html += xKey + ': ' + d[xKey] + '<br/>'
    }
    if (this.options.y.includeInTooltip) {
      html += yKey + 'y: ' + d[yKey]
    }
    return html
  }

  protected toolTipFormatterPolar(d) {
    const rKey = this.dataKeys.x
    const tKey = this.dataKeys.y
    let html = ''
    // TODO: supply formatter
    if (this.options.angular.includeInTooltip) {
      html += 't: ' + d[tKey] + '<br/>'
    }
    if (this.options.radial.includeInTooltip) {
      html += 'r: ' + d[rKey]
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
      } else if (this.style) {
        Object.entries(this.style).forEach(
          ([prop, val]) => this.group.style(prop, val))
      }
    }
    return this.group
  }

  get dataKeys () {
    const dataKeys: {x?: string, y?: string, radial?: string, angular?: string, color?: string} = {}
    for (let key in this.axisIndex) {
      dataKeys[key] = this.axisIndex[key].key ? this.axisIndex[key].key : key
    }
    return dataKeys
  }

  protected mapDataCartesian(domain: any) {

    let xKey = this.dataKeys.x

    let bisectData = d3.bisector(function(d) {
      return d[xKey]
    })
    let i0 = bisectData.right(this.data, domain[0])
    let i1 = bisectData.left(this.data, domain[1])
    i0 = i0 > 0 ? i0 - 1 : 0
    i1 = i1 < this.data.length - 1 ? i1 + 1 : this.data.length

    let mappedData: any = this.data.slice(i0, i1)
    return mappedData
  }


  // TODO: do not scale data only filter
  protected mapDataPolar(axis: PolarAxis) {
    let rKey = this.dataKeys.radial
    let tKey = this.dataKeys.angular

    let mappedData: any = this.data.map(function(d: any) {
      return {
        [rKey]: axis.radialScale(d[rKey]),
        [tKey]: axis.angularScale(d[tKey])
      }
    })
    return mappedData
  }
}

import * as d3 from 'd3'
import { SvgPropertiesHyphen } from 'csstype';
import { Axis, AxisIndex } from '../Axis/axis.js'
import { CartesianAxis } from '../Axis/cartesianAxis.js'
import { PolarAxis } from '../Axis/polarAxis.js'

import { defaultsDeep, merge } from 'lodash-es'
import { TooltipAnchor, TooltipPosition } from '../Tooltip/tooltip.js';

export const AUTO_SCALE = 1


interface ChartOptionItem {
  includeInTooltip?: boolean;
  format?: (value: number | Date) => string;
  paddingInner?: number;
  paddingOuter?: number;
}

interface ColorOptionItem {
  scale?: any;
  range?: any;
  map?: any;
}

export interface SymbolOptions {
  id: number
  size: number
  skip: number
}

export interface TextOptions {
  dx?: number
  dy?: number
  attributes: SvgPropertiesHyphen;
  formatter?: (d: unknown) => string;
}

export interface TooltipOptions {
  position?: TooltipPosition
  anchor?: TooltipAnchor
  toolTipFormatter?: (d: any) => string;
}

enum CurveType {
  Linear = 'linear',
  Basis = 'basis',
  Step = 'step',
  StepAfter = 'stepAfter',
  StepBefore  = 'stepBefore'
}

export interface ChartOptions {
  x? : ChartOptionItem;
  x1? : ChartOptionItem;
  y? : ChartOptionItem;
  radial? : ChartOptionItem;
  angular? : ChartOptionItem;
  color?: ColorOptionItem;
  transitionTime?: number;
  colorScale?: any;
  symbol?: SymbolOptions;
  curve?: string;
  text?: TextOptions;
  tooltip?: TooltipOptions;
}

export abstract class Chart {
  protected _data: any
  protected _extent: any
  group: d3.Selection<SVGElement, any, SVGElement, any>
  colorMap: any
  id: string
  options: ChartOptions
  axisIndex: AxisIndex
  style: SvgPropertiesHyphen
  cssSelector: string
  legend: any[] = []

  constructor(data: any, options: ChartOptions) {
    this.data = data
    this.options = defaultsDeep({},
      options,
      {
        radial: { includeInTooltip: true },
        angular: { includeInTooltip: true },
        x: { includeInTooltip: true },
        y: { includeInTooltip: true },
        transitionTime: 100
      }
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

  set extent(extent: any) {
    this._extent = extent
  }

  get extent(): any {
    if (!this._extent) {
      this._extent = []
      for (const axisKey in this.axisIndex) {
        const path = this.axisIndex[axisKey].key
        this._extent[path] = d3.extent(this._data, function(d) {
          return d[path]
        })
      }
    }
    return this._extent
  }

  addTo(axis: Axis, axisIndex: AxisIndex, id: string, style: SvgPropertiesHyphen | string) {
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

  setOptions (options: ChartOptions) {
    merge(this.options,
      options
    )
  }

  setAxisIndex (axisIndex: AxisIndex) {
    merge(this.axisIndex,
      axisIndex
    )
  }

  plotter(axis: Axis, axisIndex: AxisIndex) {
    if (axis instanceof CartesianAxis) {
      this.plotterCartesian(axis, axisIndex)
    } else if (axis instanceof PolarAxis) {
      this.plotterPolar(axis, axisIndex)
    }
  }

  protected defaultToolTipFormatterCartesian(d) {
    const xKey = this.dataKeys.x
    const yKey = this.dataKeys.y
    let html = ''
    if (this.options.x.includeInTooltip) {
      html += xKey + ': ' + d[xKey] + '<br/>'
    }
    if (this.options.y.includeInTooltip) {
      html += yKey + ': ' + d[yKey]
    }
    return html
  }

  protected toolTipFormatterCartesian(d) {
    if (this.options.tooltip === undefined) { return }
    else if (this.options.tooltip.toolTipFormatter === undefined) {
      return this.defaultToolTipFormatterCartesian(d)
    } else {
      return this.options.tooltip.toolTipFormatter(d)
    }
  }

  protected toolTipFormatterPolar(d) {
    if (this.options.tooltip === undefined) { return }
    else if (this.options.tooltip.toolTipFormatter === undefined) {
      return this.defaultToolTipFormatterPolar(d)
    } else {
      return this.options.tooltip.toolTipFormatter(d)
    }
  }

  protected defaultToolTipFormatterPolar(d) {
    const rKey = this.dataKeys.x
    const tKey = this.dataKeys.y
    let html = ''
    if (this.options.angular.includeInTooltip) {
      html += tKey + ': ' + d[tKey] + '<br/>'
    }
    if (this.options.radial.includeInTooltip) {
      html += rKey + ': ' + d[rKey]
    }
    return html
  }

  abstract plotterCartesian(axis: CartesianAxis, dataKeys: any)
  abstract plotterPolar(axis: PolarAxis, dataKeys: any)

  legendId (item: string) {
    return this.legend.findIndex((x) => x === item)
  }

  abstract drawLegendSymbol(legendId?: string, asSvgElement?: boolean)

  protected selectGroup(axis: CartesianAxis|PolarAxis, cssClass: string) {
    if (this.group == null) {
      this.group = axis.chartGroup.append('g')
      if (axis instanceof PolarAxis) {
        const direction = -axis.direction
        const intercept = 90 - 180 * axis.intercept / Math.PI
        this.group.attr('transform', 'rotate(' + intercept + ')scale(' + direction + ' ,1)')
      }
      this.group.attr('data-chart-id', this.id)
      if ( this.cssSelector ) {
        if (this.cssSelector.lastIndexOf('#', 0) === 0) this.group.attr('id', this.cssSelector.substring(1))
        if (this.cssSelector.lastIndexOf('.', 0) === 0) {
          this.group.attr('class', cssClass + ' ' + this.cssSelector.substring(1))
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
    const dataKeys: {x?: string, x1?: string, y?: string, radial?: string, angular?: string, color?: string, value?: string} = {}
    for (const key in this.axisIndex) {
      dataKeys[key] = this.axisIndex[key].key ? this.axisIndex[key].key : key
    }
    return dataKeys
  }

  get curveGenerator (): d3.CurveFactory {
    if (this.options.curve === undefined) return
    let curve
    switch (this.options.curve) {
      case CurveType.Basis:
        curve = d3.curveBasis
        break
      case CurveType.Linear: // default
        curve = d3.curveLinear
        break
      case CurveType.Step:
        curve = d3.curveStep
        break
      case CurveType.StepAfter:
        curve = d3.curveStepAfter
        break
      case CurveType.StepBefore:
        curve = d3.curveStepBefore
    }
    return curve
  }

  protected mapDataCartesian(domain: any) {

    const xKey = this.dataKeys.x

    const bisectData = d3.bisector(function(d) {
      return d[xKey]
    })
    let i0 = bisectData.right(this.data, domain[0])
    let i1 = bisectData.left(this.data, domain[1])
    i0 = i0 > 0 ? i0 - 1 : 0
    i1 = i1 < this.data.length - 1 ? i1 + 1 : this.data.length
    return this.data.slice(i0, i1)
  }

  protected applyStyle(source: Element, element: d3.Selection<SVGElement, unknown, SVGElement, unknown>, props: string[]) {
    if (this.style === undefined) {
      const s = window.getComputedStyle(source)
      for ( const key of props) {
        element.style(key, s.getPropertyValue(key))
      }
    } else {
      for ( const key of props) {
        if ( this.style[key] ) element.style(key, this.style[key])
      }
    }
  }
}

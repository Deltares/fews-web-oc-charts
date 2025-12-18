import * as d3 from 'd3'
import { SvgPropertiesHyphen } from 'csstype'
import { Axes, AxisIndex } from '../Axes/axes.js'
import { CartesianAxes, PolarAxes } from '../index.js'
import { defaultsDeep, isNull, merge } from 'lodash-es'
import { TooltipAnchor, TooltipPosition } from '../Tooltip/tooltip.js'
import type { DataPoint, DataPointXY, DataValue } from '../Data/types.js'
import { dataExtentFor } from '../Data/dataExtentFor.js'
import { setAlphaForColor } from '../Utils/setAlphaForColor.js'

export const AUTO_SCALE = 1

export type PointAlignment = 'right' | 'middle' | 'left'

interface ChartOptionItem {
  includeInTooltip?: boolean
  includeInAutoScale?: boolean
  extentFilter?: (d: DataPoint) => boolean
  format?: (value: number | Date) => string
  paddingInner?: number
  paddingOuter?: number
}

interface ColorOptionItem {
  scale?: any
  range?: any
  map?: any
}

export interface SymbolOptions {
  id?: number
  size?: number
  skip?: number
}

export interface TextOptions {
  dx?: number
  dy?: number
  attributes?: SvgPropertiesHyphen
  angle?: number
  position?: TextPosition
  formatter?: (d: unknown) => string
}

export enum TextPosition {
  Top = 'top',
  Bottom = 'bottom',
}

export interface TooltipOptions {
  position?: TooltipPosition
  anchor?: TooltipAnchor
  alignment?: PointAlignment
  toolTipFormatter?: (d: DataPointXY) => HTMLElement
}

export interface MouseOverOptions {
  formatter?: (
    d: void | { point: DataPointXY; style: SvgPropertiesHyphen },
    precision: number,
  ) => HTMLSpanElement | undefined
  textFormatter?: (d: DataValue, precision: number) => string
}

export const CurveType = {
  Linear: 'linear',
  Basis: 'basis',
  Step: 'step',
  StepAfter: 'stepAfter',
  StepBefore: 'stepBefore',
} as const

export type CurveType = (typeof CurveType)[keyof typeof CurveType]

export interface ChartOptionsForKeys {
  x?: ChartOptionItem
  x1?: ChartOptionItem
  y?: ChartOptionItem
  radial?: ChartOptionItem
  angular?: ChartOptionItem
}

const chartKeys: (keyof ChartOptionsForKeys)[] = ['x', 'x1', 'y', 'radial', 'angular']

export interface ChartOptions extends ChartOptionsForKeys {
  transitionTime?: number
  color?: ColorOptionItem
  colorScale?: any
  symbol?: SymbolOptions
  curve?: CurveType
  text?: TextOptions
  tooltip?: TooltipOptions
  mouseover?: MouseOverOptions
}

export interface DataKeys {
  x?: string
  x1?: string
  y?: string
  radial?: string
  angular?: string
  color?: string
  value?: string
}

export abstract class Chart {
  protected _data: DataPoint[]
  protected datum: any
  protected _extent: any
  protected _isVisible: boolean = true
  protected highlight: d3.Selection<SVGGElement, any, SVGGElement, any>
  group: d3.Selection<SVGGElement, any, SVGGElement, any>
  colorMap: any
  id: string
  options: ChartOptions
  axisIndex: AxisIndex
  style: SvgPropertiesHyphen
  cssSelector: string
  legend: any[] = []

  constructor(data: any, options: ChartOptions) {
    this.data = data
    this.options = defaultsDeep({}, options, {
      radial: { includeInTooltip: true, includeInAutoScale: true },
      angular: { includeInTooltip: true, includeInAutoScale: true },
      x: { includeInTooltip: true, includeInAutoScale: true },
      y: { includeInTooltip: true, includeInAutoScale: true },
      transitionTime: 100,
    })
    // https://github.com/d3/d3-scale-chromatic
    this.colorMap = d3.scaleSequential(d3.interpolateWarm)
  }

  set data(d: any) {
    this._data = d
    this.extent = undefined
  }

  get data() {
    return this._data
  }

  set extent(extent: Record<string, number[] | Date[] | null[]>) {
    this._extent = extent
  }

  get extent(): Record<string, number[] | Date[] | null[]> {
    if (!this._extent) this._extent = {}
    for (const key in this.dataKeys) {
      const path = this.dataKeys[key]
      if (this._extent[path] === undefined) {
        this._extent[path] = dataExtentFor(this._data, path, this.options[key]?.extentFilter)
      }
    }
    return this._extent
  }

  get visible(): boolean {
    return this._isVisible
  }

  set visible(value: boolean) {
    if (value) {
      this.group.style('visibility', 'visible')
      this.highlight?.style('visibility', 'visible')
    } else {
      this.group.style('visibility', 'hidden')
      this.highlight?.style('visibility', 'hidden')
    }
    this._isVisible = value
  }

  addTo(axis: Axes, axisIndex: AxisIndex, id?: string, style?: SvgPropertiesHyphen | string) {
    this.id = id ? id : ''
    if (typeof style === 'string') {
      this.cssSelector = style
    } else {
      this.style = style
    }
    this.axisIndex = axisIndex
    if (axisIndex.x && axisIndex.x.axisIndex === undefined) {
      this.axisIndex.x.axisIndex = 0
    }
    if (axisIndex.y && axisIndex.y.axisIndex === undefined) {
      this.axisIndex.y.axisIndex = 0
    }
    if (axisIndex.radial && axisIndex.radial.axisIndex === undefined) {
      this.axisIndex.radial.axisIndex = 0
    }
    if (axisIndex.angular && axisIndex.angular.axisIndex === undefined) {
      this.axisIndex.angular.axisIndex = 0
    }
    axis.charts.push(this)
    return this
  }

  setOptions(options: ChartOptions) {
    for (const key of chartKeys) {
      if (key in options && options[key].extentFilter !== undefined) {
        this._extent[key] = undefined
      }
    }
    merge(this.options, options)
  }

  setAxisIndex(axisIndex: AxisIndex) {
    merge(this.axisIndex, axisIndex)
  }

  plotter(axis: Axes, axisIndex: AxisIndex) {
    if (axis instanceof CartesianAxes) {
      this.plotterCartesian(axis, axisIndex)
    } else if (axis instanceof PolarAxes) {
      this.plotterPolar(axis, axisIndex)
    }
  }

  mouseOverFormatterCartesian(
    d: void | { point: DataPointXY; style: SvgPropertiesHyphen },
    precision: number,
  ): HTMLSpanElement | undefined {
    if (this.options.mouseover?.formatter === undefined) {
      return this.defaultMouseOverFormatterCartesian(d, precision)
    } else {
      return this.options.mouseover.formatter(d, precision)
    }
  }

  protected defaultMouseOverFormatterCartesian(
    d: void | { point: DataPointXY; style: SvgPropertiesHyphen },
    precision: number,
  ): HTMLSpanElement | undefined {
    if (d) {
      let color = d.style?.color
      if (color) {
        color = setAlphaForColor(color, 1)
      }
      const value = d.point
      if (value.y !== undefined) {
        const label = this.mouseOverTextFormatter(value.y, precision)
        const spanElement = document.createElement('span')
        spanElement.style.color = color
        spanElement.innerText = label
        return spanElement
      }
    }
    return undefined
  }

  protected defaultMouseOverTextFormatter(data: DataValue, precision: number): string {
    const s = d3.formatSpecifier('f')
    s.precision = precision
    const formatNumber = d3.format(s.toString())

    if (Array.isArray(data)) {
      const labels = [...data].sort((a, b) => a - b).map(formatNumber)
      return labels.join('–')
    } else if (typeof data === 'number') {
      return formatNumber(data)
    } else if (data instanceof Date) {
      return data.toISOString()
    }
  }

  protected mouseOverTextFormatter(d: DataValue, precision: number): string {
    if (this.options.mouseover?.textFormatter === undefined) {
      return this.defaultMouseOverTextFormatter(d, precision)
    } else {
      return this.options.mouseover.textFormatter(d, precision)
    }
  }

  protected defaultToolTipFormatterCartesian(d): HTMLElement {
    const xKey = this.dataKeys.x
    const yKey = this.dataKeys.y
    const html = document.createElement('div')
    if (this.options.x.includeInTooltip) {
      const spanElement = document.createElement('span')
      spanElement.innerText = this.defaultToolTipText(d[xKey], xKey, 2)
      html.appendChild(spanElement)
    }
    if (this.options.y.includeInTooltip) {
      const spanElement = document.createElement('span')
      spanElement.innerText = this.defaultToolTipText(d[yKey], yKey, 2)
      html.appendChild(spanElement)
    }
    return html
  }

  protected toolTipFormatterCartesian(d): HTMLElement {
    if (this.options.tooltip === undefined) {
      return
    } else if (this.options.tooltip.toolTipFormatter === undefined) {
      return this.defaultToolTipFormatterCartesian(d)
    } else {
      return this.options.tooltip.toolTipFormatter(d)
    }
  }

  protected toolTipFormatterPolar(d): HTMLElement {
    if (this.options.tooltip === undefined) {
      return
    } else if (this.options.tooltip.toolTipFormatter === undefined) {
      return this.defaultToolTipFormatterPolar(d)
    } else {
      return this.options.tooltip.toolTipFormatter(d)
    }
  }

  protected defaultToolTipFormatterPolar(d): HTMLElement {
    const tKey = this.dataKeys.angular
    const rKey = this.dataKeys.radial
    const html = document.createElement('div')
    if (this.options.angular.includeInTooltip) {
      const spanElement = document.createElement('span')
      spanElement.innerText = this.defaultToolTipText(d[tKey], tKey, 0)
      html.appendChild(spanElement)
    }
    if (this.options.radial.includeInTooltip) {
      const spanElement = document.createElement('span')
      spanElement.innerText = this.defaultToolTipText(d[rKey], rKey, 0)
      html.appendChild(spanElement)
    }
    return html
  }

  protected defaultToolTipText(data: any, key: string, decimals: number): string {
    if (data instanceof Array) {
      if (data[0] != data[1]) {
        return key + ': ' + data[0].toFixed(decimals) + ' - ' + data[1].toFixed(decimals)
      } else {
        return key + ': ' + data[0].toFixed(decimals)
      }
    } else if (typeof data === 'number') {
      return key + ': ' + data.toFixed(decimals)
    } else {
      return key + ': ' + data
    }
  }

  abstract plotterCartesian(axis: CartesianAxes, dataKeys: any)
  abstract plotterPolar(axis: PolarAxes, dataKeys: any)

  legendId(item: string) {
    return this.legend.findIndex((x) => x === item)
  }

  abstract drawLegendSymbol(legendId?: string, asSvgElement?: boolean)

  public onPointerOver() {}

  public onPointerMove(
    _value: number | Date,
    _key: 'x' | 'y',
    _xScale,
    _yScale,
  ): void | { point: DataPointXY; style: SvgPropertiesHyphen } {}

  public onPointerOut() {}

  protected findIndex(
    value: number | Date,
    key: 'x' | 'y',
    method?: PointAlignment,
  ): number | undefined {
    const datum = this.datum
    if (!datum || datum.length === 0) return

    const xKey = this.dataKeys.x
    const yKey = this.dataKeys.y
    const targetKey = key === 'x' ? xKey : yKey
    const inverseKey = key === 'x' ? yKey : xKey

    let isInverseNullFn = (d) => isNull(d[inverseKey])
    if (Array.isArray(datum[0][inverseKey])) {
      isInverseNullFn = (d) => isNull(d[inverseKey][0])
    }

    const bisector = d3.bisector((d) => d[targetKey])[method === 'middle' ? 'center' : 'left']
    let idx = bisector(datum, value)
    if (method === 'left') idx = idx - 1

    // before first point
    if (idx === 0 && datum[idx][targetKey] > value) return
    // after last point
    if (idx === datum.length - 1 && datum[idx][targetKey] < value) return
    // current point null
    if (!datum[idx] || isInverseNullFn(datum[idx])) return

    // check neighbors for middle alignment
    if (method === 'middle') {
      if (
        (value < datum[idx][targetKey] && isInverseNullFn(datum[idx - 1])) ||
        (value > datum[idx][targetKey] && isInverseNullFn(datum[idx + 1]))
      ) {
        return
      }
    }

    return idx
  }

  protected selectGroup(axis: CartesianAxes | PolarAxes, cssClass: string) {
    if (this.group === undefined) {
      this.group = axis.chartGroup.append('g')
      if (axis instanceof PolarAxes) {
        const direction = -axis.direction
        const intercept = 90 - (180 * axis.intercept) / Math.PI
        this.group.attr('transform', 'rotate(' + intercept + ')scale(' + direction + ' ,1)')
      }
      this.group.attr('data-chart-id', this.id)
      if (this.cssSelector) {
        if (this.cssSelector.lastIndexOf('#', 0) === 0)
          this.group.attr('id', this.cssSelector.substring(1))
        if (this.cssSelector.lastIndexOf('.', 0) === 0) {
          this.group.attr('class', cssClass + ' ' + this.cssSelector.substring(1))
        } else {
          this.group.attr('class', cssClass)
        }
      } else if (this.style) {
        Object.entries(this.style).forEach(([prop, val]) => this.group.style(prop, val))
      }
    }
    return this.group
  }

  protected selectHighlight(axis: CartesianAxes, SVGElementName: string) {
    if (this.highlight === undefined) {
      const front = axis.canvas.select<SVGGElement>('.front')
      this.highlight = front.append('g').attr('clip-path', 'url(#' + axis.clipPathId + ')')
      this.highlight.attr('data-chart-id', this.id)
      this.highlight.append(SVGElementName)
    }
    return this.highlight
  }

  get dataKeys() {
    const dataKeys: DataKeys = {}
    for (const key in this.axisIndex) {
      dataKeys[key] = this.axisIndex[key].key ? this.axisIndex[key].key : key
    }
    return dataKeys
  }

  get curveGenerator(): d3.CurveFactory {
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

    const bisectData = d3.bisector(function (d) {
      return d[xKey]
    })
    let i0 = bisectData.right(this.data, domain[0])
    let i1 = bisectData.left(this.data, domain[1])
    i0 = i0 > 0 ? i0 - 1 : 0
    i1 = i1 < this.data.length - 1 ? i1 + 1 : this.data.length
    return this.data.slice(i0, i1)
  }

  protected applyStyle(
    source: Element,
    element: d3.Selection<SVGElement, unknown, SVGElement, unknown>,
    props: string[],
  ) {
    if (this.style === undefined) {
      const s = window.getComputedStyle(source)
      for (const key of props) {
        element.style(key, s.getPropertyValue(key))
      }
    } else {
      for (const key of props) {
        if (this.style[key]) element.style(key, this.style[key])
      }
    }
  }
}

import * as d3 from 'd3'
import { SvgPropertiesHyphen } from 'csstype'
import { Axes, AxisIndex } from '../Axes/axes.js'
import type { CartesianAxesIndex } from '../Axes/cartesianAxes.js'
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
  scale?: d3.ScaleContinuousNumeric<number, number>
  range?: string[]
  map?: (value: number | Date) => string
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
  colorScale?: number
  symbol?: SymbolOptions
  curve?: CurveType
  text?: TextOptions
  tooltip?: TooltipOptions
  mouseover?: MouseOverOptions
}

type ResolvedChartOptions = ChartOptions &
  Required<Pick<ChartOptionsForKeys, 'x' | 'y' | 'radial' | 'angular'>> &
  Required<Pick<ChartOptions, 'transitionTime'>>

export interface DataKeys {
  x?: string
  x1?: string
  y?: string
  radial?: string
  angular?: string
  color?: string
  value?: string
}

type NewType = Record<string, Array<number | Date | null | undefined>>

export abstract class Chart {
  protected _data!: DataPoint[]
  protected datum: DataPoint[] = []
  protected _extent: Record<string, Array<number | Date | null | undefined>> = {}
  protected _isVisible: boolean = true
  protected highlight!: d3.Selection<SVGGElement, unknown, null, unknown>
  group!: d3.Selection<SVGGElement, unknown, null, unknown>
  colorMap: d3.ScaleSequential<string>
  id!: string
  options: ResolvedChartOptions
  axisIndex!: AxisIndex
  style?: SvgPropertiesHyphen
  cssSelector?: string
  legend: string[] = []

  constructor(data: DataPoint[], options: ChartOptions) {
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

  set data(d: DataPoint[]) {
    this._data = d
    this.extent = undefined
  }

  get data(): DataPoint[] {
    return this._data
  }

  set extent(extent: NewType | undefined) {
    this._extent = extent ?? {}
  }

  get extent(): Record<string, Array<number | Date | null | undefined>> {
    if (!this._extent) this._extent = {}
    for (const key of chartKeys) {
      const path = this.dataKeys[key]
      if (path !== undefined && this._extent[path] === undefined) {
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
    this.id = id ?? ''
    if (typeof style === 'string') {
      this.cssSelector = style
    } else {
      this.style = style
    }
    this.axisIndex = axisIndex
    if (axisIndex.x?.axisIndex === undefined && axisIndex.x !== undefined) {
      axisIndex.x.axisIndex = 0
    }
    if (axisIndex.y?.axisIndex === undefined && axisIndex.y !== undefined) {
      axisIndex.y.axisIndex = 0
    }
    if (axisIndex.radial?.axisIndex === undefined && axisIndex.radial !== undefined) {
      axisIndex.radial.axisIndex = 0
    }
    if (axisIndex.angular?.axisIndex === undefined && axisIndex.angular !== undefined) {
      axisIndex.angular.axisIndex = 0
    }
    axis.charts.push(this)
    return this
  }

  setOptions(options: ChartOptions) {
    for (const key of chartKeys) {
      if (options[key]?.extentFilter !== undefined) {
        delete this._extent[key]
      }
    }
    merge(this.options, options)
  }

  setAxisIndex(axisIndex: AxisIndex) {
    merge(this.axisIndex, axisIndex)
  }

  plotter(axis: Axes, axisIndex: AxisIndex) {
    if (axis instanceof CartesianAxes) {
      this.plotterCartesian(axis, axisIndex as CartesianAxesIndex)
    } else if (axis instanceof PolarAxes) {
      this.plotterPolar(axis, axisIndex)
    }
  }

  mouseOverFormatterCartesian(
    key: 'x' | 'y',
    d: void | { point: DataPointXY; style: SvgPropertiesHyphen },
    precision: number,
  ): HTMLSpanElement | undefined {
    if (this.options.mouseover?.formatter === undefined) {
      return this.defaultMouseOverFormatterCartesian(key, d, precision)
    } else {
      return this.options.mouseover.formatter(d, precision)
    }
  }

  protected defaultMouseOverFormatterCartesian(
    key: 'x' | 'y',
    d: void | { point: DataPointXY; style: SvgPropertiesHyphen },
    precision: number,
  ): HTMLSpanElement | undefined {
    if (d) {
      let color = d.style?.color
      if (color) {
        color = setAlphaForColor(color, 1)
      }
      const value = d.point
      if (value[key] !== undefined && value[key] !== null) {
        const label = this.mouseOverTextFormatter(value[key], precision)
        const spanElement = document.createElement('span')
        spanElement.style.color = color ?? ''
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
      const labels = [...data].sort((a, b) => a - b).map((value) => formatNumber(value))
      return labels.join('–')
    } else if (typeof data === 'number') {
      return formatNumber(data)
    } else if (data instanceof Date) {
      return data.toISOString()
    }
    return ''
  }

  protected mouseOverTextFormatter(d: DataValue, precision: number): string {
    if (this.options.mouseover?.textFormatter === undefined) {
      return this.defaultMouseOverTextFormatter(d, precision)
    } else {
      return this.options.mouseover.textFormatter(d, precision)
    }
  }

  protected defaultToolTipFormatterCartesian(d: DataPoint): HTMLElement {
    const xKey = this.dataKeys.x
    const yKey = this.dataKeys.y
    const html = document.createElement('div')
    this.appendTooltipSpan(html, this.options.x.includeInTooltip, d[xKey], xKey, 2)
    this.appendTooltipSpan(html, this.options.y.includeInTooltip, d[yKey], yKey, 2)
    return html
  }

  protected toolTipFormatterCartesian(d: DataPoint): HTMLElement | undefined {
    if (this.options.tooltip === undefined) {
      return
    } else if (this.options.tooltip.toolTipFormatter === undefined) {
      return this.defaultToolTipFormatterCartesian(d)
    } else {
      return this.options.tooltip.toolTipFormatter(d as DataPointXY)
    }
  }

  protected toolTipFormatterPolar(d: DataPoint): HTMLElement | undefined {
    if (this.options.tooltip === undefined) {
      return
    } else if (this.options.tooltip.toolTipFormatter === undefined) {
      return this.defaultToolTipFormatterPolar(d)
    } else {
      return this.options.tooltip.toolTipFormatter(d as DataPointXY)
    }
  }

  protected defaultToolTipFormatterPolar(d: DataPoint): HTMLElement {
    const tKey = this.dataKeys.angular
    const rKey = this.dataKeys.radial
    const html = document.createElement('div')
    this.appendTooltipSpan(html, this.options.angular.includeInTooltip, d[tKey], tKey, 0)
    this.appendTooltipSpan(html, this.options.radial.includeInTooltip, d[rKey], rKey, 0)
    return html
  }

  protected defaultToolTipText(data: any, key: string, decimals: number): string {
    if (Array.isArray(data)) {
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

  protected appendTooltipSpan(
    html: HTMLElement,
    includeInTooltip: boolean | undefined,
    data: any,
    key: string,
    decimals: number,
  ) {
    if (!includeInTooltip) return
    const spanElement = document.createElement('span')
    spanElement.innerText = this.defaultToolTipText(data, key, decimals)
    html.appendChild(spanElement)
  }

  protected addTooltipHandlers(
    elements: d3.Selection<any, any, any, any>,
    axis: CartesianAxes | PolarAxes,
    options: {
      isPolar?: boolean
      expectedAnchor?: TooltipAnchor | null
      positionFn?: (event: any, d: any) => [number, number]
    } = {},
  ) {
    const tooltip = this.options.tooltip
    if (tooltip === undefined) return
    const { isPolar = false, expectedAnchor = TooltipAnchor.Pointer, positionFn } = options

    elements
      .on('pointerover', (e: any, d: any) => {
        if (
          expectedAnchor !== null &&
          tooltip.anchor !== undefined &&
          tooltip.anchor !== expectedAnchor
        ) {
          console.error(
            'Tooltip not implemented for anchor ',
            tooltip.anchor,
            ', using ',
            expectedAnchor,
            ' instead.',
          )
        }
        axis.tooltip.show()
        const [x, y] = positionFn ? positionFn(e, d) : d3.pointer(e, axis.container)
        const content = isPolar ? this.toolTipFormatterPolar(d) : this.toolTipFormatterCartesian(d)
        if (content !== undefined) {
          axis.tooltip.update(content, tooltip.position ?? TooltipPosition.Top, x, y)
        }
      })
      .on('pointerout', () => {
        axis.tooltip.hide()
      })
  }

  abstract plotterCartesian(axis: CartesianAxes, dataKeys: CartesianAxesIndex): void
  abstract plotterPolar(axis: PolarAxes, dataKeys: AxisIndex): void

  legendId(item: string) {
    return this.legend.indexOf(item)
  }

  abstract drawLegendSymbol(legendId?: string, asSvgElement?: boolean): SVGElement | null

  public onPointerOver() {}

  public onPointerMove(
    _value: number | Date,
    _key: 'x' | 'y',
    _xScale: d3.ScaleContinuousNumeric<number, number>,
    _yScale: d3.ScaleContinuousNumeric<number, number>,
  ): void | { point: DataPointXY; style: SvgPropertiesHyphen } {}

  public onPointerOut() {}

  protected findIndex(
    value: number | Date,
    key: 'x' | 'y',
    method?: PointAlignment,
  ): number | undefined {
    if (!this.datum || this.datum.length === 0) return

    const xKey = this.dataKeys.x
    const yKey = this.dataKeys.y
    const targetKey = key === 'x' ? xKey : yKey
    const inverseKey = key === 'x' ? yKey : xKey

    const firstValue = this.datum[0][targetKey]
    const lastValue = this.datum[this.datum.length - 1][targetKey]
    if (firstValue === null || lastValue === null) return
    const isDescending = lastValue < firstValue
    const datum = isDescending ? [...this.datum].reverse() : this.datum

    let isInverseNullFn = (d: DataPoint) => isNull(d[inverseKey])
    if (Array.isArray(datum[0][inverseKey])) {
      isInverseNullFn = (d: DataPoint) => {
        const inverseValue = d[inverseKey]
        return isNull(Array.isArray(inverseValue) ? inverseValue[0] : inverseValue)
      }
    }

    const bisector = d3.bisector<DataPoint, number | Date>((d) => d[targetKey] as number | Date)
    let idx = method === 'middle' ? bisector.center(datum, value) : bisector.left(datum, value)
    if (method === 'left') idx = idx - 1

    if (!this.isIndexValid(datum, idx, targetKey, value, isInverseNullFn)) return

    if (
      method === 'middle' &&
      this.isMiddleAlignmentInvalid(value, datum, idx, targetKey, isInverseNullFn)
    )
      return

    return isDescending ? datum.length - 1 - idx : idx
  }

  private isIndexValid(
    datum: DataPoint[],
    idx: number,
    targetKey: string,
    value: number | Date,
    isInverseNullFn: (d: DataPoint) => boolean,
  ): boolean {
    const current = datum[idx]
    if (current?.[targetKey] === null) return false
    if (idx === 0 && current[targetKey] > value) return false
    if (idx === datum.length - 1 && current[targetKey] < value) return false
    if (isInverseNullFn(current)) return false
    return true
  }

  private isMiddleAlignmentInvalid(
    value: number | Date,
    datum: DataPoint[],
    idx: number,
    targetKey: string,
    isInverseNullFn: (d: DataPoint) => boolean,
  ): boolean {
    const current = datum[idx]
    const previous = datum[idx - 1]
    const next = datum[idx + 1]
    if (!current || !previous || !next || current[targetKey] === null) return true
    return (
      (value < current[targetKey] && isInverseNullFn(previous)) ||
      (value > current[targetKey] && isInverseNullFn(next))
    )
  }

  protected selectGroup(axis: CartesianAxes | PolarAxes, cssClass: string) {
    if (this.group === undefined || this.group.empty()) {
      this.group = axis.chartGroup.append<SVGGElement>('g')
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

  protected showHighlight(
    highlightSelector: string,
    highlightStyleProp: string,
    sourceSelector: string,
    sourceStyleProp: string = highlightStyleProp,
    options: { resetTransform?: boolean; requireSource?: boolean } = {},
  ) {
    const source = this.group.select(sourceSelector).node() as Element | null
    if (source === null && options.requireSource) return
    const value =
      source === null ? '' : window.getComputedStyle(source).getPropertyValue(sourceStyleProp)
    const selection = this.highlight
      .select(highlightSelector)
      .style('opacity', 1)
      .style(highlightStyleProp, value)
    if (options.resetTransform) selection.attr('transform', null)
    return selection
  }

  protected hideHighlight(highlightSelector: string) {
    this.highlight.select(highlightSelector).style('opacity', 0)
  }

  protected pointOnPointerOver() {
    this.showHighlight('circle', 'fill', 'path', 'stroke', { resetTransform: true })
  }

  protected pointOnPointerOut() {
    this.hideHighlight('circle')
  }

  protected pointOnPointerMove(
    value: number | Date,
    key: 'x' | 'y',
    xScale: d3.ScaleContinuousNumeric<number, number>,
    yScale: d3.ScaleContinuousNumeric<number, number>,
  ): void | { point: DataPointXY; style: SvgPropertiesHyphen } {
    const index = this.findIndex(value, key, this.options.tooltip?.alignment ?? 'middle')
    const point = index === undefined ? undefined : this.datum[index]
    if (point === undefined) {
      this.hideHighlight('circle')
      return
    }

    const element = this.group.select('path')
    const color =
      element.node() === null
        ? null
        : window.getComputedStyle(element.node() as Element).getPropertyValue('stroke')

    this.highlight
      .select('circle')
      .attr('transform', () => {
        return `translate(${xScale(point.x as number)}, ${yScale(point.y as number)})`
      })
      .style('opacity', 1)
      .style('fill', color ?? '')

    if (color === null) {
      return { point: point as DataPointXY, style: {} }
    } else {
      return { point: point as DataPointXY, style: { color } }
    }
  }

  protected selectOrAppend<E extends Element>(
    tag: string,
  ): d3.Selection<E, unknown, null, undefined> {
    const selection = this.group.select<E>(tag)
    return selection.empty() ? this.group.append<E>(tag) : selection
  }

  protected drawStepBarsLegendSymbol(asSvgElement?: boolean): SVGElement | null {
    const props = ['fill']
    const source = this.group.select('rect').node() as Element
    const { svg, group } = this.createLegendSymbolCanvas()
    const element = group.append('g')
    element.append('rect').attr('x', 0).attr('y', -8).attr('width', 5).attr('height', 18)
    this.applyStyle(source, element, props)
    element.append('rect').attr('x', 5).attr('y', -6).attr('width', 5).attr('height', 16)
    this.applyStyle(source, element, props)
    element.append('rect').attr('x', 10).attr('y', -5).attr('width', 5).attr('height', 15)
    this.applyStyle(source, element, props)
    return this.finalizeLegendSymbol(svg, element, asSvgElement)
  }

  protected getAutoScaleColorScale(colorKey: string): d3.ScaleLinear<number, number> {
    const colorScale = d3.scaleLinear().domain([0, 1])
    if (this.options.colorScale === AUTO_SCALE) {
      const colorValues = this.data
        .map((d) => d[colorKey])
        .filter((value): value is number => typeof value === 'number')
      const colorExtent = d3.extent(colorValues)
      if (colorExtent[0] !== undefined && colorExtent[1] !== undefined) {
        colorScale.domain(colorExtent)
      }
    }
    return colorScale
  }

  get dataKeys(): Record<string, string> {
    const dataKeys: Record<string, string> = {}
    for (const key of Object.keys(this.axisIndex) as (keyof AxisIndex)[]) {
      const axisIndex = this.axisIndex[key]
      if (axisIndex !== undefined) dataKeys[key] = axisIndex.key ? axisIndex.key : key
    }
    return dataKeys
  }

  get curveGenerator(): d3.CurveFactory | undefined {
    if (this.options.curve === undefined) return undefined
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

    const bisectData = d3.bisector<DataPoint, number | Date>(function (d) {
      return d[xKey] as number | Date
    })
    let i0 = bisectData.right(this.data, domain[0])
    let i1 = bisectData.left(this.data, domain[1])
    i0 = i0 > 0 ? i0 - 1 : 0
    i1 = i1 < this.data.length - 1 ? i1 + 1 : this.data.length
    return this.data.slice(i0, i1)
  }

  protected applyStyle<E extends SVGGraphicsElement>(
    source: Element,
    element: d3.Selection<E, any, any, any>,
    props: string[],
  ) {
    if (this.style === undefined) {
      const s = window.getComputedStyle(source)
      for (const key of props) {
        element.style(key, s.getPropertyValue(key))
      }
    } else {
      for (const key of props) {
        const value = (this.style as Record<string, string | undefined>)[key]
        if (value) element.style(key, value)
      }
    }
  }

  protected getColorMap(
    scale?: d3.ScaleContinuousNumeric<number, number>,
  ): (value: number | Date) => string {
    if (this.options.color?.map) {
      return this.options.color?.map
    } else {
      return (value: number | Date) => {
        return d3.scaleSequential(d3.interpolateWarm)(scale?.(value) ?? 0)
      }
    }
  }

  protected setPadding(scale: d3.ScaleBand<string>, options?: ChartOptionItem) {
    if (options?.paddingOuter) {
      scale.paddingOuter(options.paddingOuter)
    }
    if (options?.paddingInner) {
      scale.paddingInner(options.paddingInner)
    }
  }

  protected createLegendSymbolCanvas(transform: string = 'translate(0, 10)') {
    const svg = d3.create('svg').attr('width', 20).attr('height', 20)
    const group = svg.append('g').attr('transform', transform)
    return { svg, group }
  }

  protected finalizeLegendSymbol<E extends SVGGraphicsElement>(
    svg: d3.Selection<SVGSVGElement, any, any, any>,
    element: d3.Selection<E, any, any, any>,
    asSvgElement?: boolean,
  ): SVGElement | null {
    return asSvgElement ? element.node() : svg.node()
  }
}

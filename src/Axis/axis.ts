import * as d3 from 'd3'
import { Chart } from '../Charts'
import { Visitor } from '../Visitors'
import defaultsDeep from 'lodash/defaultsDeep'
import merge from 'lodash/merge'
import { Tooltip } from '../Tooltip'

export interface Margin {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

export enum AxisType {
  time = 'time',
  value = 'value',
  degrees = 'degrees',
  band = 'band'
}

export interface AxisOptions {
  label?: string;
  labelAngle?: number;
  type?: AxisType;
  unit?: string;
  showGrid?: boolean;
  format?: Function;
  domain?: [number, number] | [Date, Date];
  nice?: boolean;
  includeZero?: boolean;
  symmetric?: boolean;
}

export interface AxesOptions {
  transitionTime?: number;
  margin?: Margin;
}

interface AxisIndexItem {
  key: string; axisIndex: number;
}

export interface AxisIndex {
  x?: AxisIndexItem;
  x1?: { key: string};
  y?: AxisIndexItem;
  radial?: AxisIndexItem;
  angular?: AxisIndexItem;
  value?: { key: string};
  color?: { key: string};
}

export abstract class Axis {
  tooltip: Tooltip
  type: string
  view: any
  defs: any
  canvas: any
  svg: d3.Selection<SVGElement, any, SVGElement, any>
  container: HTMLElement
  width: number
  height: number
  margin: { top: number; right: number; bottom: number; left: number }
  options: AxesOptions = {}
  chartGroup: d3.Selection<SVGElement,any,SVGElement,any>
  charts: Chart[]
  initialDraw = true
  visitors: Visitor[]
  timeZone: string

  constructor(container: HTMLElement, width: number | null, height: number| null, options: AxesOptions, defaultOptions: any) {
    this.container = container
    this.options = defaultsDeep(
      this.options,
      options,
      defaultOptions
    )
    this.timeZone = 'Europe/Amsterdam'


    // Using the d3.formatLocale is not easy for generic plotting
    d3.formatDefaultLocale({
      decimal: '.',
      thousands: '\u2009',
      grouping: [3],
      currency: ['$', '']
    })

    this.margin = { ...{ top: 40, right: 40, bottom: 40, left: 40 }, ...options.margin }
    this.svg = d3
      .select(container)
      .append('svg')
      .attr('class', 'wb-charts')
      .attr('overflow', 'visible')
    this.setSize(height, width)

    this.defs = this.svg.append('defs')
    this.canvas = this.svg
      .append('g')
      .attr('transform', 'translate(' + this.margin.left + ',' + this.margin.top + ')')
    this.tooltip = new Tooltip(container)
    this.charts = []
    this.visitors = []
  }

  setOptions(options: AxesOptions): void {
    merge(this.options,
      options
    )
  }

  setSize(height?: number, width?: number): void {
    // FIXME: does not work for arguments
    const containerWidth = width == null ? this.container.offsetWidth : width
    const containerHeight = height == null ? this.container.offsetHeight : height
    this.height = containerHeight - this.margin.top - this.margin.bottom
    this.width = containerWidth - this.margin.left - this.margin.right
    if (this.height < 0 || this.width < 0) {
      this.height = 0
      this.width = 0
    }
    this.svg
      .attr('width', containerWidth)
      .attr('height', containerHeight)
      .attr('viewBox', `0 0 ${containerWidth} ${containerHeight}`)

  }

  resize(): void {
    this.setSize()
    this.setRange()
    this.updateGrid()
    this.redraw()
  }

  abstract redraw(): void

  abstract updateGrid(): void

  removeChart(id: string): void {
    let i: number
    for (i = 0; i < this.charts.length; i++) {
      if ( this.charts[i].id === id) {
        this.charts[i].group = null
        break
      }
    }
    this.charts.splice(i, 1)
    this.chartGroup.selectAll(`[data-chart-id="${id}"]`).remove()
  }

  removeAllCharts(): void {
    for (let i=0; i< this.charts.length;i++) {
      this.charts[i].group = null
    }
    this.charts = []
    this.chartGroup.selectAll('g').remove()
  }

  accept(v: Visitor): void {
    this.visitors.push(v)
    v.visit(this)
  }

  get extent(): any {
    const _extent = {}
    for (const chart of this.charts) {
      const chartExtent = chart.extent
      for (const path in chartExtent) {
        if ( !(path in _extent) ) {
          _extent[path] = chartExtent[path]
        } else {
          _extent[path] = d3.extent([ ..._extent[path], ...chartExtent[path]])
        }
      }
    }
    return _extent
  }

  createChartGroup(): void {
    this.chartGroup = this.canvas.append('g').attr('class', 'charts')
  }

  protected abstract setRange(): void
  protected abstract initGrid(): void
}

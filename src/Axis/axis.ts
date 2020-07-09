import * as d3 from 'd3'
import { Chart } from '../Charts'
import { Visitor } from '../Visitors'
import defaultsDeep from 'lodash/defaultsDeep'

export interface Margin {
  top?: number
  right?: number
  bottom?: number
  left?: number
}

export enum AxisType {
  time = 'time',
  value = 'value',
  degrees = 'degrees',
  band = 'band'
}

export interface AxisOptions {
  label?: string;
  type?: AxisType;
  unit?: string;
  showGrid?: boolean;
  format?: Function;
  domain?: [number, number] | [Date, Date];
}

export interface AxesOptions {
  transitionTime?: number
  margin?: Margin
}

interface AxisIndexItem {
  key: string; axisIndex: number
}

export interface AxisIndex {
  x?: AxisIndexItem;
  y?: AxisIndexItem;
  radial?: AxisIndexItem;
  angular?: AxisIndexItem;
  color?: { key: string}
}

export abstract class Axis {
  tooltip: any = null
  type: string
  view: any
  defs: any
  canvas: any
  svg: any
  container: HTMLElement
  width: number
  height: number
  margin: { top: number; right: number; bottom: number; left: number }
  options: AxesOptions = {}
  chartGroup: any
  charts: Chart[]
  initialDraw: boolean = true
  visitors: Visitor[]
  timeZone: string

  constructor(container: HTMLElement, width: number, height: number, options: AxesOptions, defaultOptions: any) {
    this.container = container
    defaultsDeep(this.options,
      options,
      defaultOptions
    )
    this.timeZone = 'Europe/Amsterdam'

    this.margin = { ...{ top: 40, right: 40, bottom: 40, left: 40 }, ...options.margin }
    this.svg = d3
      .select(container)
      .append('svg')
      // .attr('width', '100%')
      // .attr('height', '100%')
      .attr('class', 'wb-charts')
      .attr('overflow', 'visible')
      // .attr('color', 'white')
      // .attr('fill', 'white')
    this.setSize(height, width)

    this.defs = this.svg.append('defs')
    this.canvas = this.svg
      .append('g')
      .attr('transform', 'translate(' + this.margin.left + ',' + this.margin.top + ')')
    this.createTooltip()
    this.charts = []
    this.visitors = []
  }

  setOptions (options: AxesOptions) {
    defaultsDeep(this.options,
      options
    )
  }

  setSize(height?: number, width?: number) {
    // FIXME: does not work for arguments
    let containerWidth = width == null ? this.container.offsetWidth : width
    let containerHeight = height == null ? this.container.offsetHeight : height
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

  resize() {
    this.setSize()
    this.setRange()
    this.updateGrid()
    this.redraw()
  }

  abstract redraw() : void

  abstract updateGrid() : void

  removeChart(id: string) {
    let i: number
    for (i = 0; i < this.charts.length; i++) {
      if ( this.charts[i].id === id) {
        this.charts[i].group = null
        break
      }
    }
    this.charts.splice(i, 1)
    this.chartGroup.selectAll(`[data-id="${id}"]`).remove()
  }

  removeAllCharts() {
    for (let i=0; i< this.charts.length;i++) {
      this.charts[i].group = null
    }
    this.charts = []
    this.chartGroup.selectAll('g').remove()
  }

  accept(v: Visitor) {
    this.visitors.push(v)
    v.visit(this)
  }

  createChartGroup() {
    this.chartGroup = this.canvas.append('g').attr('class', 'charts')
  }

  createTooltip() {
    this.tooltip = d3
      .select(this.container)
      .append('div')
      .attr('class', 'tooltip')
      .style('opacity', 0)
  }

  abstract showTooltip(html: string): void

  hideTooltip(d: any) {
    this.tooltip
      .transition()
      .duration(50)
      .style('opacity', 0)
  }

  protected abstract setRange() : void
  protected abstract initGrid() : void
}

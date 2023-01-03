import * as d3 from 'd3'
import { Chart } from '../Charts/chart.js'
import { Visitor } from '../Visitors/visitor.js'
import { defaultsDeep, merge } from 'lodash-es'
import { Tooltip } from '../Tooltip/tooltip.js'
import { AxisOptions } from '../Axis/axisOptions.js'

export interface Margin {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
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
  x1?: { key: string };
  y?: AxisIndexItem;
  radial?: AxisIndexItem;
  angular?: AxisIndexItem;
  value?: { key: string };
  color?: { key: string };
}

export abstract class Axis {
  tooltip: Tooltip
  type: string
  view: any
  defs: any
  canvas: any
  svg: d3.Selection<SVGElement, any, SVGElement, any>
  container: HTMLElement
  observer: ResizeObserver
  width: number
  height: number
  margin: { top: number; right: number; bottom: number; left: number }
  options: AxesOptions = {}
  chartGroup: d3.Selection<SVGElement, any, SVGElement, any>
  charts: Chart[]
  initialDraw = true
  visitors: Visitor[]

  constructor(container: HTMLElement, width: number | null, height: number | null, options: AxesOptions, defaultOptions: any) {
    this.container = container
    this.options = defaultsDeep(
      this.options,
      options,
      defaultOptions
    )

    this.observer = new ResizeObserver(entries => {
      if (entries[0].contentBoxSize) this.resize()
    })
    this.observer.observe(container)

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

  setDefaultTimeOptions(axisOptions: AxisOptions | AxisOptions[]) {
    const optionsArray = Array.isArray(axisOptions) ? axisOptions : [axisOptions]
    for (const options of optionsArray) {
      options.timeZone = options.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
      options.locale = options.locale ?? navigator.language
    }
  }

  setOptions(options: AxesOptions): void {
    merge(this.options,
      options
    )
  }

  setSize(height?: number, width?: number): void {
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

  resetZoom(): void {
    this.redraw()
  }

  abstract updateGrid(): void

  removeChart(id: string): void {
    let i: number
    for (i = 0; i < this.charts.length; i++) {
      if (this.charts[i].id === id) {
        this.charts[i].group = null
        break
      }
    }
    this.charts.splice(i, 1)
    this.chartGroup.selectAll(`[data-chart-id="${id}"]`).remove()
  }

  removeAllCharts(): void {
    for (const chart of this.charts) {
      chart.group = null
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
        if (!(path in _extent)) {
          _extent[path] = chartExtent[path]
        } else {
          _extent[path] = d3.extent([..._extent[path], ...chartExtent[path]])
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

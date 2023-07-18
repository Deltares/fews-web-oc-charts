import * as d3 from 'd3'

import { Chart } from '../Charts/chart.js'
import { Visitor } from '../Visitors/visitor.js'
import { defaultsDeep, merge } from 'lodash-es'
import { Tooltip } from '../Tooltip/tooltip.js'
import { AxisOptions } from '../Axis/axisOptions.js'
import { D3Selection } from '../Utils'
import { AxesOptions } from './types.js'

/**
 * Base class representing a set of axes (i.e., a domain) in which data are visualised.
 * 
 * It requires a specific implementation for different domain types, e.g. Cartesian, polar.
 * 
 * This creates a SVG root element into which the chart is drawn.
 * 
 * Note that this represents the domain in which we are drawing, and not the visualisation of the
 * axes with lines, ticks, etc---this is represented by the Axis class.
 * 
 * @see Axis
 */
export abstract class Axes {
  container: HTMLElement
  svg: D3Selection<SVGSVGElement>
  chartGroup: D3Selection<SVGGElement>
  canvas: D3Selection<SVGGElement>
  defs: D3Selection<SVGDefsElement>

  tooltip: Tooltip
  observer: ResizeObserver

  width: number
  height: number
  margin: { top: number; right: number; bottom: number; left: number }

  options: AxesOptions = {}

  charts: Chart[]
  visitors: Visitor[]

  /**
   * Initialises an Axes object.
   * 
   * @param container HTML element to which the SVG element will be appended.
   * @param width Width of the container in which the root SVG element will be created.
   * @param height Height of the container in which the root SVG element will be created.
   * @param options Options for the axes.
   * @param defaultOptions Default options for the axes.
   */
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

    d3.formatDefaultLocale({
      decimal: '.',
      thousands: '\u2009',
      grouping: [3],
      currency: ['$', '']
    })

    this.margin = { ...{ top: 40, right: 40, bottom: 40, left: 40 }, ...options.margin }

    // Create the root SVG element.
    this.svg = d3
      .select(container)
      .append('svg')
      .attr('class', 'wb-charts')
      .attr('overflow', 'visible')
    this.setSize(height, width)

    // Create an empty <defs> element and a <g> element that we will draw into (i.e. our "canvas").
    this.defs = this.svg.append('defs')
    this.canvas = this.svg
      .append('g')
      .attr('transform', 'translate(' + this.margin.left + ',' + this.margin.top + ')')

    this.tooltip = new Tooltip(container)
    this.charts = []
    this.visitors = []
  }

  /**
   * Sets the ranges for each axis.
   */
  protected abstract setRange(): void

  /**
   * Reset axes to its default state, then redraw all elements.
   */
  abstract redraw(): void

  /**
   * Draw all elements in the axes.
   */
  abstract update(): void

  setDefaultTimeOptions(axisOptions: AxisOptions | AxisOptions[]) {
    const optionsArray = Array.isArray(axisOptions) ? axisOptions : [axisOptions]
    for (const options of optionsArray) {
      options.timeZone = options.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
      options.locale = options.locale ?? navigator.language
    }
  }

  /**
   * Sets options for these axes.
   * 
   * Any options not specified in the argument will be left at the value they had previously.
   * 
   * @param options Options to set for the current axes.
   */
  setOptions(options: Partial<AxesOptions>): void {
    merge(this.options,
      options
    )
  }

  /**
   * Sets the width and height of the root SVG element based and our "canvas".
   * 
   * @param width Width of the container in which the root SVG element will be created.
   * @param height Height of the container in which the root SVG element will be created.
   */
  setSize(height?: number, width?: number): void {
    const containerWidth = width ?? this.container.offsetWidth
    const containerHeight = height ?? this.container.offsetHeight

    // The "width" and "height" properties are the width and height of the "canvas" in which we
    // are drawing, which takes into account the specified margins.
    this.height = containerHeight - this.margin.top - this.margin.bottom
    this.width = containerWidth - this.margin.left - this.margin.right
    if (this.height < 0 || this.width < 0) {
      this.height = 0
      this.width = 0
    }

    // The root SVG element is set to occupy the container size.
    this.svg
      .attr('width', containerWidth)
      .attr('height', containerHeight)
      .attr('viewBox', `0 0 ${containerWidth} ${containerHeight}`)

  }

  /**
   * Resize the Axes, for example when the container size changes.
   */
  resize(): void {
    this.setSize()
    this.setRange()
    this.redraw()
  }

  /**
   * Resets the zoom level to its initial value.
   */
  resetZoom(): void {
    this.redraw()
  }

  /**
   * Removes the specified chart from the axes.
   * 
   * @param id Identifier of the chart to remove.
   */
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

  /**
   * Removes all charts from the axes.
   */
  removeAllCharts(): void {
    for (const chart of this.charts) {
      chart.group = null
    }
    this.charts = []
    this.chartGroup.selectAll('g').remove()
  }

  /**
   * Adds the specified visitor to this axes' list of visitors.
   * 
   * @param v Visitor to accept.
   */
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

  /**
   * Creates an empty group (i.e. <g> element) to add charts to.
   */
  createChartGroup(): void {
    this.chartGroup = this.canvas.append('g').attr('class', 'charts')
  }

}

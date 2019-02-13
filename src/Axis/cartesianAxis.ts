import * as d3 from 'd3'
import { Axis, AxisOptions } from './axis'

// import { scaleLinear } from 'd3-scale'

function mean(x: number[] | number) {
  if (x instanceof Array) {
    return d3.mean(x)
  }
  return x
}

interface XAxisOptions {
  label?: string
  time?: boolean
  unit?: string
}

interface YAxisOptions {
  label?: string
  unit?: string
}

export interface CartesianAxisOptions extends AxisOptions {
  x?: XAxisOptions
  x2?: XAxisOptions
  y?: YAxisOptions
  y2?: YAxisOptions
}

export class CartesianAxis extends Axis {
  canvas: any
  container: HTMLElement
  xScale: any
  yScale: any
  clipPathId: string

  constructor(
    container: HTMLElement,
    width: number,
    height: number,
    options?: CartesianAxisOptions
  ) {
    super(container, width, height, options)
    this.view = this.canvas
    this.chartGroup = this.canvas

    this.setCanvas()
    this.setRange()
    this.initGrid()
    this.setClipPath()

    this.chartGroup = this.chartGroup
      .append('g')
      .attr('class', 'group')
      .attr('clip-path', 'url(#' + this.clipPathId + ')')
      .append('g')
  }

  setCanvas() {
    let rect = this.canvas.select('.axis-canvas')
    if (rect.size() === 0) {
      this.clipPathId =
        'id-' +
        Math.random()
          .toString(36)
          .substr(2, 16)
      this.canvas
        .append('g')
        .attr('class', 'axis-canvas')
        .attr('clip-path', 'url(#' + this.clipPathId + ')')
        .append('rect')
        .attr('width', this.width)
        .attr('height', this.height)
    } else {
      rect
        .select('rect')
        .attr('height', this.height)
        .attr('width', this.width)
    }
  }

  setClipPath() {
    let clipPath = this.defs.select('#' + this.clipPathId)
    if (clipPath.size() === 0) {
      this.defs
        .append('clipPath')
        .attr('id', this.clipPathId)
        .append('rect')
        .attr('height', this.height)
        .attr('width', this.width)
    } else {
      clipPath
        .select('rect')
        .attr('height', this.height)
        .attr('width', this.width)
    }
  }

  zoom() {
    for (let chart of this.charts) {
      chart.plotter(this, chart.dataKeys)
    }
    this.updateGrid()
    // FIXME: move to Axis.ts?
    for (let visitor of this.visitors) {
      visitor.redraw()
    }
  }

  redraw() {
    let xExtent = new Array(2)
    let yExtent = new Array(2)
    for (let chart of this.charts) {
      let chartXExtent = chart.extent[chart.dataKeys.xkey]
      let chartYExtent = chart.extent[chart.dataKeys.ykey]
      xExtent = d3.extent(d3.merge([xExtent, [].concat(...chartXExtent)]))
      yExtent = d3.extent(d3.merge([yExtent, [].concat(...chartYExtent)]))
    }
    this.xScale.domain(xExtent)
    this.yScale.domain(yExtent).nice()

    for (let chart of this.charts) {
      chart.plotter(this, chart.dataKeys)
    }
    this.updateGrid()
  }

  resize() {
    this.setSize()
    this.setRange()
    this.zoom()
  }

  updateGrid() {
    this.setClipPath()
    this.setCanvas()
    let xAxis = d3.axisBottom(this.xScale)
    if (this.options.x && this.options.x.time) {
      xAxis.tickFormat(this.multiFormat)
    }
    let xGrid = d3
      .axisBottom(this.xScale)
      .ticks(5)
      .tickSize(this.height)
    let yAxis = d3.axisLeft(this.yScale).ticks(5)
    let yGrid = d3
      .axisRight(this.yScale)
      .ticks(5)
      .tickSize(this.width)
    if (this.options.transitionTime > 0 && !this.initialDraw) {
      let t = d3
        .transition()
        .duration(this.options.transitionTime)
        .ease(d3.easeLinear)
      this.canvas
        .select('.x-axis')
        .attr('transform', 'translate(' + 0 + ',' + this.height + ')')
        .transition(t)
        .call(xAxis)
      this.canvas
        .select('.x-grid')
        .transition(t)
        .call(xGrid)
      this.canvas
        .select('.y-axis')
        .transition(t)
        .call(yAxis)
      this.canvas
        .select('.y-grid')
        .transition(t)
        .call(yGrid)
    } else {
      this.canvas
        .select('.x-axis')
        .attr('transform', 'translate(' + 0 + ',' + this.height + ')')
        .call(xAxis)
      this.canvas.select('.x-grid').call(xGrid)
      this.canvas.select('.y-axis').call(yAxis)
      this.canvas.select('.y-grid').call(yGrid)
    }
    this.initialDraw = false
  }

  showTooltip(d: any) {
    this.tooltip
      .transition()
      .duration(50)
      .style('opacity', 0.9)
    this.tooltip
      .html('x: ' + d.x + '<br/>' + 'y: ' + d.y.toFixed(2))
      .style('left', d3.event.pageX + 'px')
      .style('top', d3.event.pageY + 'px')
  }

  protected setRange() {
    if (!this.xScale) {
      this.xScale = this.options.x && this.options.x.time ? d3.scaleTime() : d3.scaleLinear()
    }
    if (!this.yScale) this.yScale = d3.scaleLinear()
    this.xScale.range([0, this.width])
    this.yScale.range([this.height, 0])
  }

  protected initGrid() {
    let g = this.canvas
    let yGrid = g.append('g').attr('class', 'grid y-grid')
    let xGrid = g.append('g').attr('class', 'grid x-grid')
    let horizontalAxis = g
      .append('g')
      .attr('class', 'axis x-axis')
      .attr('transform', 'translate(' + 0 + ',' + this.height + ')')
    let yAxis = g.append('g').attr('class', 'axis y-axis')
    if (this.options.y) {
      if (this.options.y.label) {
        g.append('text')
          .attr('x', -this.margin.left)
          .attr('y', -10)
          .attr('text-anchor', 'start')
          .attr('font-family', 'sans-serif')
          .attr('font-size', '10px')
          .text(this.options.y.label)
      }
    }
    if (this.options.x) {
      if (this.options.x.label) {
        g.append('text')
          .attr('x', this.width / 2)
          .attr('y', this.height + 30)
          .attr('text-anchor', 'middle')
          .attr('font-family', 'sans-serif')
          .attr('font-size', '10px')
          .text(this.options.x.label)
      }
      if (this.options.x.unit) {
        g.append('text')
          .attr('x', this.width + 10)
          .attr('y', this.height + 9)
          .attr('dy', '0.71em')
          .attr('text-anchor', 'start')
          .attr('font-family', 'sans-serif')
          .attr('font-size', '10px')
          .text(this.options.x.unit)
      }
    }
    if (this.options.x2) {
      if (this.options.x2.unit) {
        g.append('text')
          .attr('x', this.width + 10)
          .attr('y', -9)
          .attr('text-anchor', 'start')
          .attr('font-family', 'sans-serif')
          .attr('font-size', '10px')
          .text(this.options.x2.unit)
      }
    }
  }

  // Define filter conditions
  multiFormat(date) {
    return (d3.timeSecond(date) < date
      ? d3.timeFormat('.%L')
      : d3.timeMinute(date) < date
      ? d3.timeFormat(':%S')
      : d3.timeHour(date) < date
      ? d3.timeFormat('%H:%M')
      : d3.timeDay(date) < date
      ? d3.timeFormat('%H:%M')
      : d3.timeMonth(date) < date
      ? d3.timeWeek(date) < date
        ? d3.timeFormat('%a %d')
        : d3.timeFormat('%b %d')
      : d3.timeYear(date) < date
      ? d3.timeFormat('%B')
      : d3.timeFormat('%Y'))(date)
  }
}

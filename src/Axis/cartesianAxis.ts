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
}

interface YAxisOptions {
  label?: string
}

export interface CartesianAxisOptions extends AxisOptions {
  x?: XAxisOptions
  y?: YAxisOptions
}

export class CartesianAxis extends Axis {
  canvas: any
  container: HTMLElement
  xScale: any
  yScale: any

  constructor(
    container: HTMLElement,
    width: number,
    height: number,
    options?: CartesianAxisOptions
  ) {
    super(container, width, height, options)
    this.canvas
      .append('g')
      .attr('class', 'axis-canvas')
      .append('rect')
      .attr('width', this.width)
      .attr('height', this.height)

    this.setRange()
    this.initGrid()
  }

  redraw() {
    let xExtent = new Array(2)
    let yExtent = new Array(2)
    for (let chart of this.charts) {
      let chartXExtent = d3.extent(chart.data, function(d: any) {
        return d[chart.dataKeys.xkey]
      })
      let chartYExtent = d3.extent(chart.data, function(d: any) {
        return d[chart.dataKeys.ykey]
      })
      xExtent = d3.extent(d3.merge([xExtent, [].concat(...chartXExtent)]))
      yExtent = d3.extent(d3.merge([yExtent, [].concat(...chartYExtent)]))
    }
    this.xScale.domain(xExtent).nice()
    this.yScale.domain(yExtent).nice()

    for (let chart of this.charts) {
      chart.plotterCartesian(this, chart.dataKeys)
    }
    this.updateGrid()
  }

  updateGrid() {
    let xAxis = d3.axisBottom(this.xScale).ticks(5)
    if (this.xScale instanceof d3.scaleTime) {
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
      this.canvas.select('.x-axis').call(xAxis)
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
    if (this.options.x && this.options.x.time) {
      this.xScale = d3.scaleTime().range([0, this.width])
    } else {
      this.xScale = d3.scaleLinear().range([0, this.width])
    }
    this.yScale = d3.scaleLinear().range([this.height, 0])
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
    if (this.options.y && this.options.y.label) {
      g.append('text')
        .attr('x', -40)
        .attr('y', -10)
        .style('fill', 'white')
        .style('text-anchor', 'start')
        .style('font-size', '11px')
        .text(this.options.y.label)
    }
    if (this.options.x && this.options.x.label) {
      g.append('text')
        .attr('x', this.width / 2)
        .attr('y', this.height + 30)
        .style('fill', 'white')
        .style('text-anchor', 'middle')
        .style('font-size', '11px')
        .text(this.options.x.label)
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

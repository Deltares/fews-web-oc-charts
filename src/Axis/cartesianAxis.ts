import * as d3 from 'd3'
import { Axis, AxisOptions } from './axis'
import momenttz from 'moment-timezone'

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
  domain?: [number, number]
}

interface YAxisOptions {
  label?: string
  unit?: string
  domain?: [number, number]
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
  timeZoneOffset: number

  constructor(
    container: HTMLElement,
    width: number| null,
    height: number| null,
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

  redraw(options?) {
    options = { ...{ x: { autoScale: false }, y: { autoScale: false } }, ...options }
    if (this.options.x && this.options.x.domain) {
      this.xScale.domain(this.options.x.domain)
    } else if (options.x.autoScale === true) {
      let xExtent = new Array(2)
      for (let chart of this.charts) {
        let chartXExtent = chart.extent[chart.dataKeys.xkey]
        xExtent = d3.extent(d3.merge([xExtent, [].concat(...chartXExtent)]))
      }
      this.xScale.domain(xExtent)
    }
    if (this.options.y && this.options.y.domain) {
      this.yScale.domain(this.options.y.domain)
    } else if (options.y.autoScale === true) {
      let yExtent = new Array(2)
      for (let chart of this.charts) {
        let chartYExtent = chart.extent[chart.dataKeys.ykey]
        yExtent = d3.extent(d3.merge([yExtent, [].concat(...chartYExtent)]))
      }
      this.yScale.domain(yExtent)
    }
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
    let that = this

    let xAxis = d3.axisBottom(this.xScale).ticks(5)
    let xGrid = d3
      .axisBottom(this.xScale)
      .ticks(5)
      .tickSize(this.height)

    if (this.options.x && this.options.x.time) {
      xAxis.tickFormat(this.generateMultiFormat())
      let offsetDomain = this.xScale.domain().map(function (d) {
        let m = momenttz(d as Date).tz(that.timeZone)
        return new Date(d.getTime() + m.utcOffset() * 60000);
      })
      let offsetScale = d3.scaleUtc().domain(offsetDomain)
      let tickValues = offsetScale.ticks(5)
      let offsetValues = tickValues.map(function(d) {
        let m = momenttz(d as Date).tz(that.timeZone)
        return new Date(d.getTime() - m.utcOffset() * 60000);
      })
      xAxis.tickValues(offsetValues)
      xGrid.tickValues(offsetValues)
    }

    let yAxis = d3.axisLeft(this.yScale).ticks(5)
    let yGrid = d3
      .axisRight(this.yScale)
      .ticks(5)
      .tickSize(this.width)
    if (this.options.y && this.options.y.axisType === 'degrees') {
      let domain = this.yScale.domain()
      let step = d3.tickIncrement(domain[0], domain[1], 5)
      step = step >= 100 ? 90 : step >= 50 ? 45 : step >= 20 ? 15 : step
      let start = Math.ceil(domain[0] / step) * step
      let stop = Math.floor(domain[1] / step + 1) * step
      yAxis.tickValues(d3.range(start, stop, step))
      yGrid.tickValues(d3.range(start, stop, step))
    }
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

  showTooltip(html: string) {
    this.tooltip
      .transition()
      .duration(50)
      .style('opacity', 0.9)
    this.tooltip
      .html(html)
      .style('left', d3.event.pageX + 'px')
      .style('top', d3.event.pageY + 'px')
  }

  protected setRange() {
    if (!this.xScale) {
      this.xScale = this.options.x && this.options.x.time ? d3.scaleUtc() : d3.scaleLinear()
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
          .attr('x', 0)
          .attr('y', -9)
          .attr('text-anchor', 'start')
          .attr('font-family', 'sans-serif')
          .attr('font-size', '10px')
          .text(this.options.y.label)
      }
      if (this.options.y.unit) {
        g.append('text')
          .attr('x', -9)
          .attr('y', -9)
          .attr('text-anchor', 'end')
          .attr('font-family', 'sans-serif')
          .attr('font-size', '10px')
          .text(this.options.y.unit)
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

  generateMultiFormat() {
    let timeZone = this.timeZone
    return function(date) {
      let m = momenttz(date as Date).tz(timeZone)
      let offsetDate = new Date ( date.getTime() + m.utcOffset()*60000)
      return (d3.utcSecond(offsetDate) < offsetDate
        ? m.format('.SSS')
        : d3.utcMinute(offsetDate) < offsetDate
          ? m.format(':ss')
          : d3.utcHour(offsetDate) < offsetDate
            ? m.format('HH:mm')
            : d3.utcDay(offsetDate) < offsetDate
              ? m.format('HH:mm')
              : d3.utcMonth(offsetDate) < offsetDate
                ? d3.utcWeek(offsetDate) < offsetDate
                  ? m.format( 'dd DD')
                  : m.format( 'MMM DD')
                : d3.utcYear(offsetDate) < offsetDate
                  ? m.format( 'MMMM')
                  : m.format('YYYY'))
    }
  }

}

import * as d3 from 'd3'
import { Axis, AxesOptions, AxisType, AxisOptions } from './axis'
import { generateMultiFormat } from '../utils/date'
import momenttz from 'moment-timezone'

export enum AxisPosition {
  Top = 'top',
  Bottom = 'bottom',
  Left = 'left',
  Right = 'right',
}

export interface CartesianAxisOptions extends AxisOptions {
  position?: AxisPosition;
}

export interface CartesianAxesOptions extends AxesOptions {
  x?: CartesianAxisOptions[]
  y?: CartesianAxisOptions[]
}

export class CartesianAxis extends Axis {
  canvas: any
  container: HTMLElement
  xScale: Array<any> = []
  yScale: Array<any> = []
  clipPathId: string
  timeZoneOffset: number
  options: CartesianAxesOptions
  static readonly defaultOptions = {
    x: [ { type: AxisType.value } ],
    y: [ { type: AxisType.value } ]
  }

  constructor(
    container: HTMLElement,
    width: number| null,
    height: number| null,
    options?: CartesianAxesOptions
  ) {
    super(container, width, height, options, CartesianAxis.defaultOptions)
    this.view = this.canvas
    this.chartGroup = this.canvas
    this.setCanvas()
    this.initXScales(this.options.x)
    this.initYScales(this.options.y)
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
      chart.plotter(this, chart.axisIndex)
    }
    this.updateGrid()
    // FIXME: move to Axis.ts?
    for (let visitor of this.visitors) {
      visitor.redraw()
    }
  }

  updateXAxisScales(options: any) {
    options = { ... { autoScale: false }, ...options }
    for ( let key in this.xScale) {
      const scale = this.xScale[key]
      if (this.options.x[key]?.domain) {
        scale.domain(this.options.x[key].domain)
      } else if (options.autoScale === true) {
        let extent = new Array(2)
        for (let chart of this.charts) {
          if ( chart.axisIndex.x?.axisIndex === +key ) {
            let chartExtent = chart.extent[chart.dataKeys.x]
            extent = d3.extent(d3.merge([extent, [].concat(...chartExtent)]))
          }
        }
        scale.domain(extent)
        if (options.nice === true) scale.nice()
      }
    }
  }

  updateYAxisScales(options: any) {
    options = { ... { autoScale: false }, ...options }
    for ( let key in this.yScale) {
      const scale = this.yScale[key]
      if (this.options.y[key]?.domain) {
        scale.domain(this.options.y[key].domain)
      } else if (options.autoScale === true) {
        let extent = new Array(2)
        for (let chart of this.charts) {
          if ( chart.axisIndex.y?.axisIndex === +key ) {
            let chartExtent = chart.extent[chart.dataKeys.y]
            extent = d3.extent(d3.merge([extent, [].concat(...chartExtent)]))
          }
        }
        scale.domain(extent)
        if (options.nice === true) scale.nice()
      }
    }
  }

  redraw(options?) {
    this.updateXAxisScales(options.x)
    this.updateYAxisScales(options.y)
    for (let chart of this.charts) {
      chart.plotter(this, chart.axisIndex)
    }
    this.updateGrid()
    for (let visitor of this.visitors) {
      visitor.redraw()
    }
  }

  resize() {
    this.setSize()
    this.setRange()
    this.zoom()
  }

  updateXAxis (options: CartesianAxisOptions[]) {
    for (const key in this.xScale) {
      let scale = this.xScale[key]
      let axis = undefined
      switch (options[key].position) {
        case AxisPosition.Top:
          axis = d3.axisTop(scale).ticks(5)
          break
        default:
          axis = d3.axisBottom(scale).ticks(5)
      }
      let grid = d3.axisBottom(scale)
      grid.ticks(5).tickSize(this.height)
      if (options[key].type === AxisType.time ) {

        let offsetDomain = scale.domain().map((d) => {
          let m = momenttz(d as Date).tz(this.timeZone)
          return new Date(d.getTime() + m.utcOffset() * 60000);
        })
        let offsetScale = d3.scaleUtc().domain(offsetDomain)
        let tickValues = offsetScale.ticks(5)
        let offsetValues = tickValues.map((d) => {
          let m = momenttz(d as Date).tz(this.timeZone)
          return new Date(d.getTime() - m.utcOffset() * 60000);
        })
        axis.tickValues(offsetValues)
        axis.tickFormat(generateMultiFormat(this.timeZone))
        grid.tickValues(offsetValues)
      } else if (options[key].type === AxisType.degrees) {
        let domain = scale.domain()
        let step = d3.tickIncrement(domain[0], domain[1], 5)
        step = step >= 100 ? 90 : step >= 50 ? 45 : step >= 20 ? 15 : step
        let start = Math.ceil(domain[0] / step) * step
        let stop = Math.floor(domain[1] / step + 1) * step
        axis.tickValues(d3.range(start, stop, step))
        grid.tickValues(d3.range(start, stop, step))
      }
      let x = 0
      let y = ( options[key].position !== AxisPosition.Top ) ? this.height : 0
      let translateString = `translate(${x},${y})`
      this.canvas
      .select(`.x-axis-${key}`)
      .attr('transform', translateString )
        .call(axis)
      if (options[key].showGrid) this.canvas.select('.x-grid').call(grid)
    }
  }

updateYAxis (options: CartesianAxisOptions[]) {
  for (const key in this.yScale) {
    let scale = this.yScale[key]
    let axis = undefined
    switch (options[key].position) {
      case AxisPosition.Right:
      axis = d3.axisRight(scale).ticks(5)
      break
      default:
      axis = d3.axisLeft(scale).ticks(5)
    }
    let grid = d3.axisRight(scale)
    grid.ticks(5).tickSize(this.width)
    if (options[key].type === AxisType.time ) {
      let offsetDomain = scale.domain().map((d) => {
        let m = momenttz(d as Date).tz(this.timeZone)
        return new Date(d.getTime() + m.utcOffset() * 60000);
      })
      let offsetScale = d3.scaleUtc().domain(offsetDomain)
      let tickValues = offsetScale.ticks(5)
      let offsetValues = tickValues.map((d) => {
        let m = momenttz(d as Date).tz(this.timeZone)
        return new Date(d.getTime() - m.utcOffset() * 60000);
      })
      axis.tickValues(offsetValues)
      axis.tickFormat(generateMultiFormat(this.timeZone))
      grid.tickValues(offsetValues)
    } else if (options[key].type === AxisType.degrees) {
      let domain = scale.domain()
      let step = d3.tickIncrement(domain[0], domain[1], 5)
      step = step >= 100 ? 90 : step >= 50 ? 45 : step >= 20 ? 15 : step
      let start = Math.ceil(domain[0] / step) * step
      let stop = Math.floor(domain[1] / step + 1) * step
      axis.tickValues(d3.range(start, stop, step))
      grid.tickValues(d3.range(start, stop, step))
    }
    let x = ( options[key].position === AxisPosition.Right ) ? this.width : 0
    let y = 0
    let translateString = `translate(${x},${y})`
    this.canvas
    .select(`.y-axis-${key}`)
    .attr('transform', translateString)
    .call(axis)
    if (options[key].showGrid) this.canvas.select('.y-grid').call(grid)
  }
}

  updateGrid() {
    this.setClipPath()
    this.setCanvas()
    this.updateXAxis(this.options.x)
    this.updateYAxis(this.options.y)

    // if (this.options.transitionTime > 0 && !this.initialDraw) {
    //   let t = d3
    //     .transition()
    //     .duration(this.options.transitionTime)
    //     .ease(d3.easeLinear)
    //   this.canvas
    //     .select('.x-axis')
    //     .attr('transform', 'translate(' + 0 + ',' + this.height + ')')
    //     .transition(t)
    //     .call(xAxis)
    //   this.canvas
    //     .select('.x-grid')
    //     .transition(t)
    //     .call(xGrid)
    //   this.canvas
    //     .select('.y-axis')
    //     .transition(t)
    //     .call(yAxis)
    //   this.canvas
    //     .select('.y-grid')
    //     .transition(t)
    //     .call(yGrid)
    // } else {
    //   this.canvas
    //     .select('.x-axis')
    //     .attr('transform', 'translate(' + 0 + ',' + this.height + ')')
    //     .call(xAxis)
    //   this.canvas.select('.x-grid').call(xGrid)
    //   this.canvas.select('.y-axis').call(yAxis)
    //   this.canvas.select('.y-grid').call(yGrid)
    // }
    // this.initialDraw = false
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

  protected initXScales (options: CartesianAxisOptions[]) {
    for ( let key in options) {
      let scale
      switch (options[key].type) {
        case AxisType.time:
          scale = d3.scaleUtc()
          break
        default:
          scale = d3.scaleLinear()
      }
      scale.range([0, this.width])
      this.xScale.push(scale)
    }
  }

  protected initYScales (options: CartesianAxisOptions[]) {
    for ( let key in options) {
      let scale
      switch (options[key].type) {
        case AxisType.time:
          scale = d3.scaleUtc()
          break
        default:
          scale = d3.scaleLinear()
      }
      scale.range([this.height, 0])
      this.yScale.push(scale)
    }
  }

  protected setRange() {
    for ( let key in this.xScale ) {
      this.xScale[key].range([0, this.width])
    }
    for ( let key in this.yScale ) {
      this.yScale[key].range([this.height, 0])
    }
  }

  protected initGrid() {
    let g = this.canvas
    let yGrid = g.append('g').attr('class', 'grid y-grid')
    let xGrid = g.append('g').attr('class', 'grid x-grid')
    g.append('g')
      .attr('class', 'axis x-axis-0')
      .attr('font-size','12')
    g.append('g')
      .attr('class', 'axis x-axis-1')
    g.append('g')
      .attr('class', 'axis y-axis-0')
    g.append('g')
      .attr('class', 'axis y-axis-1')

    if (this.options.y) {
      if (this.options.y[0]?.label) {
        g.append('text')
          .attr('x', 0)
          .attr('y', -9)
          .attr('text-anchor', 'start')
          .attr('font-family', 'sans-serif')
          .attr('font-size', '10px')
          .text(this.options.y[0].label)
      }
      if (this.options.y[0]?.unit) {
        g.append('text')
          .attr('x', -9)
          .attr('y', -9)
          .attr('text-anchor', 'end')
          .attr('font-family', 'sans-serif')
          .attr('font-size', '10px')
          .text(this.options.y[0].unit)
      }
      if (this.options.y[1]?.label) {
        g.append('text')
          .attr('x', this.width)
          .attr('y', -9)
          .attr('text-anchor', 'end')
          .attr('font-family', 'sans-serif')
          .attr('font-size', '10px')
          .text(this.options.y[1].label)
      }
      if (this.options.y[1]?.unit) {
        g.append('text')
          .attr('x', this.width + 10)
          .attr('y', -9)
          .attr('text-anchor', 'start')
          .attr('font-family', 'sans-serif')
          .attr('font-size', '10px')
          .text(this.options.y[1].unit)
      }
    }
    if (this.options.x[0]?.label) {
      g.append('text')
        .attr('x', this.width / 2)
        .attr('y', this.height + 30)
        .attr('text-anchor', 'middle')
        .attr('font-family', 'sans-serif')
        .attr('font-size', '10px')
        .text(this.options.x[0].label)
    }
    if (this.options.x[0]?.unit) {
      g.append('text')
        .attr('x', this.width + 10)
        .attr('y', this.height + 9)
        .attr('dy', '0.71em')
        .attr('text-anchor', 'start')
        .attr('font-family', 'sans-serif')
        .attr('font-size', '10px')
        .text(this.options.x[0].unit)
    }

    if (this.options.x[1]?.unit) {
      g.append('text')
        .attr('x', this.width + 10)
        .attr('y', -9)
        .attr('text-anchor', 'start')
        .text(this.options.x[1].unit)
    }
  }
}

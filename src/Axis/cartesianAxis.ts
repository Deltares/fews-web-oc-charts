import * as d3 from 'd3'
import { Axis, AxesOptions, AxisType, AxisOptions } from './axis'
import { AxisPosition } from '../Types/axisPosition'

import { generateMultiFormat } from '../Utils/date'
import { DateTime } from 'luxon'
import merge from 'lodash/merge'
import defaults from 'lodash/defaults'
import { niceDomain } from './niceDomain'
import { niceDegreeSteps } from '../Utils/niceDegreeSteps'
import { AxisOrientation } from '../Types/axisOrientation'

export interface CartesianAxisOptions extends AxisOptions {
  position?: AxisPosition;
}

export interface CartesianAxesOptions extends AxesOptions {
  x?: CartesianAxisOptions[];
  y?: CartesianAxisOptions[];
}

function normalizeAngle(angle) {
  return angle - 360 * Math.floor( (angle) / 360)
}

function anchorForAngle(angle, orientation) {
  let rotate
  switch(orientation) {
    case AxisOrientation.Top:
      rotate = 180
      break
    case AxisOrientation.Right:
      rotate = -90
      break
    case AxisOrientation.Bottom:
      rotate = 0
      break
    case AxisOrientation.Left:
    default:
      rotate = 90
  }
  const normalizedAngle = normalizeAngle(angle - rotate)
  if (normalizedAngle < 180) {
    return 'start'
  } else if (normalizedAngle > 180) {
    return 'end'
  }
  return 'middle'
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
    x: [ { type: AxisType.value, labelAngle: 0 } ],
    y: [ { type: AxisType.value, labelAngle: 0 } ]
  }

  constructor(
    container: HTMLElement,
    width: number| null,
    height: number| null,
    options?: CartesianAxesOptions
  ) {
    super(container, width, height, options, CartesianAxis.defaultOptions)
    // Set defaults for each x- and y-axis.
    this.setDefaultAxisOptions(this.options.x, CartesianAxis.defaultOptions.x[0])
    this.setDefaultAxisOptions(this.options.y, CartesianAxis.defaultOptions.y[0])
    this.setDefaultTimeOptions(this.options.x)
    this.setDefaultTimeOptions(this.options.y)

    this.view = this.canvas
    this.setCanvas()
    this.initXScales(this.options.x)
    this.initYScales(this.options.y)
    this.setRange()
    this.initGrid()
    this.setClipPath()
    this.chartGroup = this.canvas
      .append('g')
      .attr('class', 'group')
      .attr('clip-path', 'url(#' + this.clipPathId + ')')
      .append('g')
    this.initAxis()
    this.canvas
      .append('g')
      .attr('class', 'front')
    this.updateMouseEventLayer()
  }

  setDefaultAxisOptions(axisOptions: CartesianAxisOptions[], defaultOptions: CartesianAxisOptions) {
    for (const options of axisOptions) {
      defaults(options, defaultOptions)
    }
  }

  setOptions(options?: CartesianAxesOptions): void {
    merge(this.options,
      options
    )
  }

  setCanvas(): void {
    const rect = this.canvas.select('.axis-canvas')
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

  updateMouseEventLayer(): void {
    const mouseGroup = this.canvas.select('.mouse-events')
    if (mouseGroup.size() === 0) {
      this.canvas
        .append('g')
        .attr('class', 'mouse-events')
        .append('rect')
        .attr('width', this.width)
        .attr('height', this.height)
        .attr('fill', 'none')
    } else {
      mouseGroup
        .select('rect')
        .attr('height', this.height)
        .attr('width', this.width)
    }
  }

  setClipPath() {
    const clipPath = this.defs.select('#' + this.clipPathId)
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

  updateXAxisScales(options: any): void {
    options = { ... { autoScale: false }, ...options }
    for ( const key in this.xScale) {
      const scale = this.xScale[key]
      if (this.options.x[key]?.domain) {
        scale.domain(this.options.x[key].domain)
      } else if (this.options.x[key]?.type === AxisType.band) {
        let extent = new Array(0)
        for (const chart of this.charts) {
          if ( chart.axisIndex.x?.axisIndex === +key ) {
            extent = chart.data.map(d => d[chart.dataKeys.x])
            break
          }
        }
        scale.domain(extent)
      } else if (options.autoScale === true) {
        let defaultExtent
        let dataExtent = new Array(2)
        if (this.options.x[key]?.includeZero === true) {
          dataExtent[0] = 0
        }
        if (this.options.x[key]?.defaultDomain !== undefined) {
          defaultExtent = this.options.x[key]?.defaultDomain
        }
        for (const chart of this.charts) {
          if ( chart.axisIndex.x?.axisIndex === +key ) {
            const chartExtent = chart.extent[chart.dataKeys.x]
            dataExtent = d3.extent(d3.merge([dataExtent, [].concat(...chartExtent)]))
          }
        }
        if (this.options.x[key]?.symmetric === true) {
          const max = Math.max(Math.abs(dataExtent[0]), Math.abs(dataExtent[1]))
          dataExtent[0] = -max
          dataExtent[1] = max
        }
        scale.domain(dataExtent)
        if (this.options.x[key]?.nice === true) {
          niceDomain(scale, 16)
        }
        if (defaultExtent !== undefined) {
          const domain = scale.domain()
          if (defaultExtent[0] < domain[0] || defaultExtent[1] > domain[1] ) {
            scale.domain(defaultExtent)
          }
        }
      }
    }
  }

  updateYAxisScales(options: any): void {
    options = { ... { autoScale: false }, ...options }
    for ( const key in this.yScale) {
      const scale = this.yScale[key]
      if (this.options.y[key]?.domain) {
        scale.domain(this.options.y[key].domain)
      } else if (this.options.y[key]?.type === AxisType.band) {
        let extent = new Array(0)
        for (const chart of this.charts) {
          if ( chart.axisIndex.y?.axisIndex === +key ) {
            extent = chart.data.map(d => d[chart.dataKeys.y])
            break
          }
        }
        scale.domain(extent)
      } else if (options.autoScale === true) {
        let defaultExtent
        let dataExtent = new Array(2)
        if (this.options.y[key]?.includeZero === true) {
          dataExtent[0] = 0
        }
        if (this.options.y[key]?.defaultDomain !== undefined) {
          defaultExtent = this.options.y[key]?.defaultDomain
        }
        for (const chart of this.charts) {
          if ( chart.axisIndex.y?.axisIndex === +key ) {
            const chartExtent = chart.extent[chart.dataKeys.y]
            dataExtent = d3.extent(d3.merge([dataExtent, [].concat(...chartExtent)]))
          }
        }
        if (this.options.y[key]?.symmetric === true) {
          const max = Math.max(Math.abs(dataExtent[0]), Math.abs(dataExtent[1]))
          dataExtent[0] = -max
          dataExtent[1] = max
        }
        scale.domain(dataExtent)
        if (this.options.y[key]?.nice === true) niceDomain(scale, 16)
        if (defaultExtent !== undefined) {
          const domain = scale.domain()
          if (defaultExtent[0] < domain[0] || defaultExtent[1] > domain[1] ) {
            scale.domain(defaultExtent)
          }
        }
      }
    }
  }

  redraw(options?): void {
    this.updateXAxisScales(options.x)
    this.updateYAxisScales(options.y)
    for (const chart of this.charts) {
      chart.plotter(this, chart.axisIndex)
    }
    this.updateGrid()
    this.updateMouseEventLayer()
    for (const visitor of this.visitors) {
      visitor.redraw()
    }
  }

  resize(): void {
    this.setSize()
    this.setRange()
    this.zoom()
  }

  zoom(): void {
    for (const chart of this.charts) {
      chart.plotter(this, chart.axisIndex)
    }
    this.updateGrid()
    for (const visitor of this.visitors) {
      visitor.redraw()
    }
  }

  updateXAxis (options: CartesianAxisOptions[]) {
    for (const key in this.xScale) {
      const scale = this.xScale[key]
      let axis = undefined
      const orientation = options[key].orientation || options[key].position
      switch (orientation) {
        case AxisOrientation.Top:
          axis = d3.axisTop(scale).ticks(5)
          break
        case AxisOrientation.Bottom:
        default:
          axis = d3.axisBottom(scale).ticks(5)
      }
      const grid = d3.axisBottom(scale)
      grid.ticks(5).tickSize(this.height)
      if (options[key].type === AxisType.time ) {

        const offsetDomain = scale.domain().map((d) => {
          const m = DateTime.fromJSDate(d).setZone(options[key].timeZone)
          return new Date(d.getTime() + m.offset * 60000);
        })
        const offsetScale = d3.scaleUtc().domain(offsetDomain)
        const tickValues = offsetScale.ticks(5)
        const offsetValues = tickValues.map((d) => {
          const m = DateTime.fromJSDate(d).setZone(options[key].timeZone)
          return new Date(d.getTime() - m.offset * 60000);
        })
        axis.tickValues(offsetValues)
        axis.tickFormat(generateMultiFormat(options[key].timeZone, options[key].locale))
        grid.tickValues(offsetValues)
      } else if (options[key].type === AxisType.degrees) {
        const domain = scale.domain()
        let step = d3.tickIncrement(domain[0], domain[1], 5)
        step = niceDegreeSteps(step)
        const start = Math.ceil(domain[0] / step) * step
        const stop = Math.floor(domain[1] / step + 1) * step
        axis.tickValues(d3.range(start, stop, step))
        grid.tickValues(d3.range(start, stop, step))
      }
      const x = 0
      const y = this.yPositionAxis(options[key].position)
      const translateString = `translate(${x},${y})`

      const angle = options[key].labelAngle || 0
      const axisHandle = this.canvas
        .select(`.x-axis-${key}`)
        .attr('transform', translateString)
        .call(axis)

      switch(angle) {
        case 0:
          break
        case 180:
          axisHandle
            .selectAll("text")
            .attr("transform", `rotate(${angle})`);
          break
        default:
          const anchor = anchorForAngle(angle, orientation)
          const offset = orientation === AxisOrientation.Top ? -15 : 15
          axisHandle
            .selectAll("text")
            .attr("x", undefined)
            .attr("dx", undefined)
            .attr("y", undefined)
            .attr("dy", undefined)
            .attr("text-anchor", anchor)
            .attr("dominant-baseline", "middle")
            .attr("transform", `translate(0, ${offset}) rotate(${angle})`);
      }

      if (options[key].showGrid) this.canvas.select('.x-grid')
        .call(grid)
        .call(g => g.selectAll(".tick")
        .attr("class", (d) => { return d === 0 ? 'tick zero-crossing' : 'tick'} ))
    }
  }

updateYAxis (options: CartesianAxisOptions[]): void {
  for (const key in this.yScale) {
    const scale = this.yScale[key]
    let axis = undefined
    const orientation = options[key].orientation || options[key].position
    switch (orientation) {
      case AxisOrientation.Right:
      axis = d3.axisRight(scale).ticks(5)
      break
      case AxisOrientation.Left:
      default:
      axis = d3.axisLeft(scale).ticks(5)
    }
    const grid = d3.axisRight(scale)
    grid.ticks(5).tickSize(this.width)
    if (options[key].type === AxisType.time ) {
      const offsetDomain = scale.domain().map((d) => {
        const m = DateTime.fromJSDate(d).setZone(options[key].timeZone)
        return new Date(d.getTime() + m.offset * 60000);
      })
      const offsetScale = d3.scaleUtc().domain(offsetDomain)
      const tickValues = offsetScale.ticks(5)
      const offsetValues = tickValues.map((d) => {
        const m = DateTime.fromJSDate(d).setZone(options[key].timeZone)
        return new Date(d.getTime() - m.offset * 60000);
      })
      axis.tickValues(offsetValues)
      axis.tickFormat(generateMultiFormat(options[key].timeZone, options[key].locale))
      grid.tickValues(offsetValues)
    } else if (options[key].type === AxisType.degrees) {
      const domain = scale.domain()
      let step = d3.tickIncrement(domain[0], domain[1], 5)
      step = niceDegreeSteps(step)
      const start = Math.ceil(domain[0] / step) * step
      const stop = Math.floor(domain[1] / step + 1) * step
      axis.tickValues(d3.range(start, stop, step))
      grid.tickValues(d3.range(start, stop, step))
    }

    const x = this.xPositionAxis(options[key].position)
    const y = 0
    const translateString = `translate(${x},${y})`

    const angle = options[key].labelAngle || 0
    const axisHandle = this.canvas
      .select(`.y-axis-${key}`)
      .attr('transform', translateString)
      .call(axis)

    switch(angle) {
      case 0:
        break
      case 180:
        axisHandle
          .selectAll("text")
          .attr("transform", `rotate(${angle})`);
        break
      default:
        const anchor = anchorForAngle(angle, orientation)
        const offset = orientation === AxisOrientation.Right ? 15 : -15
        axisHandle
          .selectAll("text")
          .attr("x", undefined)
          .attr("dx", undefined)
          .attr("y", undefined)
          .attr("dy", undefined)
          .attr("text-anchor", anchor)
          .attr("dominant-baseline", "middle")
          .attr("transform", `translate(${offset}, 0) rotate(${angle})`);
    }
    if (options[key].showGrid) this.canvas.select('.y-grid')
      .call(grid)
      .call(g => g.selectAll(".tick")
        .attr("class", (d) => { return d === 0 ? 'tick zero-crossing' : 'tick'} ))
  }
}

  updateGrid(): void {
    this.setClipPath()
    this.setCanvas()
    this.updateXAxis(this.options.x)
    this.updateYAxis(this.options.y)
    this.updateLabels()
  }

  updateLabels (): void {
    const g = this.canvas.select('.axis.labels')
    if (this.options.y) {
      if (this.options.y[0]?.label) {
        g.select('.y0.label')
          .text(this.options.y[0].label)
      }
      if (this.options.y[0]?.unit) {
        g.select('.y0.unit')
          .text(this.options.y[0].unit)
      }
      if (this.options.y[1]?.label) {
        g.select('.y1.label')
          .attr('x', this.width)
          .text(this.options.y[1].label)
      }
      if (this.options.y[1]?.unit) {
        g.select('.y1.unit')
          .attr('x', this.width + 10)
          .text(this.options.y[1].unit)
      }
    }
    if (this.options.x[0]?.label) {
      g.select('.x0.label')
      .attr('x', this.width / 2)
        .attr('y', this.height + 30)
        .text(this.options.x[0].label)
    }
    if (this.options.x[0]?.unit) {
      g.select('.x0.unit')
      .attr('x', this.width + 10)
        .attr('y', this.height + 9)
        .text(this.options.x[0].unit)
    }

    if (this.options.x[1]?.unit) {
      g.select('.x1.unit')
        .attr('x', this.width + 10)
        .text(this.options.x[1].unit)
    }
  }

  protected initXScales (options: CartesianAxisOptions[]): void {
    for ( const key in options) {
      let scale
      switch (options[key].type) {
        case AxisType.time:
          scale = d3.scaleUtc()
          break
        case AxisType.band:
          scale = d3.scaleBand()
          break
        default:
          scale = d3.scaleLinear()
      }
      scale.range([0, this.width])
      this.xScale.push(scale)
    }
  }

  protected initYScales (options: CartesianAxisOptions[]): void {
    for ( const key in options) {
      let scale
      switch (options[key].type) {
        case AxisType.time:
          scale = d3.scaleUtc()
          break
        case AxisType.band:
          scale = d3.scaleBand()
          break
        default:
          scale = d3.scaleLinear()
      }
      scale.range([this.height, 0])
      this.yScale.push(scale)
    }
  }

  protected setRange(): void{
    for ( const key in this.xScale ) {
      this.xScale[key].range([0, this.width])
    }
    for ( const key in this.yScale ) {
      this.yScale[key].range([this.height, 0])
    }
  }

  protected initGrid(): void {
    const g = this.canvas
    g.append('g').attr('class', 'grid y-grid')
    g.append('g').attr('class', 'grid x-grid')
  }

  protected initAxis(): void {
    const g = this.canvas
    g.append('g')
      .attr('class', 'axis x-axis-0')
    g.append('g')
      .attr('class', 'axis x-axis-1')
    g.append('g')
      .attr('class', 'axis y-axis-0')
    g.append('g')
      .attr('class', 'axis y-axis-1')

    const labelGroup = this.canvas.append('g')
      .attr('class', 'axis labels')
      .attr('font-family', 'sans-serif')
      .attr('font-size', 10)

    if (this.options.y) {
      if (this.options.y[0]?.label) {
        labelGroup.append('text')
        .attr('class','y0 label')
          .attr('x', 0)
          .attr('y', -9)
          .attr('text-anchor', 'start')
          .text(this.options.y[0].label)
      }
      if (this.options.y[0]?.unit) {
        labelGroup.append('text')
          .attr('class','y0 unit')
          .attr('x', -9)
          .attr('y', -9)
          .attr('text-anchor', 'end')
          .text(this.options.y[0].unit)
      }
      if (this.options.y[1]?.label) {
        labelGroup.append('text')
          .attr('class','y1 label')
          .attr('x', this.width)
          .attr('y', -9)
          .attr('text-anchor', 'end')
          .text(this.options.y[1].label)
      }
      if (this.options.y[1]?.unit) {
        labelGroup.append('text')
          .attr('class','y1 unit')
          .attr('x', this.width + 10)
          .attr('y', -9)
          .attr('text-anchor', 'start')
          .text(this.options.y[1].unit)
      }
    }
    if (this.options.x[0]?.label) {
      labelGroup.append('text')
        .attr('class','x0 label')
        .attr('x', this.width / 2)
        .attr('y', this.height + 30)
        .attr('text-anchor', 'middle')
        .text(this.options.x[0].label)
    }
    if (this.options.x[0]?.unit) {
      labelGroup.append('text')
        .attr('class','x0 unit')
        .attr('x', this.width + 10)
        .attr('y', this.height + 9)
        .attr('dy', '0.71em')
        .attr('text-anchor', 'start')
        .text(this.options.x[0].unit)
    }

    if (this.options.x[1]?.unit) {
      labelGroup.append('text')
        .attr('class','x1 unit')
        .attr('x', this.width + 10)
        .attr('y', -9)
        .attr('text-anchor', 'start')
        .text(this.options.x[1].unit)
    }
  }

  xPositionAxis(position) {
    if (position === AxisPosition.AtZero) {
      return this.xScale[0](0)
    } else if (position === AxisPosition.Right) {
      return this.width
    }
    return 0
  }

  yPositionAxis(position) {
    if (position === AxisPosition.AtZero) {
      return this.xScale[0](0)
    } else if (position === AxisPosition.Bottom) {
      return this.height
    }
    return 0
  }
}

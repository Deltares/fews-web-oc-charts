import * as d3 from 'd3'
import { Axis, AxesOptions, AxisType, AxisOptions } from './axis'
import defaultsDeep from 'lodash/defaultsDeep'
import { DateTime } from 'luxon'
import { TooltipPosition } from '../Tooltip'

// import { scaleLinear } from 'd3-scale'

export enum Direction {
  CLOCKWISE = -1,
  ANTICLOCKWISE = 1
}

interface RadialAxisOptions extends AxisOptions {
}

interface AngularAxisOptions extends AxisOptions {
  direction?: number
  range?: number[];
  intercept?: number
}

export interface PolarAxisOptions extends AxesOptions {
  innerRadius?: number
  radial?: RadialAxisOptions
  angular?: AngularAxisOptions
}

function mean(x: number[] | number) {
  if (x instanceof Array) {
    return d3.mean(x)
  }
  return x
}

export class PolarAxis extends Axis {
  radialScale: any
  angularScale: any
  outerRadius: number
  innerRadius: number
  intercept: number
  direction: number
  private angularRange: number[]
  static readonly defaultOptions = {}
  private angularDomain: number[] | Date[]
  angularAxisOptions: AngularAxisOptions = {}
  radialAxisOptions: RadialAxisOptions = {}


  constructor(container: HTMLElement, width: number | null, height: number | null, options?: PolarAxisOptions) {
    super(container, width, height, options, PolarAxis.defaultOptions)
    this.canvas = this.canvas
      .append('g')
      .attr('transform', 'translate(' + this.width / 2 + ',' + this.height / 2 + ' )')
    this.direction = options.angular.direction ? options.angular.direction : Direction.ANTICLOCKWISE
    this.intercept = options.angular.intercept ? options.angular.intercept : 0
    this.innerRadius = options.innerRadius ? options.innerRadius : 0
    this.outerRadius = Math.min(this.width, this.height) / 2
    this.angularRange = options.angular.range ? options.angular.range : [0, 2 * Math.PI]
    this.angularDomain = options.angular.domain ? options.angular.domain : [0, 360]
    this.angularAxisOptions = defaultsDeep(this.angularAxisOptions, options.angular, { type: 'value'})
    this.radialAxisOptions = defaultsDeep(this.radialAxisOptions, options.radial, { type: 'value'})
    this.setDefaultTimeOptions(this.angularAxisOptions)
    this.setDefaultTimeOptions(this.radialAxisOptions)

    let startAngle = Math.PI/2  - this.intercept + this.angularRange[0]
    let endAngle =  Math.PI/2 - this.intercept + this.angularRange[1]
    if (this.direction === Direction.ANTICLOCKWISE) {
      startAngle = Math.PI + startAngle
      endAngle = Math.PI + endAngle
    }

    this.canvas
      .append('g')
      .attr('class', 'axis-canvas')
      .append('path')
      .attr(
        'd',
        d3
          .arc()
          .innerRadius(this.innerRadius)
          .outerRadius(this.outerRadius)
          .startAngle(startAngle)
          .endAngle(endAngle)
      )
    this.setRange()
    this.initGrid()
    this.createChartGroup()
  }

  redraw() {
    let radialExtent = new Array(0)
    for (let chart of this.charts) {
      let chartRadialExtent = chart.extent[chart.dataKeys.radial]
      if (this.radialAxisOptions.type === AxisType.band) {
        radialExtent = d3.merge([radialExtent, [].concat(...chartRadialExtent)])
      } else {
        radialExtent = d3.extent(d3.merge([radialExtent, [].concat(...chartRadialExtent)]))
      }
    }
    this.radialScale.domain(radialExtent)
    for (let chart of this.charts) {
      chart.plotter(this, chart.axisIndex)
    }
    this.updateGrid()
  }

  radToDegrees(value: number): number {
    return (value * 180) / Math.PI
  }

  updateGrid() {
    // draw the circular grid lines
    let g = this.canvas
    // draw the radial axis
    let rAxis = d3.axisBottom(this.radialScale).ticks(5)
    let radialAxis = this.canvas.select('.r-axis').call(rAxis)

    let draw = (context, radius) => {
      context.arc(0, 0, radius, -this.direction * this.angularRange[0] - this.intercept, -this.direction * this.angularRange[1] - this.intercept, this.direction === Direction.ANTICLOCKWISE) // draw an arc, the turtle ends up at ⟨194.4,108.5⟩
      return context;
    }

    if (this.radialAxisOptions.type !== AxisType.band) {
      let radialTicks = this.radialScale.ticks(5).map(this.radialScale)
      let drawRadial = this.canvas
        .select('.r-grid')
        .selectAll('path')
        .data(radialTicks)
      drawRadial.exit().remove()
      drawRadial
        .enter()
        .append('path')
        .merge(drawRadial)
        .attr('d', (d) => { return draw(d3.path(), d) })
    }

    let startAngle = Math.PI / 2 - this.intercept + this.angularRange[0]
    let endAngle = Math.PI / 2 - this.intercept + this.angularRange[1]
    if (this.direction === Direction.ANTICLOCKWISE) {
      startAngle = Math.PI + startAngle
      endAngle = Math.PI + endAngle
    }

    let angularTicks
    if (this.angularAxisOptions.type === AxisType.time) {
      const scale = this.angularScale.copy()
      let offsetDomain = scale.domain().map((d) => {
        const m = DateTime.fromJSDate(d as Date).setZone(this.angularAxisOptions.timeZone)
        return new Date(d.getTime() + m.offset * 60000);
      })
      let offsetScale = d3.scaleUtc().domain(offsetDomain)
      let tickValues = offsetScale.ticks(10)
      let offsetValues = tickValues.map((d) => {
        const m = DateTime.fromJSDate(d as Date).setZone(this.angularAxisOptions.timeZone)
        return new Date(d.getTime() - m.offset * 60000);
      })
      angularTicks = offsetValues
    } else {
      const domain = this.angularDomain as number[]

      let step = d3.tickIncrement(domain[0], domain[1], 8)

      step = step >= 100 ? 90 : step >= 50 ? 45 : step >= 20 ? 15 : step
      let start = Math.ceil(domain[0] / step) * step
      let stop = Math.floor(domain[1] / step + 1) * step
      angularTicks = d3.range(start, stop, step)
    }

    let suffix: string = ''
    let offset = 10

    // angularTicks = angularTicks.map(this.radToDegrees)

    let drawAngular = this.canvas
      .select('.t-grid')
      .selectAll('line')
      .data(angularTicks)
      .enter()
      .append('line')
      .attr('x1', this.innerRadius)
      .attr('y1', 0)
      .attr('x2', this.outerRadius)
      .attr('y2', 0)
      .attr('transform', (d: number) => {
        return 'rotate(' + (this.radToDegrees( -this.intercept - this.direction * this.angularScale(d))) + ')'
      })

    let groupRotate = function(d: number) {
      return 'rotate(' + this.radToDegrees( -this.direction * this.angularScale(d)) + ')'
    }.bind(this)
    let drawTicks = this.canvas
      .select('.t-axis')
      .selectAll('g')
      .data(angularTicks)
      .enter()
      .append('g')
      .attr('class', 'tick')
      .attr('transform', groupRotate)
    //   .attr('opacity',1)

    drawTicks
      .append('line')
      .attr('x1', this.outerRadius)
      .attr('y1', 0)
      .attr('x2', this.outerRadius + 6)
      .attr('y2', 0)

    let textRotate = function(d) {
      return (
        'rotate(' +
        this.radToDegrees(this.direction * this.angularScale(d) + this.intercept) +
        ',' +
        (this.outerRadius + 15) +
        ',0' +
        ')'
      )
    }.bind(this)

    let anchor = function(d) {
      let dNorthCW = (( this.radToDegrees(Math.PI / 2 - this.intercept - this.direction * this.angularScale(d)) % 360) + 360) % 360
      if (dNorthCW > 0 && dNorthCW < 180) {
        return 'start'
      } else if (dNorthCW > 180 && dNorthCW < 360) {
        return 'end'
      } else {
        return 'middle'
      }
    }.bind(this)

    const labelFormat = this.angularAxisOptions.format ? this.angularAxisOptions.format : d => d

    drawTicks
      .append('text')
      .attr('text-anchor', anchor)
      .attr('alignment-baseline', 'middle')
      .attr('x', this.outerRadius + 15)
      .attr('y', 0)
      .text(labelFormat)
      .attr('transform', textRotate)
  }

  protected setRange() {
    switch (this.angularAxisOptions.type) {
      case AxisType.time:
        this.angularScale = d3.scaleUtc()
        break
      default:
        this.angularScale = d3.scaleLinear()
    }
    this.angularScale.domain(this.angularDomain).range(this.angularRange)

    switch (this.radialAxisOptions.type) {
      case AxisType.time:
        this.radialScale = d3.scaleUtc()
        break
      case AxisType.band:
        this.radialScale = d3.scaleBand()
        break
      default:
        this.radialScale = d3.scaleLinear()
    }
    this.radialScale.range([this.innerRadius, this.outerRadius])
  }

  protected initGrid() {
    let radialGrid = this.canvas.append('g').attr('class', 'grid r-grid')
    let angularGrid = this.canvas.append('g').attr('class', 'grid t-grid')
    let radialAxis = this.canvas.append('g').attr('class', 'axis r-axis')
    let angularAxis = this.canvas
      .append('g')
      .attr('class', 'axis t-axis')
      .attr('transform', 'rotate(' + -this.intercept * 180 / Math.PI + ')')
    this.updateGrid()
  }
}

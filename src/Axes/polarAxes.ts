import * as d3 from 'd3'
import { Axes, AxesOptions } from './axes.js'
import { AxisType } from '../Axis/axisType.js'
import { AxisOptions } from '../Axis/axisOptions'

import { defaultsDeep } from 'lodash-es'
import { DateTime } from 'luxon'
import { niceDegreeSteps } from '../Utils/niceDegreeSteps.js'
import { D3Selection } from '../Utils/elementTypes.js'

export enum Direction {
  CLOCKWISE = -1,
  ANTICLOCKWISE = 1
}

type RadialAxisOptions = AxisOptions

interface AngularAxisOptions extends AxisOptions {
  direction?: number
  range?: number[];
  intercept?: number
}

export interface PolarAxesOptions extends AxesOptions {
  innerRadius?: number
  radial: RadialAxisOptions
  angular: AngularAxisOptions
}


const polarAxesDefaultOptions = {}


export class PolarAxes extends Axes {
  radialScale: any
  angularScale: any
  innerRadiusFactor: number
  intercept: number
  direction: number
  private angularRange: number[]
  private angularDomain: number[] | Date[]
  angularAxisOptions: AngularAxisOptions = {}
  radialAxisOptions: RadialAxisOptions = {}

  radialAxis: D3Selection<SVGGElement> | null = null
  angularAxis: D3Selection<SVGGElement> | null = null
  radialGrid: D3Selection<SVGGElement> | null = null
  angularGrid: D3Selection<SVGGElement> | null = null

  constructor(container: HTMLElement, width: number | null, height: number | null, options: PolarAxesOptions) {
    super(container, width, height, options, polarAxesDefaultOptions)
    this.canvas = this.canvas
      .append('g')
    this.direction = options.angular.direction ? options.angular.direction : Direction.ANTICLOCKWISE
    this.intercept = options.angular.intercept ? options.angular.intercept : 0
    this.innerRadiusFactor = options.innerRadius ? options.innerRadius : 0
    this.angularRange = options.angular.range ? options.angular.range : [0, 2 * Math.PI]
    this.angularDomain = options.angular.domain ? options.angular.domain : [0, 360]
    this.angularAxisOptions = defaultsDeep(this.angularAxisOptions, options.angular, { type: 'value' })
    this.radialAxisOptions = defaultsDeep(this.radialAxisOptions, options.radial, { type: 'value' })
    this.setDefaultTimeOptions(this.angularAxisOptions)
    this.setDefaultTimeOptions(this.radialAxisOptions)

    this.canvas
      .append('g')
      .attr('class', 'canvas')
      .append('path')
    this.updateCanvas()
    this.setRange()
    this.initGrid()
    this.createChartGroup()
  }

  updateCanvas() {
    this.canvas.attr('transform', 'translate(' + this.width / 2 + ',' + this.height / 2 + ' )')
    let startAngle = Math.PI / 2 - this.intercept + this.angularRange[0]
    let endAngle = Math.PI / 2 - this.intercept + this.angularRange[1]
    if (this.direction === Direction.ANTICLOCKWISE) {
      startAngle = Math.PI + startAngle
      endAngle = Math.PI + endAngle
    }
    this.canvas
      .select('.canvas')
      .select('path')
      .attr(
        'd',
        d3
          .arc()
          .innerRadius(this.innerRadius)
          .outerRadius(this.outerRadius)
          .startAngle(startAngle)
          .endAngle(endAngle)
      )
  }

  get innerRadius(): number {
    return this.innerRadiusFactor * this.outerRadius
  }

  get outerRadius(): number {
    return Math.min(this.width, this.height) / 2
  }

  redraw() {
    let radialExtent = new Array(0)
    for (const chart of this.charts) {
      const chartRadialExtent = chart.extent[chart.dataKeys.radial]
      if (this.radialAxisOptions.type === AxisType.band) {
        radialExtent = d3.merge([radialExtent, [].concat(...chartRadialExtent)])
      } else {
        radialExtent = d3.extent(d3.merge([radialExtent, [].concat(...chartRadialExtent)]))
      }
    }
    this.radialScale.domain(radialExtent)
    for (const chart of this.charts) {
      chart.plotter(this, chart.axisIndex)
    }
    this.update()
    for (const visitor of this.visitors) {
      visitor.redraw()
    }
  }

  radToDegrees(value: number): number {
    return (value * 180) / Math.PI
  }

  update() {
    // draw the circular grid lines
    // draw the radial axis
    const rAxis = d3.axisBottom(this.radialScale).ticks(5)
    this.radialAxis.call(rAxis)

    const draw = (context, radius) => {
      context.arc(0, 0, radius, -this.direction * this.angularRange[0] - this.intercept, -this.direction * this.angularRange[1] - this.intercept, this.direction === Direction.ANTICLOCKWISE) // draw an arc, the turtle ends up at ⟨194.4,108.5⟩
      return context;
    }

    if (this.radialAxisOptions.type !== AxisType.band) {
      const radialTicks = this.radialScale.ticks(5).map(this.radialScale)
      const drawRadial = this.radialAxis
        .selectAll<SVGPathElement, unknown>('path')
        .data(radialTicks)
      drawRadial.exit().remove()
      drawRadial
        .enter()
        .append('path')
        .merge(drawRadial)
        .attr('d', (d) => { return draw(d3.path(), d) })
    }

    let angularTicks
    if (this.angularAxisOptions.type === AxisType.time) {
      const scale = this.angularScale.copy()
      const offsetDomain = scale.domain().map((d) => {
        const m = DateTime.fromJSDate(d).setZone(this.angularAxisOptions.timeZone)
        return new Date(d.getTime() + m.offset * 60000);
      })
      const offsetScale = d3.scaleUtc().domain(offsetDomain)
      const tickValues = offsetScale.ticks(10)
      const offsetValues = tickValues.map((d) => {
        const m = DateTime.fromJSDate(d).setZone(this.angularAxisOptions.timeZone)
        return new Date(d.getTime() - m.offset * 60000);
      })
      angularTicks = offsetValues
    } else {
      const domain = this.angularDomain as number[]

      let step = d3.tickIncrement(domain[0], domain[1], 8)

      step = niceDegreeSteps(step)
      const start = Math.ceil(domain[0] / step) * step
      const stop = Math.floor(domain[1] / step + 1) * step
      angularTicks = d3.range(start, stop, step)
    }

    if (
      (Math.cos(this.angularRange[0]) - Math.cos(this.angularRange[1]) < 1e-6) &&
      (Math.sin(this.angularRange[0]) - Math.sin(this.angularRange[1]) < 1e-6)
    ) angularTicks.shift()

    const ticksSelection = this.angularGrid
      .selectAll<SVGLineElement, unknown>('line')
      .data(angularTicks)

    ticksSelection.exit().remove()

    ticksSelection
      .enter()
      .append('line')
      .merge(ticksSelection)
      .attr('x1', this.innerRadius)
      .attr('y1', 0)
      .attr('x2', this.outerRadius)
      .attr('y2', 0)
      .attr('transform', (d: number) => {
        return 'rotate(' + (this.radToDegrees(-this.intercept - this.direction * this.angularScale(d))) + ')'
      })

    const groupRotate = function (d: number) {
      return 'rotate(' + this.radToDegrees(-this.direction * this.angularScale(d)) + ')'
    }.bind(this)
    const drawTicks = this.angularAxis
      .selectAll('g')
      .data(angularTicks)

    const tickElements = drawTicks
      .enter()
      .append('g')
      .attr('class', 'tick')
      .attr('transform', groupRotate)

    tickElements.append('line')
    tickElements.append('text')

    this.angularAxis
      .selectAll('.tick')
      .select('line')
      .attr('x1', this.outerRadius)
      .attr('y1', 0)
      .attr('x2', this.outerRadius + 6)
      .attr('y2', 0)

    const textRotate = function (d) {
      return (
        'rotate(' +
        this.radToDegrees(this.direction * this.angularScale(d) + this.intercept) +
        ',' +
        (this.outerRadius + 15) +
        ',0' +
        ')'
      )
    }.bind(this)

    const anchor = function (d) {
      const dNorthCW = ((this.radToDegrees(Math.PI / 2 - this.intercept - this.direction * this.angularScale(d)) % 360) + 360) % 360
      if (dNorthCW > 0 && dNorthCW < 180) {
        return 'start'
      } else if (dNorthCW > 180 && dNorthCW < 360) {
        return 'end'
      } else {
        return 'middle'
      }
    }.bind(this)

    const labelFormat = this.angularAxisOptions.format ? this.angularAxisOptions.format : d => d

    this.angularAxis
      .selectAll('.tick')
      .select('text')
      .attr('text-anchor', anchor)
      .attr('alignment-baseline', 'middle')
      .attr('x', this.outerRadius + 15)
      .attr('y', 0)
      .text(labelFormat)
      .attr('transform', textRotate)

    this.updateCanvas()
  }

  protected setRange() {
    switch (this.angularAxisOptions.type) {
      case AxisType.time:
        this.angularScale = d3.scaleUtc()
        break
      case AxisType.value:
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
      case AxisType.value:
      default:
        this.radialScale = d3.scaleLinear()
    }
    this.radialScale.range([this.innerRadius, this.outerRadius])
  }

  protected initGrid() {
    this.radialGrid = this.canvas
      .append('g')
      .attr('class', 'grid r-grid')
    this.angularGrid = this.canvas
      .append('g')
      .attr('class', 'grid t-grid')

    this.radialAxis = this.canvas
      .append('g')
      .attr('class', 'axis r-axis')
      .attr('font-family', 'sans-serif')
      .attr('fill', 'currentColor')
    this.angularAxis = this.canvas
      .append('g')
      .attr('class', 'axis t-axis')
      .attr('transform', 'rotate(' + -this.intercept * 180 / Math.PI + ')')
      .attr('font-family', 'sans-serif')
      .attr('fill', 'currentColor')
    this.update()
  }
}

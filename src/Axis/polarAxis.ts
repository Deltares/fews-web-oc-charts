import * as d3 from 'd3'
import { Axis, AxisOptions } from './axis'

// import { scaleLinear } from 'd3-scale'

export const CLOCKWISE = -1
export const ANTICLOCKWISE = 1

interface RadialAxisOptions {
  label?: string
  scale?: number | number[]
}

interface AngularAxisOptions {
  label?: string
  direction?: number
  intercept?: number
  range?: number[]
}

export interface PolarAxisOptions extends AxisOptions {
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

  constructor(container: HTMLElement, width: number, height: number, options?: PolarAxisOptions) {
    super(container, width, height, options)
    this.canvas = this.canvas
      .append('g')
      .attr('transform', 'translate(' + this.width / 2 + ',' + this.height / 2 + ' )')

    this.direction =
      options.angular && options.angular.direction ? options.angular.direction : ANTICLOCKWISE
    this.intercept = options.angular && options.angular.intercept ? options.angular.intercept : 0
    this.innerRadius = options.innerRadius ? options.innerRadius : 0
    this.outerRadius = Math.min(this.width, this.height) / 2
    this.angularRange =
      options.angular && options.angular.range ? options.angular.range : [0, 2 * Math.PI]

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
          .startAngle(this.angularRange[0])
          .endAngle(this.angularRange[1])
      )

    this.setRange()
    this.initGrid()
  }

  redraw() {
    let radialExtent = new Array(2)
    for (let chart of this.charts) {
      let chartRadialExtent = d3.extent(chart.data, function(d: any) {
        return d[chart.dataKeys.rkey]
      })
      radialExtent = d3.extent(d3.merge([radialExtent, [].concat(...chartRadialExtent)]))
    }
    this.radialScale.domain(radialExtent).nice()
    for (let chart of this.charts) {
      chart.plotterPolar(this, chart.dataKeys)
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

    let radialTicks = this.radialScale.ticks(5).map(this.radialScale)
    let drawRadial = this.canvas
      .select('.r-grid')
      .selectAll('circle')
      .data(radialTicks)
    drawRadial.exit().remove()
    drawRadial
      .enter()
      .append('circle')
      .merge(drawRadial)
      .attr('cx', 0)
      .attr('cy', 0)
      .attr('r', function(d: number) {
        return d
      })

    let angularTicks = d3.range(
      this.angularRange[0],
      this.angularRange[1],
      this.angularRange[1] / 8
    )
    let suffix: string = ''
    let offset = 10

    angularTicks = angularTicks.map(this.radToDegrees)

    let drawAngular = this.canvas
      .select('.t-grid')
      .selectAll('line')
      .data(angularTicks)
      .enter()
      .append('line')
      .attr('x1', radialTicks[0])
      .attr('y1', 0)
      .attr('x2', this.outerRadius)
      .attr('y2', 0)
      .attr('transform', function(d: number) {
        return 'rotate(' + d + ')'
      })

    let groupRotate = function(d: number) {
      return 'rotate(' + -this.direction * d + ')'
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

    let textRotate = function(d: number) {
      return (
        'rotate(' +
        (this.direction * d + this.intercept) +
        ',' +
        (this.outerRadius + 15) +
        ',0' +
        ')'
      )
    }.bind(this)
    let anchor = function(d: number) {
      let dNorthCW = (((90 - this.intercept - this.direction * d) % 360) + 360) % 360
      if (dNorthCW > 0 && dNorthCW < 180) {
        return 'start'
      } else if (dNorthCW > 180 && dNorthCW < 360) {
        return 'end'
      } else {
        return 'middle'
      }
    }.bind(this)

    drawTicks
      .append('text')
      .attr('text-anchor', anchor)
      .attr('alignment-baseline', 'middle')
      .attr('x', this.outerRadius + 15)
      .attr('y', 0)
      .text(function(d: number) {
        return d
      })
      .attr('transform', textRotate)
  }

  showTooltip(d: any) {
    this.tooltip
      .transition()
      .duration(50)
      .style('opacity', 0.9)
    this.tooltip
      .html('t: ' + mean(d.t).toFixed(2) + '<br/>' + 'r: ' + mean(d.r).toFixed(2))
      .style('left', d3.event.pageX + 'px')
      .style('top', d3.event.pageY + 'px')
  }

  protected setRange() {
    this.radialScale = d3.scaleLinear().range([this.innerRadius, this.outerRadius])
    this.angularScale = d3
      .scaleLinear()
      .domain([0, 360])
      .range(this.angularRange)
  }

  protected initGrid() {
    let radialGrid = this.canvas.append('g').attr('class', 'grid r-grid')
    let angularGrid = this.canvas.append('g').attr('class', 'grid t-grid')
    let radialAxis = this.canvas.append('g').attr('class', 'axis r-axis')
    let angularAxis = this.canvas
      .append('g')
      .attr('class', 'axis t-axis')
      .attr('font-size', '10')
      .attr('font-family', 'sans-serif')
      .attr('transform', 'rotate(' + -this.intercept + ')')
    this.updateGrid()
  }
}

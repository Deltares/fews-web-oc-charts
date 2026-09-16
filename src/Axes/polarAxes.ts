import * as d3 from 'd3'
import { Axes, AxesOptions } from './axes.js'
import { AxisType } from '../Axis/axisType.js'
import { AxisOptions } from '../Axis/axisOptions'

import { merge } from 'lodash-es'
import { DateTime } from 'luxon'
import { niceDegreeSteps } from '../Utils/niceDegreeSteps.js'

export const Direction = {
  CLOCKWISE: -1,
  ANTICLOCKWISE: 1,
} as const

export type Direction = (typeof Direction)[keyof typeof Direction]

export type RadialAxisOptions = AxisOptions

export interface AngularAxisOptions extends AxisOptions {
  direction?: Direction
  range?: number[]
  intercept?: number
}

export interface PolarAxesOptions extends AxesOptions {
  innerRadius?: number
  radial?: RadialAxisOptions
  angular?: AngularAxisOptions
}

const polarAxesDefaultOptions: PolarAxesOptions = {
  innerRadius: 0,
  angular: {
    direction: Direction.ANTICLOCKWISE,
    intercept: 0,
    range: [0, 2 * Math.PI],
    domain: [0, 360],
  },
  radial: {
    type: AxisType.value,
  },
}

export class PolarAxes extends Axes {
  radialScale: any
  angularScale: any
  declare options: PolarAxesOptions

  radialAxis: d3.Selection<SVGGElement, unknown, null, unknown> | null = null
  angularAxis: d3.Selection<SVGGElement, unknown, null, unknown> | null = null
  radialGrid: d3.Selection<SVGGElement, unknown, null, unknown> | null = null
  angularGrid: d3.Selection<SVGGElement, unknown, null, unknown> | null = null

  constructor(
    container: HTMLElement,
    width: number | null,
    height: number | null,
    options: PolarAxesOptions,
  ) {
    super(container, width, height, options, polarAxesDefaultOptions)
    this.options.angular = { ...polarAxesDefaultOptions.angular, ...this.options.angular }
    this.options.radial = { ...polarAxesDefaultOptions.radial, ...this.options.radial }
    this.canvas = this.canvas.append('g')

    this.setDefaultTimeOptions(this.options.angular)
    this.setDefaultTimeOptions(this.options.radial)

    this.canvas.append('g').attr('class', 'canvas').append('path')
    this.updateCanvas()
    this.setRange()
    this.initGrid()
    this.createChartGroup()
  }

  setOptions(options: Partial<PolarAxesOptions>): void {
    merge(this.options, options)
  }

  get direction(): Direction {
    const angularOptions = this.options.angular ?? polarAxesDefaultOptions.angular
    return angularOptions?.direction ?? Direction.ANTICLOCKWISE
  }

  get intercept(): number {
    const angularOptions = this.options.angular ?? polarAxesDefaultOptions.angular
    return angularOptions?.intercept ?? 0
  }

  get innerRadiusFactor(): number {
    return this.options.innerRadius ?? polarAxesDefaultOptions.innerRadius ?? 0
  }

  get innerRadius(): number {
    return this.innerRadiusFactor * this.outerRadius
  }

  get outerRadius(): number {
    return Math.min(this.width, this.height) / 2
  }

  updateCanvas() {
    const angularOptions = this.options.angular ?? polarAxesDefaultOptions.angular
    const angularRange = angularOptions?.range ?? [0, 2 * Math.PI]

    this.canvas.attr('transform', 'translate(' + this.width / 2 + ',' + this.height / 2 + ' )')
    let startAngle = Math.PI / 2 - this.intercept + angularRange[0]
    let endAngle = Math.PI / 2 - this.intercept + angularRange[1]
    if (this.direction === Direction.ANTICLOCKWISE) {
      startAngle = Math.PI + startAngle
      endAngle = Math.PI + endAngle
    }

    const arc = d3
      .arc<d3.DefaultArcObject>()
      .innerRadius(this.innerRadius)
      .outerRadius(this.outerRadius)
      .startAngle(startAngle)
      .endAngle(endAngle)

    this.canvas
      .select('.canvas')
      .select('path')
      .attr('d', arc as any)
  }

  redraw() {
    const radialOptions = this.options.radial ?? polarAxesDefaultOptions.radial
    let radialExtent: number[] = []
    for (const chart of this.charts) {
      const radialKey = chart.dataKeys.radial
      if (!radialKey) continue
      const chartRadialExtent = chart.extent[radialKey] ?? []
      const flatExtent = (chartRadialExtent.flat() ?? []) as number[]
      if (radialOptions?.type === AxisType.band) {
        radialExtent = [...radialExtent, ...flatExtent]
      } else {
        const nextExtent = d3.extent([...radialExtent, ...flatExtent]) as [number, number]
        radialExtent = nextExtent.length === 2 ? [...nextExtent] : [0, 1]
      }
    }
    const radialDomain =
      radialExtent.length >= 2
        ? ([radialExtent[0], radialExtent[1]] as [number, number])
        : ([0, 1] as [number, number])
    this.radialScale.domain(radialDomain)
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
    const angularOptions: AngularAxisOptions = this.options.angular ??
      polarAxesDefaultOptions.angular ?? {
        direction: Direction.ANTICLOCKWISE,
        intercept: 0,
        range: [0, 2 * Math.PI],
        domain: [0, 360],
      }
    const radialOptions: RadialAxisOptions = this.options.radial ??
      polarAxesDefaultOptions.radial ?? {
        type: AxisType.value,
      }
    const radialAxis = this.radialAxis
    const radialGrid = this.radialGrid
    const angularGrid = this.angularGrid
    const angularAxis = this.angularAxis
    if (!radialAxis || !radialGrid || !angularGrid || !angularAxis) return

    const angularRange = angularOptions.range ?? [0, 2 * Math.PI]
    const draw = (radius: number): string => {
      const path = d3.path()
      path.arc(
        0,
        0,
        radius,
        -this.direction * angularRange[0] - this.intercept,
        -this.direction * angularRange[1] - this.intercept,
        this.direction === Direction.ANTICLOCKWISE,
      )
      return path.toString()
    }

    const rAxis = d3.axisBottom(this.radialScale).ticks(5)
    radialAxis.call(rAxis as any)

    if (radialOptions.type !== AxisType.band) {
      const radialTicks = this.radialScale.ticks(5)
      const drawRadial = radialGrid.selectAll<SVGPathElement, unknown>('path').data(radialTicks)
      drawRadial.exit().remove()
      drawRadial
        .enter()
        .append('path')
        .merge(drawRadial)
        .attr('d', ((d: number) => draw(d)) as any)
    }

    let angularTicks: number[]
    if (angularOptions.type === AxisType.time) {
      const scale = this.angularScale.copy()
      const offsetDomain = scale.domain().map((d: Date) => {
        const m = DateTime.fromJSDate(d).setZone(angularOptions.timeZone)
        return new Date(d.getTime() + m.offset * 60000)
      })
      const offsetScale = d3.scaleUtc().domain(offsetDomain)
      const tickValues = offsetScale.ticks(10)
      const offsetValues = tickValues.map((d: Date) => {
        const m = DateTime.fromJSDate(d).setZone(angularOptions.timeZone)
        return new Date(d.getTime() - m.offset * 60000)
      })
      angularTicks = offsetValues.map((d) => Number(d))
    } else {
      const domain = angularOptions.domain as [number, number]
      let step = d3.tickIncrement(domain[0], domain[1], 8)
      step = niceDegreeSteps(step)
      const start = Math.ceil(domain[0] / step) * step
      const stop = Math.floor(domain[1] / step + 1) * step
      angularTicks = d3.range(start, stop, step)
    }

    if (
      Math.cos(angularRange[0]) - Math.cos(angularRange[1]) < 1e-6 &&
      Math.sin(angularRange[0]) - Math.sin(angularRange[1]) < 1e-6
    ) {
      angularTicks.shift()
    }

    const ticksSelection = angularGrid.selectAll<SVGLineElement, unknown>('line').data(angularTicks)
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
        return (
          'rotate(' +
          this.radToDegrees(-this.intercept - this.direction * this.angularScale(d as any)) +
          ')'
        )
      })

    const groupRotate = function (this: PolarAxes, d: number) {
      return 'rotate(' + this.radToDegrees(-this.direction * this.angularScale(d as any)) + ')'
    }.bind(this)
    const drawTicks = angularAxis.selectAll('g').data(angularTicks)

    const tickElements = drawTicks
      .enter()
      .append('g')
      .attr('class', 'tick')
      .attr('transform', groupRotate)

    tickElements.append('line')
    tickElements.append('text')

    angularAxis
      .selectAll('.tick')
      .select('line')
      .attr('x1', this.outerRadius)
      .attr('y1', 0)
      .attr('x2', this.outerRadius + 6)
      .attr('y2', 0)

    const textRotate = function (this: PolarAxes, d: number) {
      return (
        'rotate(' +
        this.radToDegrees(this.direction * this.angularScale(d as any) + this.intercept) +
        ',' +
        (this.outerRadius + 15) +
        ',0' +
        ')'
      )
    }.bind(this)

    const anchor = function (this: PolarAxes, d: number) {
      const dNorthCW =
        ((this.radToDegrees(
          Math.PI / 2 - this.intercept - this.direction * this.angularScale(d as any),
        ) %
          360) +
          360) %
        360
      if (dNorthCW > 0 && dNorthCW < 180) {
        return 'start'
      } else if (dNorthCW > 180 && dNorthCW < 360) {
        return 'end'
      } else {
        return 'middle'
      }
    }.bind(this)

    const labelFormat = angularOptions.format ?? ((d: number | Date) => String(d))

    angularAxis
      .selectAll('.tick')
      .select('text')
      .attr('text-anchor', anchor as any)
      .attr('alignment-baseline', 'middle')
      .attr('x', this.outerRadius + 15)
      .attr('y', 0)
      .text((d: any) => String(labelFormat(d)))
      .attr('transform', textRotate as any)

    this.updateCanvas()
  }

  protected setRange() {
    const angularOptions = this.options.angular ?? polarAxesDefaultOptions.angular
    const radialOptions = this.options.radial ?? polarAxesDefaultOptions.radial

    switch (angularOptions?.type) {
      case AxisType.time:
        this.angularScale = d3.scaleUtc()
        break
      case AxisType.value:
      default:
        this.angularScale = d3.scaleLinear()
    }
    this.angularScale
      .domain((angularOptions?.domain as [number, number] | [Date, Date]) ?? [0, 360])
      .range(angularOptions?.range ?? [0, 2 * Math.PI])

    switch (radialOptions?.type) {
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
    this.radialGrid = this.canvas.append('g').attr('class', 'grid r-grid')
    this.angularGrid = this.canvas.append('g').attr('class', 'grid t-grid')

    this.radialAxis = this.canvas
      .append('g')
      .attr('class', 'axis r-axis')
      .attr('font-family', 'sans-serif')
    this.angularAxis = this.canvas
      .append('g')
      .attr('class', 'axis t-axis')
      .attr('transform', 'rotate(' + (-this.intercept * 180) / Math.PI + ')')
      .attr('font-family', 'sans-serif')
    this.update()
  }
}

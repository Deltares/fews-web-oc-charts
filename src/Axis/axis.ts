import * as d3 from 'd3'
import { DateTime } from 'luxon'
import { AxisOrientation } from './axisOrientation.js'
import { AxisPosition } from './axisPosition.js'
import { createAxis } from './createAxis.js'
import { generateMultiFormat } from '../Utils/date.js'
import { AxisType } from './axisType.js'
import { niceDegreeSteps } from '../Utils/niceDegreeSteps.js'

export interface BaseAxisOptions {
  axisKey: string
  axisIndex: number
  orientation: AxisOrientation
  position: AxisPosition
  type: AxisType
  timeZone: string
  locale: string
  labelAngle?: number
}

export abstract class Axis {
  options: BaseAxisOptions
  position: AxisPosition
  orientation: AxisOrientation
  group: d3.Selection<SVGGElement, unknown, null, unknown>
  axis: d3.Axis<any>
  spanScale: any
  clientRect: DOMRect

  constructor(
    group: d3.Selection<SVGGElement, unknown, null, unknown>,
    scale: any,
    spanScale: any,
    options: Partial<BaseAxisOptions>,
  ) {
    this.options = options as any
    this.orientation = options.orientation!
    this.position = options.position!
    this.spanScale = spanScale
    this.create(group, scale)
  }

  get class(): string {
    return `${this.options.axisKey}-axis-${this.options.axisIndex}`
  }

  protected create(group, scale): void {
    this.group = group.append('g').attr('class', `axis ${this.class}`)
    this.axis = createAxis(this.orientation, scale)
    this.redraw()
  }

  redraw(): void {
    if (this.options.type === AxisType.time) {
      this.updateTicksForTime()
    } else if (this.options.type === AxisType.degrees) {
      this.updateTicksForDegrees()
    }
    this.group.attr('transform', this.translateAxis(this.position)).call(this.axis)
    if (this.options.labelAngle !== undefined) {
      this.translateTickLabels(this.orientation, this.options.labelAngle)
    }
    this.clientRect = this.group.node().getClientRects()[0]
  }

  abstract translateAxis(position: AxisPosition): string

  abstract translateTickLabels(orientation: AxisOrientation, angle: number): void

  updateTicksForTime() {
    const scale = this.axis.scale()
    const offsetDomain = scale.domain().map((d: Date) => {
      const m = DateTime.fromJSDate(d).setZone(this.options.timeZone)
      return new Date(d.getTime() + m.offset * 60000)
    })
    const offsetScale = d3.scaleUtc().domain(offsetDomain)
    const tickValues = offsetScale.ticks(5)
    const offsetValues = tickValues.map((d) => {
      const m = DateTime.fromJSDate(d).setZone(this.options.timeZone)
      return new Date(d.getTime() - m.offset * 60000)
    })
    this.axis.tickValues(offsetValues)
    this.axis.tickFormat(generateMultiFormat(this.options.timeZone, this.options.locale))
  }

  updateTicksForDegrees() {
    const scale = this.axis.scale()
    const domain = scale.domain()
    let step = d3.tickIncrement(domain[0], domain[1], 5)
    step = niceDegreeSteps(step)
    const start = Math.ceil(domain[0] / step) * step
    const stop = Math.floor(domain[1] / step + 1) * step
    this.axis.tickValues(d3.range(start, stop, step))
  }
}

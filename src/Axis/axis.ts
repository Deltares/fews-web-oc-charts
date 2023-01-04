import d3 from "d3";
import { DateTime } from "luxon";
import { AxisOrientation } from "./axisOrientation.js";
import { AxisPosition } from "./axisPosition.js";
import { createAxis } from "./createAxis.js";
import { generateMultiFormat } from '../Utils/date.js'
import { AxisType } from "./axisType.js";
import { niceDegreeSteps } from "../Utils/niceDegreeSteps.js";

interface AxisOptions {
  axisKey: string;
  axisIndex: number;
  orientation: AxisOrientation;
  position: AxisPosition;
  type: AxisType;
  timeZone: string;
  locale: string;
}

export abstract class Axis {
  options: AxisOptions
  position: AxisPosition
  orientation: AxisOrientation
  group: d3.Selection<SVGGElement, unknown, null, unknown>
  axis: d3.Axis<any>
  spanScale: any

  constructor(group: d3.Selection<SVGGElement, unknown, null, unknown>, scale: any, spanScale: any, options: Partial<AxisOptions>) {
    this.position = options.position ?? AxisPosition.Bottom
    this.orientation = options.orientation ?? AxisOrientation.Bottom
    this.options = options as any
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
    }
    if (this.options.type === AxisType.degrees) {
      this.updateTicksForDegrees()
    }
    this.group
      .attr('transform', this.translateAxis(this.position))
      .call(this.axis)

    console.log('redraw')
  }

  abstract translateAxis(position): string


  updateTicksForTime() {
    const scale = this.axis.scale()
    const offsetDomain = scale.domain().map((d: Date) => {
      const m = DateTime.fromJSDate(d).setZone(this.options.timeZone)
      return new Date(d.getTime() + m.offset * 60000);
    })
    const offsetScale = d3.scaleUtc().domain(offsetDomain)
    const tickValues = offsetScale.ticks(5)
    const offsetValues = tickValues.map((d) => {
      const m = DateTime.fromJSDate(d).setZone(this.options.timeZone)
      return new Date(d.getTime() - m.offset * 60000);
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

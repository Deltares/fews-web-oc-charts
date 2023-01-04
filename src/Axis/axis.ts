import { AxisOrientation } from "./axisOrientation.js";
import { AxisPosition } from "./axisPosition.js";
import { createAxis } from "./createAxis.js";

interface AxisOptions {
  axisKey: string;
  axisIndex: number;
  orientation: AxisOrientation;
  position: AxisPosition;
}

export abstract class Axis {
  options: AxisOptions
  position: AxisPosition
  orientation: AxisOrientation
  group: d3.Selection<SVGGElement, unknown, null, unknown>
  axis: d3.Axis<d3.AxisDomain>
  spanScale: any

  constructor(group: d3.Selection<SVGGElement, unknown, null, unknown>, scale: any, spanScale: any, options: AxisOptions) {
    this.position = options.position
    this.orientation = options.orientation
    this.options = options
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
    console.log(this.position)
    this.group
      .attr('transform', this.translateAxis(this.position))
      .call(this.axis)

    console.log('redraw')
  }

  abstract translateAxis(position): string
}

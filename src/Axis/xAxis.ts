import { textAnchorForAngle } from "../Utils/textAnchorForAngle.js";
import { Axis, BaseAxisOptions } from "./axis.js";
import { AxisOrientation } from "./axisOrientation.js";
import { AxisPosition } from "./axisPosition.js";

export interface GridOptions {
  axisKey: 'x' | 'y';
  axisIndex: number;
}

export class XAxis extends Axis {

  constructor(group: d3.Selection<SVGGElement, unknown, null, unknown>, scale: any, spanScale: any, options: Partial<BaseAxisOptions>) {
    console.log('XAxis', options)
    if ( options.orientation === undefined ) {
      options.orientation = options.position !== undefined && options.position !== AxisPosition.AtZero ? options.position : AxisOrientation.Bottom
    }
    if ( options.position === undefined ) {
      options.position = AxisOrientation.Bottom
    }
    console.log('XAxis', options)
    super(group, scale, spanScale, options)
  }

  translateAxis(position): string {
    if (position === AxisPosition.AtZero) {
      return `translate(0,${this.spanScale(0)})`
    } else if (position === AxisPosition.Bottom) {
      return `translate(0,${this.spanScale.range()[0]})`
    }
    return ''
  }

  translateTickLabels(orientation: AxisOrientation, angle: number) {
    console.log('updateTickLabel', angle)
    switch (angle) {
      case 0:
        break
      case 180:
        this.group
          .selectAll("text")
          .attr("transform", `rotate(${angle})`);
        break
      default:
        const anchor = textAnchorForAngle(angle, orientation)
        const offset = orientation === AxisOrientation.Top ? -15 : 15
        this.group
          .selectAll("text")
          .attr("x", null)
          .attr("dx", null)
          .attr("y", null)
          .attr("dy", null)
          .attr("text-anchor", anchor)
          .attr("dominant-baseline", "middle")
          .attr("transform", `translate(0, ${offset}) rotate(${angle})`)
    }
  }

}

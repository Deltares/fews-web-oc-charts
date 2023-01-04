import { Axis } from "./axis.js";
import { AxisPosition } from "./axisPosition.js";

export class YAxis extends Axis {

  translateAxis(position): string {
    if (position === AxisPosition.AtZero) {
      return `translate(${this.spanScale(0)},0)`
    } else if (position === AxisPosition.Right) {
      return `translate(${this.spanScale.range()[1]},0)`
    }
    return ''
  }
}

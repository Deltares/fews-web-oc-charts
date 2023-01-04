import { Axis } from "./axis.js";
import { AxisPosition } from "./axisPosition.js";

export interface GridOptions {
  axisKey: 'x' | 'y';
  axisIndex: number;
}

export class XAxis extends Axis {

  translateAxis(position): string {
    console.log(position, AxisPosition.Bottom)
    console.log(position === AxisPosition.Bottom)
    if (position === AxisPosition.AtZero) {
      return `translate(0,${this.spanScale.scale(0)})`
    } else if (position === AxisPosition.Bottom) {
      return `translate(0,${this.spanScale.range()[0]})`
    }
    return ''
  }
}

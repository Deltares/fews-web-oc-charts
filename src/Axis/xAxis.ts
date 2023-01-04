import { Axis } from "./axis.js";
import { AxisPosition } from "./axisPosition.js";

export interface GridOptions {
  axisKey: 'x' | 'y';
  axisIndex: number;
}

export class XAxis extends Axis {

  translateAxis(position): string {
    if (position === AxisPosition.AtZero) {
      return `translate(0,${this.spanScale(0)})`
    } else if (position === AxisPosition.Bottom) {
      return `translate(0,${this.spanScale.range()[0]})`
    }
    return ''
  }
}

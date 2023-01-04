import { AxisOptions } from "./axisOptions.js";
import { AxisPosition } from "./axisPosition.js";

export interface CartesianAxisOptions extends AxisOptions {
  position?: AxisPosition;
}

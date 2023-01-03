import { ScaleOptions } from "../Scale/scaleOptions.js";
import { AxisOrientation } from "./axisOrientation.js";
import { AxisType } from "./axisType.js";

export interface AxisOptions extends ScaleOptions {
  label?: string;
  labelAngle?: number;
  type?: AxisType;
  unit?: string;
  showGrid?: boolean;
  format?: (x: number | Date) => string;
  reverse?: boolean;
  locale?: string;
  timeZone?: string;
  orientation?: AxisOrientation;
  defaultDomain?: [number, number] | [Date, Date];
}

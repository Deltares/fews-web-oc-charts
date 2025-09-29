import { ScaleOptions } from '../Scale/scaleOptions.js'
import { AxisOrientation } from './axisOrientation.js'
import { AxisPosition } from './axisPosition.js'
import { LabelOrientation } from './labelOrientation.js'
import { AxisType } from './axisType.js'

export interface AxisOptions extends ScaleOptions {
  label?: string
  labelAngle?: number
  labelOrientation?: LabelOrientation
  labelOffset?: number
  type?: AxisType
  unit?: string
  showGrid?: boolean
  showAxis?: boolean
  format?: (x: number | Date) => string
  reverse?: boolean
  locale?: string
  timeZone?: string
  orientation?: AxisOrientation
  position?: AxisPosition
  defaultDomain?: [number, number] | [Date, Date]
}

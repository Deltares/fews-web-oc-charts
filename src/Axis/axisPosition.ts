import { AxisOrientation } from './axisOrientation.js'
export const AxisPosition = {
  AtZero: 'atzero',
  ...AxisOrientation,
} as const

export type AxisPosition = (typeof AxisPosition)[keyof typeof AxisPosition]

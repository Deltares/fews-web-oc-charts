export const AxisOrientation = {
  Top: 'top',
  Bottom: 'bottom',
  Left: 'left',
  Right: 'right',
} as const

export type AxisOrientation = (typeof AxisOrientation)[keyof typeof AxisOrientation]

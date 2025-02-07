export const LabelOrientation = {
  Vertical: 'vertical',
  Horizontal: 'horizontal',
} as const

export type LabelOrientation = (typeof LabelOrientation)[keyof typeof LabelOrientation]

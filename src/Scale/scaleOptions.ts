export enum ResetZoom {
  initial = 'initial',
  full = 'full',
  toggle = 'toggle',
}

export interface ScaleOptions {
  domain?: [number, number] | [Date, Date]
  nice?: boolean
  includeZero?: boolean
  symmetric?: boolean
  resetZoom?: ResetZoom
}

export interface ZoomOptions extends ScaleOptions {
  autoScale?: boolean
  fullExtent?: boolean
}

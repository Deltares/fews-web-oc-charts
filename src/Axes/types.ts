/**
 * Margins for a set of axes.
 */
export interface Margin {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

/**
 * Options for a set of axes.
 * 
 * In general, implementations of the base Axes class will extend these options.s
 */
export interface AxesOptions {
  transitionTime?: number;
  margin?: Margin;
}

/**
 * TODO: what does this represent?
 */
export interface AxisIndexItem {
  key: string;
  axisIndex: number;
}

/**
 * TODO: what does this represent?
 */
export interface AxisIndex {
  x?: AxisIndexItem;
  x1?: { key: string };
  y?: AxisIndexItem;
  radial?: AxisIndexItem;
  angular?: AxisIndexItem;
  value?: { key: string };
  color?: { key: string };
}

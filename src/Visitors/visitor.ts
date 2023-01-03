import { Axis } from '../Axes/axis.js'

export interface Visitor {
  visit(axis: Axis)
  redraw()
}

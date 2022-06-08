import { Axis } from '../Axis/axis.js'

export interface Visitor {
  visit(axis: Axis)
  redraw()
}

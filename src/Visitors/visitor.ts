import { Axis } from '../Axis'

export interface Visitor {
  visit(axis: Axis)
  redraw()
}

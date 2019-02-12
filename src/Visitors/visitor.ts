import { Axis } from '../Axis'

export interface Visitor {
  visit(axis: Axis)
  // TODO: move ot IDrawable interface
  redraw()
}

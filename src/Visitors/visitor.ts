import { Axes } from '../Axes/axes.js'

export interface Visitor {
  visit(axis: Axes)
  redraw()
}

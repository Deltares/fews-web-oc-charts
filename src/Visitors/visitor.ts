import { Axes } from '../Axes/axes.js'

export interface Visitor {
  visit(axis: Axes): void
  redraw(): void
}

export abstract class BaseVisitor<TAxis extends Axes = Axes> implements Visitor {
  protected axis!: TAxis

  visit(axis: Axes): void {
    this.axis = axis as TAxis
    this.validate()
    this.create(this.axis)
  }

  protected validate(): void {}

  abstract create(axis: TAxis): void

  abstract redraw(): void
}

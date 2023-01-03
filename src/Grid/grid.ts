import d3 from 'd3';
import { CartesianAxes } from '../index.js';

export interface GridOptions {
  axisKey: 'x' | 'y';
  axisIndex: number;
}


export class Grid {
  public options: GridOptions
  public scale: any
  public span: any
  private group: any

  constructor(group, scale: any, span: any, options: GridOptions) {
    this.options = options
    this.scale = scale
    this.span = span
    this.create(group)
  }

  get gridClass(): string {
    return `${this.options.axisKey}-grid-${this.options.axisIndex}`
  }

  protected create(group): void {
    this.group = group.append('g').attr('class', `grid ${this.gridClass}`)
  }

  redraw(): void {
    if (this.options.axisKey === 'x') {
      const grid = d3.axisBottom(this.scale)
      const size = d3.max(this.span.range() as number[]) as number
      grid.ticks(5)
      grid.tickSize(size)
      this.updateTicks(this.group, grid)
    } else if (this.options.axisKey === 'y') {
      const grid = d3.axisRight(this.scale)
      grid.ticks(5)
      // grid.tickValues(this.scale.ticks())
      console.log(grid.scale().range(), grid.scale().domain())
      const size = d3.max(this.span.range() as number[]) as number
      console.log('size', size)
      grid.tickSize(size)
      this.updateTicks(this.group, grid)
    }
  }

  updateTicks(selection, gridAxis: d3.Axis<d3.AxisDomain>) {
    selection
    .call(gridAxis)
    .call(g => g.selectAll(".tick")
      .attr("class", (d) => { return d === 0 ? 'tick zero-crossing' : 'tick' }))
  }
}

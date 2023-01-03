import d3 from 'd3';
import { CartesianAxis } from '../index.js';

export interface GridOptions {
  axisKey: 'x' | 'y';
  axisIndex: number;
}


export class Grid {
  public options: GridOptions
  public axis: CartesianAxis

  constructor(axis: CartesianAxis, options: GridOptions) {
    this.options = options
    this.axis = axis
    this.create()
  }

  get gridClass(): string {
    return `${this.options.axisKey}-grid-${this.options.axisIndex}`
  }

  protected create(): void {
    const g = this.axis.canvas
      g.append('g').attr('class', `grid ${this.gridClass}`)
  }

  redraw(): void {
    if (this.options.axisKey === 'x') {
      const scale = this.axis.xScale[this.options.axisIndex]
      const grid = d3.axisBottom(scale)
      grid.ticks(5)
      grid.tickSize(this.axis.height)
      this.updateTicks(this.axis.canvas.select(`.${this.gridClass}`), grid)
    } else if (this.options.axisKey === 'y') {
      const scale = this.axis.yScale[this.options.axisIndex]
      console.log('scale', scale.domain(), scale.range())
      const grid = d3.axisRight(scale)
      grid.ticks(5)
      grid.tickSize(this.axis.width)
      this.updateTicks(this.axis.canvas.select(`.${this.gridClass}`), grid)
    }
  }

  updateTicks(selection, gridAxis: d3.Axis<d3.AxisDomain>) {
    console.log('updateTicks', selection)
    selection
    .call(gridAxis)
    .call(g => g.selectAll(".tick")
      .attr("class", (d) => { return d === 0 ? 'tick zero-crossing' : 'tick' }))
  }
}

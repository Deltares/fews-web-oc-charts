import * as d3 from 'd3'

export interface GridOptions {
  axisKey: 'x' | 'y'
  axisIndex: number
}

export class Grid {
  public options: GridOptions
  public axis: any
  public span: any
  private group: any

  constructor(group, axis: any, span: any, options: GridOptions) {
    this.options = options
    this.axis = axis
    this.span = span
    this.create(group)
  }

  protected create(group): void {
    this.group = group.append('g').attr('class', `grid ${this.class}`)
  }

  get class(): string {
    return `${this.options.axisKey}-grid-${this.options.axisIndex}`
  }

  redraw(): void {
    const scale = this.axis.scale()
    if (this.options.axisKey === 'x') {
      const grid = d3.axisBottom(scale)
      const size = d3.max(this.span.range() as number[])
      grid.tickSize(size)
      grid.ticks(5)
      if (this.axis.tickValues() !== null) {
        grid.tickValues(this.axis.tickValues())
      }
      this.updateTicks(this.group, grid)
    } else if (this.options.axisKey === 'y') {
      const grid = d3.axisRight(scale)
      const size = d3.max(this.span.range() as number[])
      grid.tickSize(size)
      grid.ticks(5)
      if (this.axis.tickValues() !== null) {
        grid.tickValues(this.axis.tickValues())
      }
      this.updateTicks(this.group, grid)
    }
  }

  updateTicks(selection, gridAxis: d3.Axis<d3.AxisDomain>) {
    selection.call(gridAxis).call((g) =>
      g.selectAll('.tick').attr('class', (d) => {
        return d === 0 ? 'tick zero-crossing' : 'tick'
      }),
    )
  }
}

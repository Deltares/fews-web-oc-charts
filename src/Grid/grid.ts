import * as d3 from 'd3'

export interface GridOptions {
  axisKey: 'x' | 'y'
  axisIndex: number
}

export class Grid {
  private group!: d3.Selection<SVGGElement, unknown, null, unknown>

  constructor(
    private readonly parentGroup: d3.Selection<SVGGElement, unknown, null, unknown>,
    public readonly axis: d3.Axis<d3.AxisDomain>,
    public readonly span: d3.ScaleContinuousNumeric<number, number, never>,
    public readonly options: GridOptions,
  ) {
    this.create()
  }

  protected create(): void {
    this.group = this.parentGroup.append('g').attr('class', `grid ${this.class}`)
  }

  get class(): string {
    return `${this.options.axisKey}-grid-${this.options.axisIndex}`
  }

  redraw(): void {
    const scale = this.axis.scale()
    if (this.options.axisKey === 'x') {
      const grid = d3.axisBottom(scale)
      const size = d3.max(this.span.range()) ?? 0
      const tickValues = this.axis.tickValues()
      grid.tickSize(size)
      grid.ticks(5)
      if (tickValues !== null) {
        grid.tickValues(tickValues)
      }
      this.updateTicks(this.group, grid)
    } else if (this.options.axisKey === 'y') {
      const grid = d3.axisRight(scale)
      const size = d3.max(this.span.range()) ?? 0
      const tickValues = this.axis.tickValues()
      grid.tickSize(size)
      grid.ticks(5)
      if (tickValues !== null) {
        grid.tickValues(tickValues)
      }
      this.updateTicks(this.group, grid)
    }
  }

  updateTicks(
    selection: d3.Selection<SVGGElement, unknown, null, unknown>,
    gridAxis: d3.Axis<d3.AxisDomain>,
  ) {
    selection.call(gridAxis).call((g: d3.Selection<SVGGElement, unknown, null, unknown>) =>
      g.selectAll('.tick').attr('class', (d: unknown) => {
        const tickValue = d as number | string | Date | null
        return typeof tickValue === 'number' && tickValue === 0 ? 'tick zero-crossing' : 'tick'
      }),
    )
  }
}

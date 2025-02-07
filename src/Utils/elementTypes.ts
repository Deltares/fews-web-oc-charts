import * as d3 from 'd3'

export type D3Selection<
  ElementType extends d3.BaseType,
  ParentType extends d3.BaseType | null = null,
> = d3.Selection<ElementType, unknown, ParentType, unknown>

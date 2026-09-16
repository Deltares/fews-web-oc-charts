import * as d3 from 'd3'
import { CartesianAxes, PolarAxes } from '../index.js'
import type { CartesianAxesIndex } from '../Axes/cartesianAxes.js'
import type { AxisIndex } from '../Axes/axes.js'
import { Chart } from './chart.js'
import { TooltipAnchor } from '../Tooltip/tooltip.js'
import type { DataPoint } from '../Data/types.js'

export class ChartHistogram extends Chart {
  plotterCartesian(axis: CartesianAxes, axisIndex: CartesianAxesIndex) {
    const xKey = this.dataKeys.x
    const yKey = this.dataKeys.y
    const colorKey = this.dataKeys.color
    const data = this.data
    const xScale = axis.xScales[axisIndex.x.axisIndex]
    const yScale = axis.yScales[axisIndex.y.axisIndex]

    const x1 = d3.scaleBand<string>().domain(
      data.flatMap((d) => {
        const value = d[xKey]
        return typeof value === 'string' ? [value] : []
      }),
    )
    x1.range(xScale.range())

    this.setPadding(x1, this.options.x)

    const colorScale = this.getAutoScaleColorScale(colorKey)

    const colorMap = this.colorMap
    this.group = this.selectGroup(axis, 'chart-range')
    const t = d3.transition().duration(this.options.transitionTime).ease(d3.easeLinear)

    const elements = this.group.selectAll<SVGRectElement, DataPoint>('rect').data(this.data)

    // remove
    elements.exit().remove()

    const applyRectShape = <
      T extends { attr: (name: string, value: (d: DataPoint) => number) => T },
    >(
      selection: T,
    ): T =>
      selection
        .attr('y', (d) => (d[yKey] === null ? yScale(0) : Math.min(yScale(d[yKey]), yScale(0))))
        .attr('height', (d) => (d[yKey] === null ? 0 : Math.abs(yScale(0) - yScale(d[yKey]))))

    const getFill = (d: DataPoint) => {
      const value = d[colorKey]
      return typeof value === 'number' ? colorMap(colorScale(value)) : 'none'
    }

    // enter + update
    const update = applyRectShape(elements.enter().append('rect'))
      .merge(elements)
      .attr('x', (d) => {
        return x1(d[xKey] as unknown as string) ?? 0
      })
      .attr('width', x1.bandwidth())

    this.addTooltipHandlers(update, axis, {
      expectedAnchor: TooltipAnchor.Top,
      positionFn: (_e: Event, d: DataPoint) => {
        const xPosition = x1(d[xKey] as unknown as string) ?? 0
        return [
          axis.margin.left + xPosition + x1.bandwidth() / 2,
          axis.margin.top + Math.min(yScale(d[yKey]), yScale(0)),
        ]
      },
    })
    update.style('fill', getFill)

    applyRectShape(elements.transition(t)).style('fill', getFill)
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  plotterPolar(axis: PolarAxes, dataKeys: AxisIndex) {
    throw new Error('plotterPolar is not implemented for ChartHistogram')
  }

  drawLegendSymbol(legendId?: string, asSvgElement?: boolean) {
    const props = ['fill']
    const source = this.group.select('rect').node() as Element
    const { svg, group } = this.createLegendSymbolCanvas()
    const element = group.append('g')
    element.append('rect').attr('x', 0).attr('y', -8).attr('width', 5).attr('height', 18)
    this.applyStyle(source, element, props)
    element.append('rect').attr('x', 5).attr('y', -6).attr('width', 5).attr('height', 16)
    this.applyStyle(source, element, props)
    element.append('rect').attr('x', 10).attr('y', -5).attr('width', 5).attr('height', 15)
    this.applyStyle(source, element, props)
    return this.finalizeLegendSymbol(svg, element, asSvgElement)
  }
}

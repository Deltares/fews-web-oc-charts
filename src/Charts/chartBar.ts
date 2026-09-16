import * as d3 from 'd3'
import { AxisIndex } from '../Axes/axes.js'
import { CartesianAxes, CartesianAxesIndex, PolarAxes } from '../index.js'
import { TooltipAnchor } from '../Tooltip/tooltip.js'
import { Chart, AUTO_SCALE } from './chart.js'
import type { DataPoint, DataPointXY } from '../Data/types.js'
import type { SvgPropertiesHyphen } from 'csstype'

export class ChartBar extends Chart {
  static readonly GROUP_CLASS: 'chart-bar'
  private _xRect!: (data: DataPoint, index: number) => number
  private _widthRect!: (data: DataPoint, index: number) => number

  plotterCartesian(axis: CartesianAxes, axisIndex: CartesianAxesIndex) {
    const xKey = this.dataKeys.x
    const yKey = this.dataKeys.y
    const x1Key = this.dataKeys.x1
    const colorKey = this.dataKeys.color
    const xScale = axis.xScales[axisIndex.x.axisIndex]
    const yScale = axis.yScales[axisIndex.y.axisIndex]

    let mappedData = this.mapDataCartesian(xScale.domain())

    const x0 = xScale.copy()

    this.setPadding(x0, this.options.x)

    this.highlight = this.selectHighlight(axis, 'rect')
    this.highlight.select('rect').style('opacity', 0).style('stroke-width', '1px')

    const colorScale = d3.scaleLinear().domain([0, 1])
    if (this.options.colorScale === AUTO_SCALE) {
      const colorValues = this.data
        .map((d) => d[colorKey])
        .filter((value): value is number => typeof value === 'number')
      const colorExtent = d3.extent(colorValues)
      if (colorExtent[0] !== undefined && colorExtent[1] !== undefined) {
        colorScale.domain(colorExtent)
      }
    }

    const colorMap = this.getColorMap(colorScale)
    this.group = this.selectGroup(axis, ChartBar.GROUP_CLASS)

    let xRect = (_d: DataPoint, i: number) => {
      return i === 0 ? 0 : xScale(mappedData[i - 1][xKey])
    }
    let widthRect = (_d: DataPoint, i: number) => {
      return i === 0
        ? xScale(mappedData[i][xKey])
        : xScale(mappedData[i][xKey]) - xScale(mappedData[i - 1][xKey])
    }

    if (x1Key) {
      const filterKeys: string[] = this.data
        .flatMap((item) => {
          const value = item[x1Key]
          return typeof value === 'string' ? [value] : []
        })
        .filter((value, index, values) => values.indexOf(value) === index)
      this.legend = filterKeys
      x0.domain(
        this.data.flatMap((d) => {
          const value = d[xKey]
          return typeof value === 'string' ? [value] : []
        }),
      )
      const x1 = d3.scaleBand().domain(filterKeys).range([0, x0.bandwidth()])
      this.setPadding(x1, this.options.x1)
      xRect = (d: DataPoint) => x0(d[xKey]) + x1(d[x1Key] as unknown as string)
      widthRect = () => x1.bandwidth()
      mappedData = this.data
    }
    this.datum = mappedData
    this._xRect = xRect
    this._widthRect = widthRect

    const bar = this.group
      .selectAll<SVGRectElement, DataPoint>('rect')
      .data(mappedData)
      .join('rect')
      .attr('data-legend-id', (d) => this.legendId(d[x1Key] as unknown as string))
      .attr('x', xRect)
      .attr('y', (d) => {
        return d[yKey] === null ? yScale(0) : Math.min(yScale(d[yKey]), yScale(0))
      })
      .attr('width', widthRect)
      .attr('height', function (d) {
        return d[yKey] === null ? 0 : Math.abs(yScale(0) - yScale(d[yKey]))
      })
      .attr('fill', (d) => {
        const value = d[colorKey]
        return typeof value === 'number' || value instanceof Date ? colorMap(value) : 'none'
      })

    this.addTooltipHandlers(bar, axis, {
      expectedAnchor: TooltipAnchor.Bottom,
      positionFn: (event: Event) => {
        const rect = event.target as SVGRectElement
        return [
          axis.margin.left +
            Number(rect.getAttribute('x') ?? 0) +
            Number(rect.getAttribute('width') ?? 0) / 2,
          axis.margin.top + Number(rect.getAttribute('y') ?? 0),
        ]
      },
    })

    bar.data(mappedData).order().attr('x', xRect)

    if (this.options.text !== undefined) {
      const textSelection = this.group
        .selectAll<SVGTextElement, DataPoint>('text')
        .data(mappedData)
        .join('text')

      textSelection
        .attr('x', (d, i) => xRect(d, i) + widthRect(d, i) / 2)
        .attr('y', (d) => Math.min(yScale(d[yKey]), yScale(0)))
        .attr('dx', this.options.text.dx ?? 0)
        .attr('dy', this.options.text.dy ?? 0)
        .text((d) => {
          return this.options.text?.formatter?.(d) ?? ''
        })

      for (const [key, value] of Object.entries(this.options.text.attributes ?? {})) {
        textSelection.attr(key, value)
      }
    }
  }

  plotterPolar(_axis: PolarAxes, _dataKeys: AxisIndex) {
    throw new Error('plotterPolar is not implemented for ChartBar')
  }

  drawLegendSymbol(legendId?: string, asSvgElement?: boolean) {
    const props = ['fill']
    const source = this.group.select(`[data-legend-id="${legendId}"]`).node() as Element
    const { svg, group } = this.createLegendSymbolCanvas()
    const element = group.append('g')
    element.append('rect').attr('x', 5).attr('y', -5).attr('width', 10).attr('height', 10)
    this.applyStyle(source, element, props)
    return this.finalizeLegendSymbol(svg, element, asSvgElement)
  }

  public onPointerOver() {
    this.showHighlight('rect', 'fill', 'rect')?.style('stroke', 'currentColor')
  }

  public onPointerOut() {
    this.hideHighlight('rect')
  }

  public onPointerMove(
    value: number | Date,
    key: 'x' | 'y',
    _xScale: d3.ScaleContinuousNumeric<number, number>,
    yScale: d3.ScaleContinuousNumeric<number, number>,
  ): void | { point: DataPointXY; style: SvgPropertiesHyphen } {
    const index = this.findIndex(value, key)
    if (index === undefined) {
      this.highlight.select('rect').style('opacity', 0)
      return
    }
    const point = this.datum[index]
    if (point === undefined) return

    this.highlight
      .select('rect')
      .style('opacity', 1)
      .attr('y', Math.min(yScale(point.y as number), yScale(0)))
      .attr('height', Math.abs(yScale(0) - yScale(point.y as number)))
      .attr('x', (d) => this._xRect(d as DataPoint, index))
      .attr('width', (d) => this._widthRect(d as DataPoint, index))

    const element = this.group.select('rect')
    if (element.node() === null) {
      return { point: point as DataPointXY, style: {} }
    } else {
      const color = window.getComputedStyle(element.node() as Element).getPropertyValue('fill')
      return { point: point as DataPointXY, style: { color } }
    }
  }
}

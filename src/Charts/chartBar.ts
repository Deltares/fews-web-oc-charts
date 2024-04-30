import * as d3 from 'd3'
import { AxisIndex } from '../Axes/axes.js'
import { CartesianAxes, PolarAxes } from '../index.js'
import { TooltipAnchor, TooltipPosition } from '../Tooltip/tooltip.js'
import { Chart, AUTO_SCALE } from './chart.js'

export class ChartBar extends Chart {
  static readonly GROUP_CLASS: 'chart-bar'
  private _xRect
  private _widthRect

  plotterCartesian(axis: CartesianAxes, axisIndex: AxisIndex) {
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
      colorScale.domain(
        d3.extent(this.data, function (d: any): number {
          return d[colorKey]
        })
      )
    }

    const colorMap = this.getColorMap(colorScale)
    this.group = this.selectGroup(axis, ChartBar.GROUP_CLASS)

    let xRect = (_d: unknown, i: number) => {
      return i === 0 ? 0 : xScale(mappedData[i - 1][xKey])
    }
    let widthRect = (_d: unknown, i: number) => {
      return i === 0
        ? xScale(mappedData[i][xKey])
        : xScale(mappedData[i][xKey]) - xScale(mappedData[i - 1][xKey])
    }

    if (x1Key) {
      const filterKeys: string[] = Array.from(new Set(this.data.map((item) => item[x1Key])))
      this.legend = filterKeys
      x0.domain(this.data.map((d) => d[xKey]))
      const x1 = d3.scaleBand().domain(filterKeys).range([0, x0.bandwidth()])
      this.setPadding(x1, this.options.x1)
      xRect = (d) => x0(d[xKey]) + x1(d[x1Key])
      widthRect = () => x1.bandwidth()
      mappedData = this.data
    }
    this.datum = mappedData
    this._xRect = xRect
    this._widthRect = widthRect

    const bar = this.group
      .selectAll('rect')
      .data(mappedData)
      .join('rect')
      .attr('data-legend-id', (d) => this.legendId(d[x1Key]))
      .attr('x', xRect)
      .attr('y', (d: any) => {
        return d[yKey] === null ? yScale(0) : Math.min(yScale(d[yKey]), yScale(0))
      })
      .attr('width', widthRect)
      .attr('height', function (d: any) {
        return d[yKey] === null ? 0 : Math.abs(yScale(0) - yScale(d[yKey]))
      })
      .attr('fill', (d) => (d[colorKey] !== null ? colorMap(d[colorKey]) : 'none'))

    if (this.options.tooltip !== undefined) {
      bar
        .on('pointerover', (event: Event, d) => {
          const rect = event.target as SVGRectElement
          axis.tooltip.show()
          if (
            this.options.tooltip.anchor !== undefined &&
            this.options.tooltip.anchor !== TooltipAnchor.Bottom
          ) {
            console.error(
              'Tooltip not implemented for anchor ',
              this.options.tooltip.anchor,
              ', using ',
              TooltipAnchor.Bottom,
              ' instead.'
            )
          }
          axis.tooltip.update(
            this.toolTipFormatterCartesian(d),
            this.options.tooltip.position !== undefined
              ? this.options.tooltip.position
              : TooltipPosition.Top,
            axis.margin.left + +rect.getAttribute('x') + +rect.getAttribute('width') / 2,
            axis.margin.top + +rect.getAttribute('y')
          )
        })
        .on('pointerout', () => {
          axis.tooltip.hide()
        })
    }

    bar.data(mappedData).order().attr('x', xRect)

    if (this.options.text !== undefined) {
      const textSelection = this.group.selectAll('text').data(mappedData).join('text')

      textSelection
        .attr('x', (d, i) => xRect(d, i) + widthRect(d, i) / 2)
        .attr('y', (d) => Math.min(yScale(d[yKey]), yScale(0)))
        .attr('dx', this.options.text.dx)
        .attr('dy', this.options.text.dy)
        .text((d) => {
          return this.options.text.formatter(d)
        })

      for (const [key, value] of Object.entries(this.options.text.attributes)) {
        textSelection.attr(key, value)
      }
    }
  }

  plotterPolar(_axis: PolarAxes, _dataKeys: any) {
    throw new Error('plotterPolar is not implemented for ChartBar')
  }

  drawLegendSymbol(legendId?: string, asSvgElement?: boolean) {
    const props = ['fill']
    const source = this.group.select(`[data-legend-id="${legendId}"]`).node() as Element
    const svg = d3.create('svg').attr('width', 20).attr('height', 20)
    const group = svg.append('g').attr('transform', 'translate(0, 10)')
    const element = group.append('g')
    element.append('rect').attr('x', 5).attr('y', -5).attr('width', 10).attr('height', 10)
    this.applyStyle(source, element, props)
    if (asSvgElement) return element.node()
    return svg.node()
  }

  getColorMap(scale?: any): (_x: number | Date) => string {
    if (this.options.color?.map) {
      return this.options.color?.map
    } else {
      return (value: any) => {
        return d3.scaleSequential(d3.interpolateWarm)(scale(value))
      }
    }
  }

  setPadding(scale: any, options) {
    if (options?.paddingOuter) {
      scale.paddingOuter(options.paddingOuter)
    }
    if (options?.paddingInner) {
      scale.paddingInner(options.paddingInner)
    }
  }

  public onPointerOver() {
    this.highlight
      .select('rect')
      .style('opacity', 1)
      .style('fill', () => {
        const element = this.group.select('rect')
        if (element.node() === null) return
        return window.getComputedStyle(element.node() as Element).getPropertyValue('fill')
      })
      .style('stroke', 'currentColor')
  }

  public onPointerOut() {
    this.highlight.select('rect').style('opacity', 0)
  }

  public onPointerMove(x: number | Date, _xScale, yScale) {
    const index = this.findXIndex(x)
    const point = this.datum[index]
    if (point === undefined) {
      return
    }

    this.highlight
      .select('rect')
      .attr('y', yScale(point.y))
      .attr('height', yScale(0) - yScale(point.y))
      .attr('x', (d) => this._xRect(d, index))
      .attr('width', (d) => this._widthRect(d, index))

    const element = this.group.select('rect')
    if (element.node() === null) {
      return { point, style: {} }
    } else {
      const color = window.getComputedStyle(element.node() as Element).getPropertyValue('fill')
      return { point, style: { color } }
    }
  }
}

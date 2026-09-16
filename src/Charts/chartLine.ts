import * as d3 from 'd3'
import { CartesianAxes, PolarAxes } from '../index.js'
import type { CartesianAxesIndex } from '../Axes/cartesianAxes.js'
import type { AxisIndex } from '../Axes/axes.js'
import { Chart } from './chart.js'
import type { DataPoint, DataPointXY } from '../Data/types.js'
import type { SvgPropertiesHyphen } from 'csstype'

export class ChartLine extends Chart {
  defaultToolTipFormatterCartesian(d: DataPoint): HTMLElement {
    const points = d as unknown as DataPoint[]
    const xKey = this.dataKeys.x
    const yKey = this.dataKeys.y
    const html = document.createElement('div')
    this.appendTooltipSpan(
      html,
      this.options.x.includeInTooltip,
      [points[0][xKey], points[1][xKey]],
      xKey,
      2,
    )
    this.appendTooltipSpan(
      html,
      this.options.y.includeInTooltip,
      [points[0][yKey], points[1][yKey]],
      yKey,
      2,
    )
    return html
  }

  defaultToolTipFormatterPolar(d: DataPoint): HTMLElement {
    const points = d as unknown as DataPoint[]
    const tKey = this.dataKeys.angular
    const rKey = this.dataKeys.radial
    const html = document.createElement('div')
    this.appendTooltipSpan(
      html,
      this.options.angular.includeInTooltip,
      [points[0][tKey], points[1][tKey]],
      tKey,
      0,
    )
    this.appendTooltipSpan(
      html,
      this.options.radial.includeInTooltip,
      [points[0][rKey], points[1][rKey]],
      rKey,
      0,
    )
    return html
  }

  plotterCartesian(axis: CartesianAxes, axisIndex: CartesianAxesIndex) {
    const xKey = this.dataKeys.x
    const yKey = this.dataKeys.y
    const xScale = axis.xScales[axisIndex.x.axisIndex]
    const yScale = axis.yScales[axisIndex.y.axisIndex]

    const mappedData = this.mapDataCartesian(xScale.domain())
    this.datum = mappedData

    this.highlight = this.selectHighlight(axis, 'circle')
    this.highlight.select('circle').attr('r', 3).style('opacity', 0).style('stroke-width', '1px')

    const lineGenerator = d3
      .line<DataPoint>()
      .x(function (d) {
        return xScale(d[xKey])
      })
      .y(function (d) {
        return yScale(d[yKey])
      })
      .defined(function (d) {
        return d[yKey] != null
      })
    const curve = this.curveGenerator
    if (curve !== undefined) {
      lineGenerator.curve(curve)
    }

    this.group = this.selectGroup(axis, 'chart-line')
    if (this.group.select('path').size() === 0) {
      this.group.append('path')
    }
    const update = this.group.select('path').datum(mappedData).join('path').attr('d', lineGenerator)

    this.addTooltipHandlers(update, axis)
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  plotterPolar(axis: PolarAxes, axisIndex: AxisIndex) {
    const rKey = this.dataKeys.radial
    const tKey = this.dataKeys.angular
    const lineGenerator = d3
      .lineRadial<DataPoint>()
      .angle(function (d) {
        return axis.angularScale(d[tKey])
      })
      .radius(function (d) {
        return axis.radialScale(d[rKey])
      })
    this.group = this.selectGroup(axis, 'chart-line')
    if (this.group.select('path').size() === 0) {
      this.group.append('path')
    }
    const line = this.group.select('path')

    const t = d3.transition().duration(this.options.transitionTime).ease(d3.easeLinear)

    const path = (lineGenerator as unknown as (data: DataPoint[]) => string | null)(this.data)
    line.transition(t).attr('d', path)
    line.join('path').datum(this.data)
    this.addTooltipHandlers(line, axis, { isPolar: true })
  }

  drawLegendSymbol(_legendId?: string, asSvgElement?: boolean) {
    const props = ['stroke', 'stroke-width', 'stroke-dasharray']
    const source = this.group.select('path').node() as Element
    const { svg, group } = this.createLegendSymbolCanvas()
    const element = group.append('line').attr('x1', 0).attr('x2', 20).attr('y1', 0).attr('y2', 0)
    this.applyStyle(source, element, props)
    return this.finalizeLegendSymbol(svg, element, asSvgElement)
  }

  public onPointerOver() {
    this.showHighlight('circle', 'fill', 'path', 'stroke', { resetTransform: true })
  }

  public onPointerOut() {
    this.hideHighlight('circle')
  }

  public onPointerMove(
    value: number | Date,
    key: 'x' | 'y',
    xScale: d3.ScaleContinuousNumeric<number, number>,
    yScale: d3.ScaleContinuousNumeric<number, number>,
  ): void | { point: DataPointXY; style: SvgPropertiesHyphen } {
    const index = this.findIndex(value, key, this.options.tooltip?.alignment ?? 'middle')
    const point = index === undefined ? undefined : this.datum[index]
    if (point === undefined) {
      this.highlight.select('circle').style('opacity', 0)
      return
    }
    const element = this.group.select('path')
    const color =
      element.node() === null
        ? null
        : window.getComputedStyle(element.node() as Element).getPropertyValue('stroke')

    this.highlight
      .select('circle')
      .attr('transform', () => {
        return `translate(${xScale(point.x as number)}, ${yScale(point.y as number)})`
      })
      .style('opacity', 1)
      .style('fill', color ?? '')

    if (color === null) {
      return { point: point as DataPointXY, style: {} }
    } else {
      return { point: point as DataPointXY, style: { color } }
    }
  }
}

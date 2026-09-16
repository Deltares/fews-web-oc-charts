import * as d3 from 'd3'
import { defaultsDeep } from 'lodash-es'
import { CartesianAxes, CartesianAxesIndex, PolarAxes } from '../index.js'
import { TooltipAnchor, TooltipPosition } from '../Tooltip/tooltip.js'
import type { AxisIndex } from '../Axes/axes.js'
import { Chart, SymbolOptions } from './chart.js'
import type { ChartOptions } from './chart.js'
import type { DataPoint } from '../Data/types.js'
import type { DataPointXY } from '../Data/types.js'
import type { SvgPropertiesHyphen } from 'csstype'

const DefaultSymbolOptions: SymbolOptions = {
  id: 0,
  size: 10,
  skip: 1,
}
export class ChartMarker extends Chart {
  protected symbolOptions!: Required<SymbolOptions>

  constructor(data: DataPoint[], options: ChartOptions) {
    super(data, options)
    this.options = defaultsDeep(this.options, this.options, { symbol: DefaultSymbolOptions })
    this.symbolOptions = {
      ...DefaultSymbolOptions,
      ...this.options.symbol,
    } as Required<SymbolOptions>
  }

  protected addTooltipHandlers(
    elements: d3.Selection<any, any, any, any>,
    axis: CartesianAxes | PolarAxes,
  ) {
    const tooltip = this.options.tooltip
    if (tooltip === undefined) return

    elements
      .on('pointerover', (e: any, d) => {
        if (tooltip.anchor !== undefined && tooltip.anchor !== TooltipAnchor.Pointer) {
          console.error(
            'Tooltip not implemented for anchor ',
            tooltip.anchor,
            ', using ',
            TooltipAnchor.Pointer,
            ' instead.',
          )
        }
        axis.tooltip.show()
        const pointer = d3.pointer(e, axis.container)
        const content = this.toolTipFormatterPolar(d)
        if (content !== undefined) {
          axis.tooltip.update(
            content,
            tooltip.position ?? TooltipPosition.Top,
            pointer[0],
            pointer[1],
          )
        }
      })
      .on('pointerout', () => {
        axis.tooltip.hide()
      })
  }

  plotterCartesian(axis: CartesianAxes, axisIndex: CartesianAxesIndex) {
    const xKey = this.dataKeys.x
    const yKey = this.dataKeys.y
    const xScale = axis.xScales[axisIndex.x.axisIndex]
    const yScale = axis.yScales[axisIndex.y.axisIndex]

    const { skip, size, id } = this.symbolOptions
    const mappedData = this.mapDataCartesian(xScale.domain()).filter((d, i) => {
      return i % skip === 0 && d[yKey] !== null
    })
    this.datum = mappedData

    this.highlight = this.selectHighlight(axis, 'circle')
    this.highlight.select('circle').attr('r', 3).style('opacity', 0).style('stroke-width', '1px')

    const lineGenerator = d3
      .line()
      .x(function (d: any) {
        return xScale(d[xKey])
      })
      .y(function (d: any) {
        return yScale(d[yKey])
      })
      .defined(function (d: any) {
        return d[yKey] != null
      })
    const curve = this.curveGenerator
    if (curve !== undefined) {
      lineGenerator.curve(curve)
    }

    this.group = this.selectGroup(axis, 'chart-marker')
    if (this.group.select('path').size() === 0) {
      this.group.append('path')
    }

    const markerId = `marker-${id}-${size}-${axis.axesId}`
    const markerSymbol = axis.defs.select(`#${markerId}`)
    if (markerSymbol.empty()) {
      axis.defs
        .append('marker')
        .attr('id', markerId)
        .attr('fill', 'context-fill')
        .attr('stroke', 'context-stroke')
        .attr('markerWidth', size)
        .attr('markerHeight', size)
        .attr('refX', size / 2)
        .attr('refY', size / 2)
        .append('path')
        .attr('d', d3.symbol(d3.symbolsFill[id], size))
        .attr('transform', `translate(${size / 2}, ${size / 2})`)
    }

    const update = this.group
      .select('path')
      .datum(mappedData)
      .join('path')
      .attr('d', (lineGenerator as unknown as (data: DataPoint[]) => string | null)(mappedData))
      .attr('fill-opacity', 0)
      .attr('stroke-opacity', 0)
      .attr('marker-start', `url(#${markerId})`)
      .attr('marker-mid', `url(#${markerId})`)
      .attr('marker-end', `url(#${markerId})`)

    this.addTooltipHandlers(update, axis)
  }

  plotterPolar(axis: PolarAxes, _: AxisIndex) {
    const rKey = this.dataKeys.radial
    const tKey = this.dataKeys.angular
    const lineGenerator = d3
      .lineRadial()
      .angle(function (d: any) {
        return axis.angularScale(d[tKey])
      })
      .radius(function (d: any) {
        return axis.radialScale(d[rKey])
      })
    this.group = this.selectGroup(axis, 'chart-marker')
    if (this.group.select('path').size() === 0) {
      this.group.append('path')
    }

    const { size, id } = this.symbolOptions
    const markerId = `marker-${id}-${size}-${axis.axesId}`
    const markerSymbol = axis.defs.select(`#${markerId}`)
    if (markerSymbol.empty()) {
      axis.defs
        .append('marker')
        .attr('id', markerId)
        .attr('fill', 'context-fill')
        .attr('stroke', 'context-stroke')
        .attr('markerWidth', size)
        .attr('markerHeight', size)
        .attr('refX', size / 2)
        .attr('refY', size / 2)
        .append('path')
        .attr('d', d3.symbol(d3.symbolsFill[id], size))
        .attr('transform', `translate(${size / 2}, ${size / 2})`)
    }

    const line = this.group.select('path')
    const t = d3.transition().duration(this.options.transitionTime).ease(d3.easeLinear)

    const path = (lineGenerator as unknown as (data: DataPoint[]) => string | null)(this.data)
    line.transition(t).attr('d', path)
    line
      .join('path')
      .datum(this.data)
      .attr('fill-opacity', 0)
      .attr('stroke-opacity', 0)
      .attr('marker-start', `url(#${markerId})`)
      .attr('marker-mid', `url(#${markerId})`)
      .attr('marker-end', `url(#${markerId})`)

    this.addTooltipHandlers(line, axis)
  }

  drawLegendSymbol(_legendId?: string, asSvgElement?: boolean) {
    const props = ['fill', 'stroke']
    const source = this.group.select('path').node() as Element
    const { svg, group: outerGroup } = this.createLegendSymbolCanvas()
    // Make sure the marker is aligned horizontally even when returning the
    // "bare" SVG element.
    const innerGroup = outerGroup.append('g').attr('transform', 'translate(10, 0)')
    innerGroup
      .append('path')
      .attr('d', d3.symbol(d3.symbolsFill[this.symbolOptions.id], this.symbolOptions.size))
    this.applyStyle(source, innerGroup, props)
    return this.finalizeLegendSymbol(svg, innerGroup, asSvgElement)
  }

  public onPointerOver() {
    this.highlight
      .select('circle')
      .style('opacity', 1)
      .style('fill', () => {
        const element = this.group.select('path')
        if (element.node() === null) return ''
        return window.getComputedStyle(element.node() as Element).getPropertyValue('stroke')
      })
      .attr('transform', null)
  }

  public onPointerOut() {
    this.highlight.select('circle').style('opacity', 0)
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
      this.highlight.select('rect').style('opacity', 0)
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

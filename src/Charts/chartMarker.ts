import * as d3 from 'd3'
import { defaultsDeep } from 'lodash-es'
import { CartesianAxes, CartesianAxesIndex, PolarAxes } from '../index.js'
import { TooltipAnchor, TooltipPosition } from '../Tooltip/tooltip.js'
import { Chart, SymbolOptions } from './chart.js'

const DefaultSymbolOptions: SymbolOptions = {
  id: 0,
  size: 10,
  skip: 1,
}
export class ChartMarker extends Chart {
  constructor(data: any, options: any) {
    super(data, options)
    this.options = defaultsDeep(this.options, this.options, { symbol: DefaultSymbolOptions })
  }

  plotterCartesian(axis: CartesianAxes, axisIndex: CartesianAxesIndex) {
    const xKey = this.dataKeys.x
    const yKey = this.dataKeys.y
    const xScale = axis.xScales[axisIndex.x.axisIndex]
    const yScale = axis.yScales[axisIndex.y.axisIndex]

    const skip = this.options.symbol.skip
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

    const size = this.options.symbol.size
    const symbolId = this.options.symbol.id
    const markerId = `marker-${symbolId}-${size}`
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
        .attr('d', d3.symbol(d3.symbolsFill[symbolId], size))
        .attr('transform', `translate(${size / 2}, ${size / 2})`)
    }

    const update = this.group
      .select('path')
      .datum(mappedData)
      .join('path')
      .attr('d', lineGenerator)
      .attr('fill-opacity', 0)
      .attr('stroke-opacity', 0)
      .attr('marker-start', `url(#${markerId})`)
      .attr('marker-mid', `url(#${markerId})`)
      .attr('marker-end', `url(#${markerId})`)

    if (this.options.tooltip !== undefined) {
      update
        .on('pointerover', (e: any, d) => {
          if (
            this.options.tooltip.anchor !== undefined &&
            this.options.tooltip.anchor !== TooltipAnchor.Pointer
          ) {
            console.error(
              'Tooltip not implemented for anchor ',
              this.options.tooltip.anchor,
              ', using ',
              TooltipAnchor.Pointer,
              ' instead.',
            )
          }
          axis.tooltip.show()
          const pointer = d3.pointer(e, axis.container)
          axis.tooltip.update(
            this.toolTipFormatterPolar(d),
            this.options.tooltip.position !== undefined
              ? this.options.tooltip.position
              : TooltipPosition.Top,
            pointer[0],
            pointer[1],
          )
        })
        .on('pointerout', () => {
          axis.tooltip.hide()
        })
    }
  }

  plotterPolar(axis: PolarAxes, _: unknown) {
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

    const size = this.options.symbol.size
    const symbolId = this.options.symbol.id
    const markerId = `marker-${symbolId}-${size}`
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
        .attr('d', d3.symbol(d3.symbols[symbolId], size))
        .attr('transform', `translate(${size / 2}, ${size / 2})`)
    }

    const line = this.group.select('path')
    const t = d3.transition().duration(this.options.transitionTime).ease(d3.easeLinear)

    line.transition(t).attr('d', lineGenerator(this.data))
    line
      .join('path')
      .datum(this.data)
      .attr('fill-opacity', 0)
      .attr('stroke-opacity', 0)
      .attr('marker-start', `url(#${markerId})`)
      .attr('marker-mid', `url(#${markerId})`)
      .attr('marker-end', `url(#${markerId})`)

    if (this.options.tooltip !== undefined) {
      line
        .on('pointerover', (e: any, d) => {
          if (
            this.options.tooltip.anchor !== undefined &&
            this.options.tooltip.anchor !== TooltipAnchor.Pointer
          ) {
            console.error(
              'Tooltip not implemented for anchor ',
              this.options.tooltip.anchor,
              ', using ',
              TooltipAnchor.Pointer,
              ' instead.',
            )
          }
          const pointer = d3.pointer(e, axis.container)
          const x = pointer[0]
          const y = pointer[1]
          axis.tooltip.show()
          axis.tooltip.update(
            this.toolTipFormatterPolar(d),
            this.options.tooltip.position !== undefined
              ? this.options.tooltip.position
              : TooltipPosition.Top,
            x,
            y,
          )
        })
        .on('pointerout', () => {
          axis.tooltip.hide()
        })
    }
  }

  drawLegendSymbol(_legendId?: string, asSvgElement?: boolean) {
    const props = ['fill', 'stroke']
    const source = this.group.select('path').node() as Element
    const svg = d3.create('svg').append('svg').attr('width', 20).attr('height', 20)
    const outerGroup = svg.append('g').attr('transform', 'translate(0, 10)')
    // Make sure the marker is aligned horizontally even when returning the
    // "bare" SVG element.
    const innerGroup = outerGroup.append('g').attr('transform', 'translate(10, 0)')
    innerGroup
      .append('path')
      .attr('d', d3.symbol(d3.symbols[this.options.symbol.id], this.options.symbol.size))
    this.applyStyle(source, innerGroup, props)
    if (asSvgElement) return innerGroup.node()
    return svg.node()
  }

  public onPointerOver() {
    this.highlight
      .select('circle')
      .style('opacity', 1)
      .style('fill', () => {
        const element = this.group.select('path')
        if (element.node() === null) return
        return window.getComputedStyle(element.node() as Element).getPropertyValue('stroke')
      })
      .attr('transform', null)
  }

  public onPointerOut() {
    this.highlight.select('circle').style('opacity', 0)
  }

  public onPointerMove(value: number | Date, key: 'x' | 'y', xScale, yScale) {
    const index = this.findIndex(value, key, this.options.tooltip?.alignment ?? 'middle')
    const point = this.datum[index]
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
        return `translate(${xScale(point.x)}, ${yScale(point.y)})`
      })
      .style('opacity', 1)
      .style('fill', color)

    if (color === null) {
      return { point, style: {} }
    } else {
      return { point, style: { color } }
    }
  }
}

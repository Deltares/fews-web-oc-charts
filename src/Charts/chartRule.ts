import * as d3 from 'd3'
import type { AxisIndex } from '../Axes/axes.js'
import { Chart } from './chart.js'
import { CartesianAxes } from '../Axes/cartesianAxes.js'
import { PolarAxes } from '../Axes/polarAxes.js'
import { TooltipAnchor, TooltipPosition } from '../Tooltip/tooltip.js'

export class ChartRule extends Chart {
  set extent(extent: any[]) {
    this._extent = extent
  }

  get extent(): any[] {
    if (!this._extent) {
      this._extent = []
      for (const key in this.dataKeys) {
        const path = this.dataKeys[key]
        this._extent[path] = this.dataExtentFor(key, path)
      }
    }
    return this._extent
  }

  dataExtentFor(key, path) {
    if (key === 'y' && Array.isArray(this._data[0])) {
      const min = d3.min(this._data, function (d: any) {
        if (d[path] === null) return undefined
        return d3.min(d[path])
      })
      const max = d3.max(this._data, function (d: any) {
        if (d[path] === null) return undefined
        return d3.max(d[path])
      })
      return [min, max]
    } else {
      return d3.extent(this._data, (d) => d[path])
    }
  }

  plotterCartesian(axis: CartesianAxes, axisIndex: AxisIndex) {
    const xKey = this.dataKeys.x
    const yKey = this.dataKeys.y
    const xScale = axis.xScales[axisIndex.x.axisIndex]
    const yScale = axis.yScales[axisIndex.y.axisIndex]

    const mappedData = this.mapDataCartesian(xScale.domain())

    this.group = this.selectGroup(axis, 'chart-marker').datum(mappedData)
    const elements = this.group.selectAll<SVGLineElement, any>('line').data((d) => d)

    // exit selection
    elements.exit().remove()

    // enter + update selection
    elements
      .enter()
      .append('line')
      .merge(elements)
      .attr('x1', (d) => xScale(d[xKey]))
      .attr('x2', (d) => xScale(d[xKey]))
      .attr('y1', (d) => yScale(d[yKey][0]))
      .attr('y2', (d) => yScale(d[yKey][1]))

    if (this.options.tooltip !== undefined) {
      elements
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
              ' instead.'
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
            pointer[1]
          )
        })
        .on('pointerout', () => {
          axis.tooltip.hide()
        })
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  plotterPolar(axis: PolarAxes, dataKeys: any) {
    console.error('plotterPolar is not implemented for ChartRule')
  }

  drawLegendSymbol(legendId?: string, asSvgElement?: boolean) {
    const props = ['stroke', 'stroke-width']
    const source = this.group.select('line').node() as Element
    const svg = d3.create('svg').attr('width', 20).attr('height', 20)
    const group = svg.append('g').attr('transform', 'translate(0, 10)')
    const element = group
      .append('line')
      .attr('x1', 10)
      .attr('x2', 10)
      .attr('y1', -8)
      .attr('y2', 8)
    this.applyStyle(source, element, props)
    if (asSvgElement) return element.node()
    return svg.node()
  }
}

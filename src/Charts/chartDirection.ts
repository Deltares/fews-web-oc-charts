import * as d3 from 'd3'
import { CartesianAxis, PolarAxis } from '../Axis'
import { TooltipPosition } from '../Tooltip'
import { Chart, SymbolOptions } from './chart'

import { symbolArrow } from '../Symbols'
import defaultsDeep from 'lodash/defaultsDeep'

function mean(x: number[] | number) {
  if (x instanceof Array) {
    return d3.mean(x)
  }
  return x
}

const DefaultSymbolOptions: SymbolOptions = {
  id: 0,
  size: 10,
  skip: 0
}
export class ChartDirection extends Chart {
  private previousData: any[] = []

  constructor(data: any, options: any) {
    super(data, options)
    this.options = defaultsDeep(this.options, this.options, { symbol: DefaultSymbolOptions})
  }

  plotterCartesian(axis: CartesianAxis, axisIndex: any) {
    const xKey = this.dataKeys.x
    const yKey = this.dataKeys.value
    const dKey = this.dataKeys.y
    const xScale = axis.xScale[axisIndex.x.axisIndex]
    const yScale = axis.yScale[axisIndex.y.axisIndex]

    const mappedData = this.mapDataCartesian(xScale.domain())
    let skip = 1
    if (mappedData.length > 2 && this.options.symbol.skip === 0) {
      skip = Math.ceil(1 / (xScale(mappedData[1][xKey]) - xScale(mappedData[0][xKey])) * Math.sqrt(this.options.symbol.size) * 2)
    }

    this.group = this.selectGroup(axis, 'chart-marker')
      .datum(mappedData)

    const elements = this.group.selectAll<SVGGElement, any>('g')
      .data(
        (d) => d.filter(
          (e, i) =>
            ((i + 1) % skip === 0) ? e : undefined
          )
        )

    // exit selection
    elements.exit().remove()

    // enter + update selection
    elements
      .enter()
      .append('g')
        .attr('transform', (d: any, i: number) => {
          return 'translate(' + xScale(d[xKey]) + ',' + yScale(d[yKey]) + ')'
        })
        .append('path')
        .on('pointerover', (e: any, d) => {
          axis.tooltip.show()
          const pointer = d3.pointer(e, axis.container)
          axis.tooltip.update(this.toolTipFormatterPolar(d), TooltipPosition.Top, pointer[0], pointer[1])
        })
        .on('pointerout', () => {
          axis.tooltip.hide()
        })
        .attr('d', d3.symbol().type(symbolArrow).size(this.options.symbol.size))
        .attr('transform', function (d: any, i: number) {
          return `rotate(${d[dKey] - 180})`
        })

    elements
      .attr('transform', (d: any, i: number) => {
        return 'translate(' + xScale(d[xKey]) + ',' + yScale(d[yKey]) + ')'
      })
      .select('path')
        .attr('d', d3.symbol().type(symbolArrow).size(this.options.symbol.size))
        .attr('transform', (d: any, i: number) => {
          return `rotate(${d[dKey] - 180})`
        })
  }

  plotterPolar(axis: PolarAxis, dataKeys: any) {
    this.group = this.selectGroup(axis, 'chart-marker')
    const rKey = this.dataKeys.radial
    const tKey = this.dataKeys.angular

    const elements = this.group.selectAll<SVGPathElement, any>('path').data(this.data)

    function arcTranslation(p) {
      // We only use 'd', but list d,i,a as params just to show can have them as params.
      // Code only really uses d and t.
      return function(d, i, a) {
        const old = p[i]
        if (mean(old[tKey]) - mean(d[tKey]) > 180) {
          old[tKey] = old[tKey] - 360
        } else if (mean(old[tKey]) - mean(d[tKey]) < -180) {
          old[tKey] = old[tKey] + 360
        }
        const tInterpolate = d3.interpolate(old[tKey], d[tKey])
        const rInterpolate = d3.interpolate(old[rKey], d[rKey])
        return function(x) {
          const theta = axis.angularScale(tInterpolate(x))
          const radius = axis.radialScale(rInterpolate(x))
          return 'translate(' + -radius * Math.sin(-theta) + ',' + -radius * Math.cos(-theta) + ')'
        }
      }
    }

    // exit selection
    elements.exit().remove()

    // enter + update selection
    elements
      .enter()
      .append('path')
      .attr('transform', (d: any, i: number) => {
        const r: number = axis.radialScale(d[rKey])
        const t: number = axis.angularScale(d[tKey])
        return 'translate(' + -r * Math.sin(-t) + ',' + -r * Math.cos(-t) + ')'
      })
      .attr('d', d3.symbol().type(symbolArrow).size(this.options.symbol.size))
      .on('pointerover', (e: any, d) => {
        const pointer = d3.pointer(e, axis.container)
        const x = pointer[0]
        const y = pointer[1]
        axis.tooltip.show()
        axis.tooltip.update(this.toolTipFormatterPolar(d), TooltipPosition.Top, x, y)
      })
      .on('pointerout', () => {
        axis.tooltip.hide()
      })
      .merge(elements)

    const t = d3
      .transition()
      .duration(this.options.transitionTime)
      .ease(d3.easeLinear)

    elements.transition(t).attrTween('transform', arcTranslation(this.previousData))

    this.previousData = this.data
  }

  drawLegendSymbol(legendId?: string, asSvgElement?: boolean) {
    const chartElement = this.group
      .select('path')
      .node() as Element
    const style = window.getComputedStyle(chartElement)
    const svg = d3.create('svg')
      .append('svg')
      .attr('width',20)
      .attr('height',20)
    const group = svg
      .append('g')
      .attr('transform', 'translate(10, 0)')
    group.append('path')
      .attr('d', d3.symbol().type(symbolArrow).size(this.options.symbol.size))
      .style('stroke', style.getPropertyValue('stroke'))
      .style('fill', style.getPropertyValue('fill'))
    if (asSvgElement) return group.node()
    return svg.node()
  }

}

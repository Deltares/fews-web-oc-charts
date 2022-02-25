import * as d3 from 'd3'
import defaultsDeep from 'lodash/defaultsDeep'
import { CartesianAxis, PolarAxis } from '../Axis'
import { TooltipPosition } from '../Tooltip'
import { Chart, SymbolOptions } from './chart'

function mean(x: number[] | number) {
  if (x instanceof Array) {
    return d3.mean(x)
  }
  return x
}

const DefaultSymbolOptions: SymbolOptions = {
  id: 0,
  size: 10,
  skip: 1,
}
export class ChartMarker extends Chart {
  private previousData: any[] = []

  constructor(data: any, options: any) {
    super(data, options)
    this.options = defaultsDeep(this.options, this.options, { symbol: DefaultSymbolOptions })
  }

  plotterCartesian(axis: CartesianAxis, axisIndex: any) {
    const xKey = this.dataKeys.x
    const yKey = this.dataKeys.y
    const xScale = axis.xScale[axisIndex.x.axisIndex]
    const yScale = axis.yScale[axisIndex.y.axisIndex]

    const skip = this.options.symbol.skip
    const mappedData = this.mapDataCartesian(xScale.domain())
      .filter((d, i) => { return i % skip === 0 && d[yKey] !== null })

    this.group = this.selectGroup(axis, 'chart-marker')
      .datum(mappedData)
    const elements = this.group.selectAll<SVGPathElement, any>('path').data(d => d)

    // exit selection
    elements.exit().remove()

    // enter + update selection
    elements
      .enter()
      .append('path')
      .on('pointerover', (e: any, d) => {
        axis.tooltip.show()
        const pointer = d3.pointer(e, axis.container)
        axis.tooltip.update(this.toolTipFormatterPolar(d), TooltipPosition.Top, pointer[0], pointer[1])
      })
      .on('pointerout', () => {
        axis.tooltip.hide()
      })
      .attr('d', d3.symbol(d3.symbols[this.options.symbol.id], this.options.symbol.size))
      .merge(elements)
      .attr('transform', (d: any, i: number) => {
        return 'translate(' + xScale(d[xKey]) + ',' + yScale(d[yKey]) + ')'
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
      .attr('d', d3.symbol(d3.symbols[this.options.symbol.id], this.options.symbol.size))
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

    const transition = d3
      .transition()
      .duration(this.options.transitionTime)
      .ease(d3.easeLinear)

    elements.transition(transition).attrTween('transform', arcTranslation(this.previousData))

    this.previousData = this.data
  }

  drawLegendSymbol(legendId?: string, asSvgElement?: boolean) {
    const props = ['fill', 'stroke']
    const source = this.group
      .select('path')
      .node() as Element
    const svg = d3.create('svg')
      .append('svg')
      .attr('width',20)
      .attr('height',20)
    const outerGroup = svg
      .append('g')
      .attr('transform', 'translate(0, 10)')
    // Make sure the marker is aligned horizontally even when returning the
    // "bare" SVG element.
    const innerGroup = outerGroup
      .append('g')
      .attr('transform', 'translate(10, 0)')
    innerGroup.append('path')
      .attr('d', d3.symbol(d3.symbols[this.options.symbol.id], this.options.symbol.size))
    this.applyStyle(source, innerGroup, props)
    if (asSvgElement) return innerGroup.node()
    return svg.node()
  }

}

import * as d3 from 'd3'
import { CartesianAxis, PolarAxis } from '../Axis'
import { Chart, SymbolOptions } from './chart'

function mean(x: number[] | number) {
  if (x instanceof Array) {
    return d3.mean(x)
  }
  return x
}

const DefaultSymbolOptions: SymbolOptions = {
  id: 1,
  size: 10
}
export class ChartMarker extends Chart {
  private previousData: any[] = []
  symbol!: SymbolOptions

  constructor(data: any, options: any) {
    super(data, options)
    this.symbol = { ...this.options.symbol, ...DefaultSymbolOptions}
  }

  plotterCartesian(axis: CartesianAxis, axisIndex: any) {
    let xKey = this.dataKeys.x
    let yKey = this.dataKeys.y
    const xScale = axis.xScale[axisIndex.x.axisIndex]
    const yScale = axis.yScale[axisIndex.y.axisIndex]

    let mappedData = this.mapDataCartesian(xScale.domain())

    this.group = this.selectGroup(axis, 'chart-marker')
      .datum(mappedData)
    let elements = this.group.selectAll('path').data(d => d)

    // exit selection
    elements.exit().remove()

    let that = this
    // enter + update selection
    elements
      .enter()
      .append('path')
      .on('pointerover', function(_e: any, d) {
        const v = { x: d[xKey], y: d[yKey] }
        axis.tooltip.show()
        axis.tooltip.update(that.toolTipFormatterCartesian(v))
      })
      .on('pointerout', function() {
        axis.tooltip.hide()
      })
      .attr('d', d3.symbol(d3.symbols[this.symbol.id], this.symbol.size))
      .merge(elements)
      .attr('transform', function (d: any, i: number) {
        return 'translate(' + xScale(d[xKey]) + ',' + yScale(d[yKey]) + ')'
      })
  }

  plotterPolar(axis: PolarAxis, dataKeys: any) {
    this.group = this.selectGroup(axis, 'chart-marker')
    let rKey = this.dataKeys.radial
    let tKey = this.dataKeys.angular

    let elements = this.group.selectAll('path').data(this.data)

    function arcTranslation(p) {
      // We only use 'd', but list d,i,a as params just to show can have them as params.
      // Code only really uses d and t.
      return function(d, i, a) {
        let old = p[i]
        if (mean(old[tKey]) - mean(d[tKey]) > 180) {
          old[tKey] = old[tKey] - 360
        } else if (mean(old[tKey]) - mean(d[tKey]) < -180) {
          old[tKey] = old[tKey] + 360
        }
        let tInterpolate = d3.interpolate(old[tKey], d[tKey])
        let rInterpolate = d3.interpolate(old[rKey], d[rKey])
        return function(t) {
          const theta = axis.angularScale(tInterpolate(t))
          const radius = axis.radialScale(rInterpolate(t))
          return 'translate(' + -radius * Math.sin(-theta) + ',' + -radius * Math.cos(-theta) + ')'
        }
      }
    }

    // exit selection
    elements.exit().remove()

    let that = this
    // enter + update selection
    elements
      .enter()
      .append('path')
      .attr('transform', function(d: any, i: number) {
        const r: number = axis.radialScale(d[rKey])
        const t: number = axis.angularScale(d[tKey])
        return 'translate(' + -r * Math.sin(-t) + ',' + -r * Math.cos(-t) + ')'
      })
      .attr('d', d3.symbol(d3.symbols[this.symbol.id], this.symbol.size))
      .on('pointerover', function(e: any, d) {
        const v = { r: d[rKey], t: d[tKey] }
        axis.tooltip.update(that.toolTipFormatterPolar(v))
      })
      .on('pointerout', function() {
        axis.tooltip.hide()
      })
      .merge(elements)

    let t = d3
      .transition()
      .duration(this.options.transitionTime)
      .ease(d3.easeLinear)

    elements.transition(t).attrTween('transform', arcTranslation(this.previousData))

    this.previousData = this.data
  }

  drawLegendSymbol(legendId?: string, asSvgElement?: boolean) {
    let chartElement = this.group
      .select('path')
      .node() as Element
    let style = window.getComputedStyle(chartElement)
    const svg = d3.create('svg')
      .append('svg')
      .attr('width',20)
      .attr('height',20)
    const group = svg
      .append('g')
      .attr('transform', 'translate(10 10)')
    const element = group.append('path')
      .attr('d', d3.symbol(d3.symbols[this.symbol.id], this.symbol.size))
      .style('stroke', style.getPropertyValue('stroke'))
      .style('fill', style.getPropertyValue('fill'))
    if (asSvgElement) return element.node()
    return svg.node()
  }

}

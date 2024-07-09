import * as d3 from 'd3'
import { CartesianAxes, PolarAxes } from '../index.js'
import { Chart, SymbolOptions, TextPosition } from './chart.js'

export class ChartText extends Chart {
  symbol!: SymbolOptions

  constructor(data: any, options: any) {
    super(data, options)
  }

  plotterCartesian(axis: CartesianAxes, axisIndex: any) {
    const xKey = this.dataKeys.x
    const yKey = this.dataKeys.y
    const valueKey = this.dataKeys.value
    const xScale = axis.xScales[axisIndex.x.axisIndex]
    const yScale = axisIndex.y ? axis.yScales[axisIndex.y.axisIndex] : () => undefined

    const mappedData = this.mapDataCartesian(xScale.domain())


    this.group = this.selectGroup(axis, 'chart-marker').datum(mappedData)

    switch (this.options?.text?.position) {
      case TextPosition.Bottom:
        this.group.attr('transform', `translate(0, ${axis.height})`)
        break
      default:
        break
    }

    const rotation = this.options?.text?.angle ? ` rotate(${this.options.text.angle})` : ''

    const elements = this.group
      .selectAll('text')
      .data(this.data)
      .join('text')
      .attr('dominant-baseline', 'middle')
      .attr('transform', (d) => `translate(${xScale(d[xKey])}, ${yScale(d[yKey]) ?? 0})${rotation}`)
      .text((d) => d[valueKey])

    if (this.options?.text?.attributes) {
      for (const [key, value] of Object.entries(this.options.text.attributes)) {
        elements.attr(key, value)
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  plotterPolar(axis: PolarAxes, dataKeys: any) {
    throw new Error('Polar axis are not supported by ChartText')
  }

  drawLegendSymbol(legendId?: string, asSvgElement?: boolean) {
    const props = ['stroke', 'fill']
    const source = this.group
      .select('path')
      .node() as Element
    const svg = d3.create('svg')
      .append('svg')
      .attr('width', 20)
      .attr('height', 20)
    const group = svg
      .append('g')
      .attr('transform', 'translate(10 10)')
    const element = group.append('text')
      .attr('text-anchor', 'middle')
      .text('+1.0')
    this.applyStyle(source, element, props)
    if (asSvgElement) return element.node()
    return svg.node()
  }

}

import * as d3 from 'd3'
import { CartesianAxes, PolarAxes } from '../index.js'
import type { DataPoint } from '../Data/types.js'
import { Chart, ChartOptions, SymbolOptions, TextPosition } from './chart.js'
import type { CartesianAxesIndex } from '../Axes/cartesianAxes.js'

export class ChartText extends Chart {
  symbol!: SymbolOptions

  constructor(data: DataPoint[], options: ChartOptions) {
    super(data, options)
  }

  plotterCartesian(axis: CartesianAxes, axisIndex: CartesianAxesIndex) {
    const xKey = this.dataKeys.x
    const yKey = this.dataKeys.y
    const valueKey = this.dataKeys.value ?? ''

    if (!xKey || !yKey || !valueKey) {
      return
    }

    const xScale = axis.xScales[axisIndex.x?.axisIndex ?? 0]
    const yScale = axisIndex.y ? axis.yScales[axisIndex.y.axisIndex] : () => 0

    const mappedData = this.mapDataCartesian(xScale.domain())

    this.group = this.selectGroup(axis, 'chart-marker')
    this.group.datum(mappedData).attr('class', 'chart-text')

    if (this.options?.text?.position === TextPosition.Bottom) {
      this.group.attr('transform', `translate(0, ${axis.height})`)
    }

    const rotation = this.options?.text?.angle ? ` rotate(${this.options.text.angle})` : ''

    const elements = this.group
      .selectAll('text')
      .data(this.data)
      .join('text')
      .attr('dominant-baseline', 'middle')
      .attr('transform', (d: DataPoint) => {
        const xValue = d[xKey]
        const yValue = d[yKey]
        return `translate(${xScale(xValue)}, ${yScale(yValue) ?? 0})${rotation}`
      })
      .text((d: DataPoint) => String(d[valueKey] ?? ''))

    if (this.options?.text?.attributes) {
      for (const [key, value] of Object.entries(this.options.text.attributes)) {
        elements.attr(key, value)
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  plotterPolar(axis: PolarAxes, dataKeys: any) {
    throw new Error('Polar axis are not supported by ChartText')
  }

  drawLegendSymbol(legendId?: string, asSvgElement?: boolean) {
    const props = ['stroke', 'fill']
    const source = this.group.select('path').node() as Element
    const svg = d3.create('svg').append('svg').attr('width', 20).attr('height', 20)
    const group = svg.append('g').attr('transform', 'translate(10 10)')
    const element = group.append('text').attr('text-anchor', 'middle').text('+1.0') as d3.Selection<
      SVGTextElement,
      unknown,
      null,
      unknown
    >
    this.applyStyle(source, element, props)
    if (asSvgElement) return element.node()
    return svg.node()
  }
}

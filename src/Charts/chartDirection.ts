import * as d3 from 'd3'
import { defaultsDeep } from 'lodash-es'
import { CartesianAxes, PolarAxes } from '../index.js'
import type { CartesianAxesIndex } from '../Axes/cartesianAxes.js'
import type { AxisIndex } from '../Axes/axes.js'
import { ChartOptions, SymbolOptions } from './chart.js'
import type { DataPoint } from '../Data/types.js'
import { ChartMarker } from './chartMarker.js'

import { symbolArrow } from '../Symbols/index.js'

function mean(x: number[] | number): number {
  if (Array.isArray(x)) {
    return d3.mean(x) ?? 0
  }
  return x
}

const DefaultSymbolOptions: SymbolOptions = {
  id: 0,
  size: 10,
  skip: 0,
}
export class ChartDirection extends ChartMarker {
  private previousData: DataPoint[] = []

  constructor(data: DataPoint[], options: ChartOptions) {
    super(data, defaultsDeep({}, options, { symbol: DefaultSymbolOptions }))
  }

  plotterCartesian(axis: CartesianAxes, axisIndex: CartesianAxesIndex) {
    const xKey = this.dataKeys.x
    const yKey = this.dataKeys.value
    const dKey = this.dataKeys.y
    const xScale = axis.xScales[axisIndex.x.axisIndex]
    const yScale = axis.yScales[axisIndex.y.axisIndex]

    const mappedData = this.mapDataCartesian(xScale.domain())
    let skip = 1
    const { skip: configuredSkip, size } = this.symbolOptions
    if (mappedData.length > 2 && configuredSkip === 0) {
      skip = Math.ceil(
        (1 / (xScale(mappedData[1][xKey]) - xScale(mappedData[0][xKey]))) * Math.sqrt(size) * 2,
      )
    }

    const group = this.selectGroup(axis, 'chart-marker').datum(mappedData)

    const elements = group
      .selectAll<SVGGElement, DataPoint>('g')
      .data((d: DataPoint[]) => d.filter((_e, i) => (i + 1) % skip === 0))

    // exit selection
    elements.exit().remove()

    // enter + update selection
    elements
      .enter()
      .append('g')
      .attr('transform', (d: DataPoint, _i: number) => {
        return 'translate(' + xScale(d[xKey]) + ',' + yScale(d[yKey]) + ')'
      })
      .append('path')
      .attr('d', d3.symbol().type(symbolArrow).size(size))
      .attr('transform', (d: DataPoint, _i: number) => {
        return `rotate(${(d[dKey] as number) - 180})`
      })
    this.addTooltipHandlers(elements, axis)

    elements
      .attr('transform', (d: DataPoint, _i: number) => {
        return 'translate(' + xScale(d[xKey]) + ',' + yScale(d[yKey]) + ')'
      })
      .select('path')
      .attr('d', d3.symbol().type(symbolArrow).size(size))
      .attr('transform', (d: DataPoint, _i: number) => {
        return `rotate(${(d[dKey] as number) - 180})`
      })
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  plotterPolar(axis: PolarAxes, dataKeys: AxisIndex) {
    this.group = this.selectGroup(axis, 'chart-marker')
    const rKey = this.dataKeys.radial
    const tKey = this.dataKeys.angular

    const { size } = this.symbolOptions
    const elements = this.group.selectAll<SVGPathElement, DataPoint>('path').data(this.data)

    function arcTransform(p: DataPoint[]) {
      // We only use 'd', but list d,i,a as params just to show can have them as params.
      // Code only really uses d and t.
      return function (d: DataPoint, i: number) {
        const old = p[i] ?? d
        let oldAngle = old[tKey] as number
        const angle = d[tKey] as number
        if (mean(oldAngle) - mean(angle) > 180) {
          oldAngle -= 360
        } else if (mean(oldAngle) - mean(angle) < -180) {
          oldAngle += 360
        }
        const tInterpolate = d3.interpolate(oldAngle, angle)
        const rInterpolate = d3.interpolate(old[rKey] as number, d[rKey] as number)
        return function (x: number) {
          const theta = axis.angularScale(tInterpolate(x))
          const radius = axis.radialScale(rInterpolate(x))
          return (
            'translate(' +
            -radius * Math.sin(-theta) +
            ',' +
            -radius * Math.cos(-theta) +
            ')' +
            ' rotate(' +
            axis.radToDegrees(theta) +
            ')'
          )
        }
      }
    }

    // exit selection
    elements.exit().remove()

    // enter + update selection
    elements
      .enter()
      .append('path')
      .attr('transform', (d: DataPoint, _i: number) => {
        const r: number = axis.radialScale(d[rKey])
        const t: number = axis.angularScale(d[tKey])
        return 'translate(' + -r * Math.sin(-t) + ',' + -r * Math.cos(-t) + ')'
      })
      .attr('d', d3.symbol().type(symbolArrow).size(size))
      .merge(elements)
    this.addTooltipHandlers(elements, axis)

    const transition = d3.transition().duration(this.options.transitionTime).ease(d3.easeLinear)

    elements.transition(transition).attrTween('transform', arcTransform(this.previousData))

    this.previousData = this.data.map((dataPoint) => ({ ...dataPoint }))
  }

  drawLegendSymbol(legendId?: string, asSvgElement?: boolean) {
    const props = ['fill', 'stroke']
    const source = this.group.select('path').node() as Element
    const svg = d3.create('svg').append('svg').attr('width', 20).attr('height', 20)
    const group = svg.append('g').attr('transform', 'translate(10, 0)')
    const element = group
      .append('path')
      .attr('d', d3.symbol().type(symbolArrow).size(this.symbolOptions.size))
    this.applyStyle(source, element, props)
    if (asSvgElement) return group.node()
    return svg.node()
  }
}

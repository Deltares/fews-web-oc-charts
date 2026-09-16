import * as d3 from 'd3'
import { CartesianAxes, PolarAxes } from '../index.js'
import { Chart } from './chart.js'
import type { DataPoint } from '../Data/types.js'
import type { AxisIndex } from '../Axes/axes.js'
import type { CartesianAxesIndex } from '../Axes/cartesianAxes.js'

function mean(x: number[] | number): number {
  if (Array.isArray(x)) {
    return d3.mean(x) ?? 0
  }
  return x
}

function numericValue(data: DataPoint, key: string): number {
  const value = data[key]
  if (typeof value === 'number') return value
  throw new Error(`Expected ${key} to contain a number`)
}

function numericRange(data: DataPoint, key: string): [number, number] {
  const value = data[key]
  if (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number'
  ) {
    return [value[0], value[1]]
  }
  throw new Error(`Expected ${key} to contain a numeric range`)
}

export class ChartProgress extends Chart {
  private previousData: DataPoint[] = []

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  plotterCartesian(axis: CartesianAxes, dataKeys: CartesianAxesIndex) {
    throw new Error('Not implemented')
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  plotterPolar(axis: PolarAxes, dataKeys: AxisIndex) {
    const tKey = this.dataKeys.angular
    const rKey = this.dataKeys.radial
    const colorKey = this.dataKeys.color

    const scale = axis.radialScale.copy()
    scale.padding(0.1)

    const colorMap = d3.schemeTableau10

    const t = d3.transition().duration(this.options.transitionTime).ease(d3.easeLinear)

    const arcGenerator = d3
      .arc<DataPoint>()
      .innerRadius((d) => scale(numericValue(d, rKey)))
      .outerRadius((d) => scale(numericValue(d, rKey)) + scale.bandwidth())
      .startAngle((d) => axis.angularScale(numericRange(d, tKey)[0]))
      .endAngle((d) => axis.angularScale(numericRange(d, tKey)[1]))
      .cornerRadius(scale.bandwidth() / 8)

    this.group = this.selectGroup(axis, 'chart-range')

    const elements = this.group.selectAll('path').data(this.data)

    elements.exit().remove()

    const enter = elements
      .enter()
      .append('path')
      .attr('d', arcGenerator)
      .attr('data-chart-element-id', (d) => String(d[rKey] ?? ''))
    this.addTooltipHandlers(enter, axis, { isPolar: true })

    if (colorKey) {
      enter
        .style('fill', (d) => colorMap[numericValue(d, colorKey) % colorMap.length] ?? colorMap[0])
        .style(
          'stroke',
          (d) => colorMap[numericValue(d, colorKey) % colorMap.length] ?? colorMap[0],
        )
    }

    const update = elements.transition(t).call(arcTween, this.previousData)

    if (colorKey) {
      update
        .style('fill', (d) => colorMap[numericValue(d, colorKey) % colorMap.length] ?? colorMap[0])
        .style(
          'stroke',
          (d) => colorMap[numericValue(d, colorKey) % colorMap.length] ?? colorMap[0],
        )
    }

    this.previousData = this.data.map((dataPoint) => ({ ...dataPoint }))

    function arcTween(
      transition: d3.Transition<d3.BaseType, DataPoint, SVGGElement, unknown>,
      p: DataPoint[],
    ) {
      transition.attrTween('d', (d: DataPoint, i: number) => {
        const old = p[i] ?? d
        const oldAngles = numericRange(old, tKey)
        const angles = numericRange(d, tKey)
        if (mean(oldAngles) - mean(angles) > 180) {
          oldAngles[0] -= 360
          oldAngles[1] -= 360
        } else if (mean(oldAngles) - mean(angles) < -180) {
          oldAngles[0] += 360
          oldAngles[1] += 360
        }

        const tInterpolate = d3.interpolateArray(oldAngles, angles)
        const rInterpolate = d3.interpolate(numericValue(old, rKey), numericValue(d, rKey))
        return (x: number) => {
          d[tKey] = tInterpolate(x)
          d[rKey] = rInterpolate(x)
          return arcGenerator(d) ?? ''
        }
      })
    }
  }

  drawLegendSymbol(legendId?: string, asSvgElement?: boolean) {
    const props = ['fill']
    const source = this.group.select('path').node() as Element
    const { svg, group } = this.createLegendSymbolCanvas('translate(10 0)')
    const element = group
      .append('rect')
      .attr('x', 0)
      .attr('y', -5)
      .attr('width', 20)
      .attr('height', 10)
    this.applyStyle(source, element, props)
    return this.finalizeLegendSymbol(svg, element, asSvgElement)
  }
}

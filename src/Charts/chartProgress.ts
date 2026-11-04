import * as d3 from 'd3'
import { CartesianAxes, PolarAxes } from '../index.js'
import { Chart } from './chart.js'
import type { DataPoint } from '../Data/types.js'
import type { AxisIndex } from '../Axes/axes.js'
import type { CartesianAxesIndex } from '../Axes/cartesianAxes.js'

type AngleRange = [number | Date, number | Date]

function mean(x: number[] | number): number {
  if (Array.isArray(x)) {
    return d3.mean(x) ?? 0
  }
  return x
}

function angleRange(data: DataPoint, key: string): AngleRange {
  const value = data[key] as AngleRange
  if (
    Array.isArray(value) &&
    value.length >= 2 &&
    (typeof value[0] === 'number' || value[0] instanceof Date) &&
    (typeof value[1] === 'number' || value[1] instanceof Date)
  ) {
    return [value[0], value[1]]
  }
  throw new Error(`Expected ${key} to contain a range of numbers or dates`)
}

export class ChartProgress extends Chart {
  private previousData: DataPoint[] = []

  // oxlint-disable-next-line @typescript-eslint/no-unused-vars
  plotterCartesian(axis: CartesianAxes, dataKeys: CartesianAxesIndex) {
    throw new Error('Not implemented')
  }

  // oxlint-disable-next-line @typescript-eslint/no-unused-vars
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
      .innerRadius((d) => scale(d[rKey]))
      .outerRadius((d) => scale(d[rKey]) + scale.bandwidth())
      .startAngle((d) => axis.angularScale(angleRange(d, tKey)[0]))
      .endAngle((d) => axis.angularScale(angleRange(d, tKey)[1]))
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

    const update = elements.transition(t).call(arcTween, this.previousData)

    if (colorKey) {
      const getColor = (d: DataPoint) => {
        const value = d[colorKey]
        return typeof value === 'number' ? (colorMap[value % colorMap.length] ?? colorMap[0]) : null
      }
      enter.style('fill', getColor).style('stroke', getColor)
      update.style('fill', getColor).style('stroke', getColor)
    }

    this.previousData = this.data.map((dataPoint) => ({ ...dataPoint }))

    function arcTween(
      transition: d3.Transition<d3.BaseType, DataPoint, SVGGElement, unknown>,
      p: DataPoint[],
    ) {
      transition.attrTween('d', (d: DataPoint, i: number) => {
        const old = p[i] ?? d
        const angles = angleRange(d, tKey)
        const oldAngles = angleRange(old, tKey)
        const meanDifference = mean(oldAngles.map(Number)) - mean(angles.map(Number))
        const offset = meanDifference > 180 ? -360 : meanDifference < -180 ? 360 : 0
        const startAngles = offset === 0 ? oldAngles : oldAngles.map((x) => Number(x) + offset)

        const tInterpolate = d3.interpolateArray<(number | Date)[]>(startAngles, angles)
        const oldRadial = old[rKey]
        const radial = d[rKey]
        // The radial axis is a band scale, so only numeric keys can be interpolated.
        const rInterpolate =
          typeof oldRadial === 'number' && typeof radial === 'number'
            ? d3.interpolateNumber(oldRadial, radial)
            : () => radial
        return (x: number) => {
          d[tKey] = tInterpolate(x) as DataPoint[string]
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

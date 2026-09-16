import * as d3 from 'd3'
import { AxisIndex, CartesianAxes, PolarAxes } from '../index.js'
import { Chart, ChartOptions, SymbolOptions } from './chart.js'
import type { DataPoint } from '../Data/types.js'
import type { CartesianAxesIndex } from '../Axes/cartesianAxes.js'
import { aspectRatio } from '../Symbols/arrow.js'

import { defaultsDeep } from 'lodash-es'
import { symbolArrow } from '../Symbols/index.js'

function mean(x: number[] | number): number {
  if (Array.isArray(x)) {
    return d3.mean(x) ?? 0
  }
  return x
}

const DefaultSymbolOptions: Partial<SymbolOptions> = {
  size: 10,
}

export interface ChartArrowData extends DataPoint {
  [key: string]: [number, number]
}

export class ChartArrow extends Chart {
  private previousData: ChartArrowData[] = []
  private readonly symbolOptions: Required<SymbolOptions>

  constructor(data: ChartArrowData[], options: ChartOptions) {
    // Assumes data to be of the format {this.dataKeys.radial: [number, number], this.dataKeys.angular: [number, number]}[]
    super(data, options)
    this.options = defaultsDeep(this.options, this.options, { symbol: DefaultSymbolOptions })
    this.symbolOptions = {
      id: 0,
      size: 10,
      skip: 0,
      ...this.options.symbol,
    }
  }

  defaultToolTipFormatterCartesian(_d: DataPoint): HTMLElement {
    throw new Error('defaultToolTipFormatterCartesian is not implemented for ChartArrow')
  }

  defaultToolTipFormatterPolar(d: DataPoint): HTMLElement {
    const points = d as unknown as ChartArrowData[]
    const tKey = this.dataKeys.angular
    const rKey = this.dataKeys.radial
    const html = document.createElement('div')
    if (this.options.angular.includeInTooltip) {
      const spanElement = document.createElement('span')
      spanElement.innerText = this.defaultToolTipText(points[0][tKey], tKey, 0)
      html.appendChild(spanElement)
    }
    if (this.options.radial.includeInTooltip) {
      const spanElement = document.createElement('span')
      spanElement.innerText = this.defaultToolTipText(points[0][rKey], rKey, 0)
      html.appendChild(spanElement)
    }
    return html
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  plotterCartesian(axis: CartesianAxes, axisIndex: CartesianAxesIndex) {
    throw new Error('plotterCartesian is not implemented for ChartArrow')
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  plotterPolar(axis: PolarAxes, axisIndex: AxisIndex) {
    const rKey = this.dataKeys.radial
    const tKey = this.dataKeys.angular
    const arrowHeadSize = this.symbolOptions.size

    // Define functions that draw the arrow initially, and that translate the arrow to the correct position.
    function arrowGenerator(d: ChartArrowData) {
      const radius1: number = axis.radialScale(d[rKey][0])
      const radius2: number = axis.radialScale(d[rKey][1])
      const theta1: number = axis.angularScale(d[tKey][0])
      const theta2: number = axis.angularScale(d[tKey][1])
      const tailLength = Math.sqrt(
        radius1 ** 2 + radius2 ** 2 - 2 * radius1 * radius2 * Math.cos(theta1 - theta2),
      )
      // Dimensions of arrowhead
      let l = Math.sqrt(arrowHeadSize * aspectRatio)
      const w = l / aspectRatio
      l = l / 3
      // Draw arrow, pointing upwards, starting from 0,0.
      // Translate to correct position based on data values, using the arcTransform function.
      return `M0,0
        L${0},${-(tailLength - 2 * l)}
        L${w},${-(tailLength - 3 * l)}
        L${0},${-tailLength}
        L${-w},${-(tailLength - 3 * l)}
        L${0},${-(tailLength - 2 * l)}`
    }

    function arcTransform(p: ChartArrowData[]) {
      // We only use 'd', but list d,i,a as params just to show can have them as params.
      // Code only really uses d.
      return function (d: unknown, i: number, _a: unknown) {
        const points = d as ChartArrowData[]
        if (p.length === 0) {
          return function (_x: number) {
            return 'translate()'
          }
        }
        const old = p[i] ?? points[i]
        const current = points[i]
        // ensure angles stay in range -180 to 180
        if (mean(old[tKey][0]) - mean(current[tKey][0]) > 180) {
          old[tKey][0] = old[tKey][0] - 360
        } else if (mean(old[tKey][0]) - mean(current[tKey][0]) < -180) {
          old[tKey][0] = old[tKey][0] + 360
        }
        const tInterpolate1 = d3.interpolate(old[tKey][0], current[tKey][0])
        const tInterpolate2 = d3.interpolate(old[tKey][1], current[tKey][1])
        const rInterpolate1 = d3.interpolate(old[rKey][0], current[rKey][0])
        const rInterpolate2 = d3.interpolate(old[rKey][1], current[rKey][1])
        return function (x: number) {
          const theta1 = axis.angularScale(tInterpolate1(x))
          const theta2 = axis.angularScale(tInterpolate2(x))
          const radius1 = axis.radialScale(rInterpolate1(x))
          const radius2 = axis.radialScale(rInterpolate2(x))
          const x1 = -radius1 * Math.sin(-theta1)
          const x2 = -radius2 * Math.sin(-theta2)
          const y1 = -radius1 * Math.cos(-theta1)
          const y2 = -radius2 * Math.cos(-theta2)
          const thetaDiff = Math.atan2(y2 - y1, x2 - x1)
          const theta = Math.PI / 2 + thetaDiff
          return 'translate(' + x1 + ',' + y1 + ')' + ' rotate(' + axis.radToDegrees(theta) + ')'
        }
      }
    }

    // Add the data to the element group
    this.group = this.selectGroup(axis, 'chart-arrow')
    this.selectOrAppend('path')
    const arrowData = this.data as ChartArrowData[]
    const arrow = this.group.select('path').data(arrowData)

    const t = d3.transition().duration(this.options.transitionTime).ease(d3.easeLinear)

    // Draw the arrow and translate it to the correct position.
    arrow.transition(t).attr('d', (d, i) => {
      return arrowGenerator(arrowData[i] ?? d)
    })
    arrow.transition(t).attrTween('transform', arcTransform(this.previousData))
    arrow.join('path').datum(arrowData)

    // Add tooltip to the arrow
    this.addTooltipHandlers(arrow, axis, { isPolar: true })

    // Save the data for the next update
    this.previousData = arrowData.map((dataPoint) => ({ ...dataPoint }))
  }

  drawLegendSymbol(legendId?: string, asSvgElement?: boolean) {
    const props = ['stroke', 'stroke-width', 'stroke-dasharray', 'fill']
    const source = this.group.select('path').node() as Element
    const { svg, group: outerGroup } = this.createLegendSymbolCanvas()

    // Make sure the marker is aligned horizontally even when returning the
    // "bare" SVG element.
    const innerGroup = outerGroup.append('g')

    const lineEndX = (Math.sqrt(this.symbolOptions.size * aspectRatio) / 3) * 2
    const line = innerGroup
      .append('line')
      .attr('x1', 0)
      .attr('x2', lineEndX)
      .attr('y1', 0)
      .attr('y2', 0)

    const arrowhead = innerGroup
      .append('path')
      .attr('d', d3.symbol().type(symbolArrow).size(this.symbolOptions.size))
      .attr('transform', `translate(${lineEndX}, 0) rotate(90)`)

    this.applyStyle(source, line, props)
    this.applyStyle(source, arrowhead, props)
    return this.finalizeLegendSymbol(svg, innerGroup, asSvgElement)
  }
}

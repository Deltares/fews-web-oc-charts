import * as d3 from 'd3'
import { AxisIndex, CartesianAxes, PolarAxes } from '../index.js'
import { Chart, ChartOptions, SymbolOptions } from './chart.js'
import { TooltipPosition } from '../Tooltip/tooltip.js'
import { aspectRatio } from '../Symbols/arrow.js'

import { defaultsDeep } from 'lodash-es'
import { symbolArrow } from '../Symbols/index.js'

function mean(x: number[] | number) {
  if (x instanceof Array) {
    return d3.mean(x)
  }
  return x
}

const DefaultSymbolOptions: Partial<SymbolOptions> = {
  size: 10,
}

interface chartArrowData {
  [key: string]: [number, number]
}

export class ChartArrow extends Chart {
  private previousData: chartArrowData[] = []

  constructor(data: chartArrowData[], options: ChartOptions) {
    // Assumes data to be of the format {this.dataKeys.radial: [number, number], this.dataKeys.angular: [number, number]}[]
    super(data, options)
    this.options = defaultsDeep(this.options, this.options, { symbol: DefaultSymbolOptions })
  }

  defaultToolTipFormatterCartesian(d): HTMLElement {
    throw new Error('defaultToolTipFormatterCartesian is not implemented for ChartArrow')
  }

  defaultToolTipFormatterPolar(d: chartArrowData[]): HTMLElement {
    const tKey = this.dataKeys.angular
    const rKey = this.dataKeys.radial
    const html = document.createElement('div')
    if (this.options.angular.includeInTooltip) {
      const spanElement = document.createElement('span')
      spanElement.innerText = this.defaultToolTipText([d[0][tKey][0], d[0][tKey][1]], tKey, 0)
      html.appendChild(spanElement)
    }
    if (this.options.radial.includeInTooltip) {
      const spanElement = document.createElement('span')
      spanElement.innerText = this.defaultToolTipText([d[0][rKey][0], d[0][rKey][1]], rKey, 0)
      html.appendChild(spanElement)
    }
    return html
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  plotterCartesian(axis: CartesianAxes, axisIndex: AxisIndex) {
    throw new Error('plotterCartesian is not implemented for ChartArrow')
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  plotterPolar(axis: PolarAxes, axisIndex: AxisIndex) {
    const rKey = this.dataKeys.radial
    const tKey = this.dataKeys.angular
    const arrowHeadSize = this.options.symbol.size

    // Define functions that draw the arrow initially, and that translate the arrow to the correct position.
    function arrowGenerator(d: chartArrowData) {
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

    function arcTransform(p) {
      // We only use 'd', but list d,i,a as params just to show can have them as params.
      // Code only really uses d.
      return function (d, i, a) {
        if (p.length === 0) {
          return function (x) {
            return 'translate()'
          }
        }
        const old = p[i]
        // ensure angles stay in range -180 to 180
        if (mean(old[tKey][0]) - mean(d[i][tKey][0]) > 180) {
          old[tKey][0] = old[tKey][0] - 360
        } else if (mean(old[tKey][0]) - mean(d[i][tKey][0]) < -180) {
          old[tKey][0] = old[tKey][0] + 360
        }
        const tInterpolate1 = d3.interpolate(old[tKey][0], d[i][tKey][0])
        const tInterpolate2 = d3.interpolate(old[tKey][1], d[i][tKey][1])
        const rInterpolate1 = d3.interpolate(old[rKey][0], d[i][rKey][0])
        const rInterpolate2 = d3.interpolate(old[rKey][1], d[i][rKey][1])
        return function (x) {
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
    if (this.group.select('path').size() === 0) {
      this.group.append('path')
    }
    const arrow = this.group.select('path').data(this.data)

    const t = d3.transition().duration(this.options.transitionTime).ease(d3.easeLinear)

    // Draw the arrow and translate it to the correct position.
    arrow.transition(t).attr('d', (d, i) => {
      return arrowGenerator(this.data[i])
    })
    arrow.transition(t).attrTween('transform', arcTransform(this.previousData))
    arrow.join('path').datum(this.data)

    // Add tooltip to the arrow
    if (this.options.tooltip !== undefined) {
      arrow
        .on('pointerover', (e: any, d: chartArrowData[]) => {
          axis.tooltip.show()
          const pointer = d3.pointer(e, axis.container)
          axis.tooltip.update(
            this.toolTipFormatterPolar(d),
            this.options.tooltip.position !== undefined
              ? this.options.tooltip.position
              : TooltipPosition.Top,
            pointer[0],
            pointer[1],
          )
        })
        .on('pointerout', () => {
          axis.tooltip.hide()
        })
    }

    // Save the data for the next update
    this.previousData = this.data
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  drawLegendSymbol(legendId?: string, asSvgElement?: boolean) {
    const props = ['stroke', 'stroke-width', 'stroke-dasharray', 'fill']
    const source = this.group.select('path').node() as Element
    const svg = d3.create('svg').attr('width', 20).attr('height', 20)
    const outerGroup = svg.append('g').attr('transform', 'translate(0, 10)')

    // Make sure the marker is aligned horizontally even when returning the
    // "bare" SVG element.
    const innerGroup = outerGroup.append('g')

    const lineEndX = (Math.sqrt(this.options.symbol.size * aspectRatio) / 3) * 2
    const line = innerGroup
      .append('line')
      .attr('x1', 0)
      .attr('x2', lineEndX)
      .attr('y1', 0)
      .attr('y2', 0)

    const arrowhead = innerGroup
      .append('path')
      .attr('d', d3.symbol().type(symbolArrow).size(this.options.symbol.size))
      .attr('transform', `translate(${lineEndX}, 0) rotate(90)`)

    this.applyStyle(source, line, props)
    this.applyStyle(source, arrowhead, props)
    if (asSvgElement) return innerGroup.node()
    return svg.node()
  }
}

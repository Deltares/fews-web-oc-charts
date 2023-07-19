import * as d3 from 'd3'
import { AxisIndex, CartesianAxes, PolarAxes } from '../index.js';
import { Chart, ChartOptions, SymbolOptions } from './chart.js'
import { TooltipPosition } from '../Tooltip/tooltip.js'
import { aspectRatio } from '../Symbols/arrow.js';

import { defaultsDeep } from 'lodash-es'

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
  [key: string]: [number, number],
}

export class ChartArrow extends Chart {
  private previousData: chartArrowData[] = []

    constructor(data: chartArrowData[], options: ChartOptions) {
    // Assumes data to be of the format {this.dataKeys.radial: [number, number], this.dataKeys.angular: [number, number]}[]
    super(data, options)
    this.options = defaultsDeep(this.options, this.options, { symbol: DefaultSymbolOptions })
  }

  defaultToolTipFormatterCartesian(d) {
    throw new Error('defaultToolTipFormatterCartesian is not implemented for ChartArrow')
    return ''
  }

  defaultToolTipFormatterPolar(d: chartArrowData[]) {
    const tKey = this.dataKeys.angular
    const rKey = this.dataKeys.radial
    let html = ''
    if (this.options.angular.includeInTooltip) {
      html += this.defaultToolTipText([d[0][tKey][0], d[0][tKey][1]], tKey, 0) + '<br/>'
    }
    if (this.options.radial.includeInTooltip) {
      html += this.defaultToolTipText([d[0][rKey][0], d[0][rKey][1]], rKey, 0)
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

    function arrowGenerator (d: chartArrowData) {
      const radius1: number = axis.radialScale(d[rKey][0])
      const radius2: number = axis.radialScale(d[rKey][1])
      const theta1: number = axis.angularScale(d[tKey][0])
      const theta2: number = axis.angularScale(d[tKey][1])
      const tailLength = Math.sqrt(radius1**2 + radius2**2 - 2 * radius1 * radius2 * Math.cos(theta1 - theta2))
      // Dimensions of arrowhead
      let l = Math.sqrt(arrowHeadSize * aspectRatio);
      const w = l / aspectRatio
      l = l / 3
      // Draw arrow, pointing upwards, starting from 0,0. Translate to correct position later
      return `M0,0
        L${0},${-(tailLength - 2 * l)}
        L${w},${-(tailLength - 3 * l)}
        L${0},${-tailLength}
        L${-w},${-(tailLength - 3 * l)}
        L${0},${-(tailLength - 2 * l)}`;
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
          const thetaDiff = Math.atan2( y2 - y1, x2 - x1)
          const theta = Math.PI / 2 + thetaDiff
          return 'translate(' + x1 + ',' + y1 + ')' + ' rotate(' + axis.radToDegrees(theta) +')'
        }
      }
    }

    this.group = this.selectGroup(axis, 'chart-arrow')
    if (this.group.select('path').size() === 0) {
      this.group.append('path')
    }
    const arrow = this.group.select('path').data(this.data)

    const t = d3
      .transition()
      .duration(this.options.transitionTime)
      .ease(d3.easeLinear)

    arrow.transition(t).attr('d', (d,i) => {return arrowGenerator(this.data[i])})
    arrow.transition(t).attrTween('transform', arcTransform(this.previousData))
    arrow.join('path').datum(this.data)

    if (this.options.tooltip !== undefined) {
      arrow
      .on('pointerover', (e: any, d: chartArrowData[]) => {
        axis.tooltip.show()
        const pointer = d3.pointer(e, axis.container)
        axis.tooltip.update(
          this.toolTipFormatterPolar(d),
          this.options.tooltip.position !== undefined ? this.options.tooltip.position : TooltipPosition.Top,
          pointer[0],
          pointer[1]
          )
        })
        .on('pointerout', () => {
          axis.tooltip.hide()
        })
      }

    this.previousData = this.data
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  drawLegendSymbol(legendId?: string, asSvgElement?: boolean) {
    throw new Error('drawLegendSymbol is not implemented for ChartArrow')
  }
}

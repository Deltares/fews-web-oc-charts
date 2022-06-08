import { SvgPropertiesHyphen } from 'csstype'
import * as d3 from 'd3'

import { CartesianAxis } from '../Axis/cartesianAxis.js'
import { PolarAxis } from '../Axis/polarAxis.js'
import { TooltipPosition } from '../Tooltip/tooltip.js'
import { Chart } from './chart.js'

export class ChartLine extends Chart {
  defaultToolTipFormatterCartesian(d) {
    const xKey = this.dataKeys.x
    const yKey = this.dataKeys.y
    let html = ''
    if (this.options.x.includeInTooltip) {
      if (d[0][xKey] != d[1][xKey]) {
        html += xKey + ': ' + d[0][xKey].toFixed(2) + '-' + d[1][xKey].toFixed(2) + '<br/>'
      } else {
        html += xKey + ': ' + d[0][xKey].toFixed(2) + '<br/>'
      }
    }
    if (this.options.y.includeInTooltip) {
      if (d[0][yKey] != d[1][yKey]) {
        html += yKey + ': ' + d[0][yKey].toFixed(2) + '-' + d[1][yKey].toFixed(2)
      } else {
        html += yKey + ': ' + d[0][yKey].toFixed(2)
      }
    }
    return html
  }

  defaultToolTipFormatterPolar(d) {
    const tKey = this.dataKeys.angular
    const rKey = this.dataKeys.radial
    let html = ''
    if (this.options.angular.includeInTooltip) {
      if (d[0][tKey] != d[1][tKey]) {
        html += tKey+ ': ' + d[0][tKey].toFixed(0) + '-' + d[1][tKey].toFixed(0) + '<br/>'
      } else {
        html += tKey+ ': ' + d[0][tKey].toFixed(0) + '<br/>'
      }
    }
    if (this.options.radial.includeInTooltip) {
      if (d[0][rKey] != d[1][rKey]) {
        html += rKey + ': ' + d[0][rKey].toFixed(0) + '-' + d[1][rKey].toFixed(0)
      } else {
        html += rKey + ': ' + d[0][rKey].toFixed(0)
      }
    }
    return html
  }

  plotterCartesian(axis: CartesianAxis, axisIndex: any) {

    const xKey = this.dataKeys.x
    const yKey = this.dataKeys.y
    const xScale = axis.xScale[axisIndex.x.axisIndex]
    const yScale = axis.yScale[axisIndex.y.axisIndex]

    const mappedData = this.mapDataCartesian(xScale.domain())
    const lineGenerator = d3
      .line()
      .x(function(d: any) {
        return xScale(d[xKey])
      })
      .y(function(d: any) {
        return yScale(d[yKey])
      })
      .defined(function(d: any) {
        return d[yKey] != null
      })
    const curve = this.curveGenerator
    if (curve !== undefined) {
      lineGenerator
        .curve(curve)
    }

    this.group = this.selectGroup(axis, 'chart-line')
    if (this.group.select('path').size() === 0) {
      this.group.append('path')
    }
    const update = this.group
      .select('path')
      .datum(mappedData)
      .join('path')
      .attr('d', lineGenerator)

    if (this.options.tooltip !== undefined) {
      update
      .on('pointerover', (e: any, d: any) => {
        axis.tooltip.show()
        const pointer = d3.pointer(e, axis.container)
        axis.tooltip.update(
          this.toolTipFormatterCartesian(d),
          TooltipPosition.Top,
          pointer[0],
          pointer[1]
        )
      })
      .on('pointerout', () => {
        axis.tooltip.hide()
      })
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  plotterPolar(axis: PolarAxis, axisIndex: any) {
    const rKey = this.dataKeys.radial
    const tKey = this.dataKeys.angular
    const lineGenerator = d3
      .lineRadial()
      .angle(function(d: any) {
        return axis.angularScale(d[tKey])
      })
      .radius(function(d: any) {
        return axis.radialScale(d[rKey])
      })
    this.group = this.selectGroup(axis, 'chart-line')
    if (this.group.select('path').size() === 0) {
      this.group.append('path')
    }
    const line = this.group.select('path')

    const t = d3
      .transition()
      .duration(this.options.transitionTime)
      .ease(d3.easeLinear)

    line.transition(t).attr('d', lineGenerator(this.data))
    line.join('path').datum(this.data)
    if (this.options.tooltip !== undefined) {
      line
      .on('pointerover', (e: any, d: any) => {
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
  }

  drawLegendSymbol(legendId?: string, asSvgElement?: boolean) {
    const props = ['stroke', 'stroke-width', 'stroke-dasharray']
    const source = this.group
      .select('path')
      .node() as Element
    const svg = d3.create('svg')
      .attr('width',20)
      .attr('height',20)
    const group = svg
      .append('g')
      .attr('transform','translate(0, 10)')
    const element = group.append('line')
      .attr('x1', 0)
      .attr('x2', 20)
      .attr('y1', 0)
      .attr('y2', 0)
    this.applyStyle(source, element, props)
    if (asSvgElement) return element.node()
    return svg.node()
  }
}

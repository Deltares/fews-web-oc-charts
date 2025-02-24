import * as d3 from 'd3'
import { CartesianAxes, PolarAxes } from '../index.js'
import { TooltipAnchor, TooltipPosition } from '../Tooltip/tooltip.js'
import { Chart } from './chart.js'

function mean(x: number[] | number) {
  if (x instanceof Array) {
    return d3.mean(x)
  }
  return x
}

export class ChartProgress extends Chart {
  private previousData: any[] = []

  plotterCartesian(axis: CartesianAxes, dataKeys: any) {
    throw new Error('Not implemented')
  }

  plotterPolar(axis: PolarAxes, dataKeys: any) {
    const tKey = this.dataKeys.angular
    const rKey = this.dataKeys.radial
    const colorKey = this.dataKeys.color

    const scale = axis.radialScale.copy()
    scale.padding(0.1)

    const colorMap = d3.schemeTableau10

    const t = d3.transition().duration(this.options.transitionTime).ease(d3.easeLinear)

    const arcGenerator = d3
      .arc()
      .innerRadius(function (d: any, i) {
        return scale(d[rKey])
      })
      .outerRadius(function (d: any, i) {
        return scale(d[rKey]) + scale.bandwidth()
      })
      .startAngle(function (d: any, i) {
        return axis.angularScale(d[tKey][0])
      })
      .endAngle(function (d: any, i) {
        return axis.angularScale(d[tKey][1])
      })
      .cornerRadius(scale.bandwidth() / 8)

    this.group = this.selectGroup(axis, 'chart-range')

    const elements = this.group.selectAll('path').data(this.data)

    elements.exit().remove()

    const enter = elements
      .enter()
      .append('path')
      .attr('d', arcGenerator)
      .attr('data-chart-element-id', (d) => {
        return d[rKey]
      })
    if (this.options.tooltip !== undefined) {
      enter
        .on('pointerover', (e: any, d) => {
          if (
            this.options.tooltip.anchor !== undefined &&
            this.options.tooltip.anchor !== TooltipAnchor.Pointer
          ) {
            console.error(
              'Tooltip not implemented for anchor ',
              this.options.tooltip.anchor,
              ', using ',
              TooltipAnchor.Pointer,
              ' instead.',
            )
          }
          const pointer = d3.pointer(e, axis.container)
          const x = pointer[0]
          const y = pointer[1]
          axis.tooltip.show()
          axis.tooltip.update(
            this.toolTipFormatterPolar(d),
            this.options.tooltip.position !== undefined
              ? this.options.tooltip.position
              : TooltipPosition.Top,
            x,
            y,
          )
        })
        .on('pointerout', () => {
          axis.tooltip.hide()
        })
    }

    if (colorKey) {
      enter
        .style('fill', (d: any) => {
          return colorMap[d[colorKey]]
        })
        .style('stroke', (d: any) => {
          return colorMap[d[colorKey]]
        })
    }

    const update = elements.transition(t).call(arcTween, this.previousData)

    if (colorKey) {
      update
        .style('fill', (d: any) => {
          return colorMap[d[colorKey]]
        })
        .style('stroke', (d: any) => {
          return colorMap[d[colorKey]]
        })
    }

    this.previousData = { ...this.data }

    function arcTween(transition: any, p: any) {
      transition.attrTween('d', (d: any, i: number, a: any) => {
        const old = p[i]
        if (mean(old[tKey]) - mean(d[tKey]) > 180) {
          old[tKey] = old[tKey].map((x) => {
            return x - 360
          })
        } else if (mean(old[tKey]) - mean(d[tKey]) < -180) {
          old[tKey] = old[tKey].map((x) => {
            return x + 360
          })
        }

        const tInterpolate = d3.interpolateArray(old[tKey], d[tKey])
        const rInterpolate = d3.interpolateArray(old[rKey], d[rKey])
        return function (x: any) {
          d[tKey] = tInterpolate(x)
          d[rKey] = rInterpolate(x)
          return arcGenerator(d)
        }
      })
    }
  }

  drawLegendSymbol(legendId?: string, asSvgElement?: boolean) {
    const props = ['fill']
    const source = this.group.select('path').node() as Element
    const svg = d3.create('svg').attr('width', 20).attr('height', 20)
    const group = svg.append('g').attr('transform', 'translate(10 0)')
    const element = group
      .append('rect')
      .attr('x', 0)
      .attr('y', -5)
      .attr('width', 20)
      .attr('height', 10)
    this.applyStyle(source, element, props)
    if (asSvgElement) return element.node()
    return svg.node()
  }
}

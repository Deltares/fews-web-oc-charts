import * as d3 from 'd3'
import { AxisIndex } from '../Axes/axes.js'
import { CartesianAxes, CartesianAxesIndex, PolarAxes } from '../index.js'
import { Chart, AUTO_SCALE } from './chart.js'
import { TooltipAnchor, TooltipPosition } from '../Tooltip/tooltip.js'
import type { DataPoint } from '../Data/types.js'

function mean(x: number[] | number): number {
  if (Array.isArray(x)) {
    return d3.mean(x) ?? 0
  }
  return x
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

export class ChartRange extends Chart {
  private previousData: DataPoint[] = []

  plotterCartesian(axis: CartesianAxes, axisIndex: CartesianAxesIndex) {
    const xKey = this.dataKeys.x
    const yKey = this.dataKeys.y
    const xScale = axis.xScales[axisIndex.x.axisIndex]
    const yScale = axis.yScales[axisIndex.y.axisIndex]
    const colorKey = this.dataKeys.color

    const colorScale = d3.scaleLinear().domain([0, 1])
    if (this.options.colorScale === AUTO_SCALE) {
      const colorValues = this.data
        .map((d) => d[colorKey])
        .filter((value): value is number => typeof value === 'number')
      const colorExtent = d3.extent(colorValues)
      if (colorExtent[0] !== undefined && colorExtent[1] !== undefined) {
        colorScale.domain(colorExtent)
      }
    }

    const colorMap = this.colorMap

    this.group = this.selectGroup(axis, 'chart-range')
    this.group.style('stroke', 'none')

    const elements = this.group.selectAll<SVGRectElement, DataPoint>('rect').data(this.data)

    const t = d3.transition().duration(this.options.transitionTime).ease(d3.easeLinear)
    // exit
    elements.exit().remove()
    // update + enter
    const update = elements
      .enter()
      .append('rect')
      .attr('x', (d) => {
        return xScale(numericRange(d, xKey)[0])
      })
      .attr('y', (d) => {
        return yScale(numericRange(d, yKey)[1])
      })
      .attr('width', (d) => {
        const range = numericRange(d, xKey)
        return xScale(range[1]) - xScale(range[0])
      })
      .attr('height', (d) => {
        const range = numericRange(d, yKey)
        return yScale(range[0]) - yScale(range[1])
      })

    if (this.options.tooltip !== undefined) {
      const tooltip = this.options.tooltip

      update
        .on('pointerover', (_e: Event, d: DataPoint) => {
          if (tooltip.anchor !== undefined && tooltip.anchor !== TooltipAnchor.Center) {
            console.error(
              'Tooltip not implemented for anchor ',
              tooltip.anchor,
              ', using ',
              TooltipAnchor.Center,
              ' instead.',
            )
          }
          axis.tooltip.show()
          const xRange = numericRange(d, xKey)
          const yRange = numericRange(d, yKey)
          const content = this.toolTipFormatterCartesian(d)
          if (content !== undefined) {
            axis.tooltip.update(
              content,
              tooltip.position ?? TooltipPosition.Top,
              axis.margin.left + (xScale(xRange[1]) + xScale(xRange[0])) / 2,
              axis.margin.top + (yScale(yRange[1]) + yScale(yRange[0])) / 2,
            )
          }
        })
        .on('pointerout', () => {
          axis.tooltip.hide()
        })
    }

    if (colorKey) {
      update.style('fill', (d) => {
        const value = d[colorKey]
        return typeof value === 'number' ? colorMap(colorScale(value)) : 'none'
      })
    }

    const enter = elements
      .transition(t)
      .attr('x', (d) => {
        return xScale(numericRange(d, xKey)[0])
      })
      .attr('y', (d) => {
        return yScale(numericRange(d, yKey)[1])
      })
      .attr('width', (d) => {
        const range = numericRange(d, xKey)
        return xScale(range[1]) - xScale(range[0])
      })
      .attr('height', (d) => {
        const range = numericRange(d, yKey)
        return yScale(range[0]) - yScale(range[1])
      })

    if (colorKey) {
      enter.style('fill', (d: any) => {
        return d.color
      })
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  plotterPolar(axis: PolarAxes, axisIndex: AxisIndex) {
    const rKey = this.dataKeys.radial
    const tKey = this.dataKeys.angular
    const colorKey = this.dataKeys.color

    const colorScale = d3.scaleLinear().domain([0, 1])
    if (this.options.colorScale === AUTO_SCALE) {
      const colorValues = this.data
        .map((d) => d[colorKey])
        .filter((value): value is number => typeof value === 'number')
      const colorExtent = d3.extent(colorValues)
      if (colorExtent[0] !== undefined && colorExtent[1] !== undefined) {
        colorScale.domain(colorExtent)
      }
    }
    const colorMap = this.colorMap

    const t = d3.transition().duration(this.options.transitionTime).ease(d3.easeLinear)

    const arcGenerator = d3
      .arc<DataPoint>()
      .innerRadius((d) => axis.radialScale(numericRange(d, rKey)[0]))
      .outerRadius((d) => axis.radialScale(numericRange(d, rKey)[1]))
      .startAngle((d) => axis.angularScale(numericRange(d, tKey)[0]))
      .endAngle((d) => axis.angularScale(numericRange(d, tKey)[1]))

    this.group = this.selectGroup(axis, 'chart-range')
    this.group.style('stroke', 'none')

    const elements = this.group.selectAll('path').data(this.data)

    elements.exit().remove()

    function angularPosition(angle: number): number {
      const direction = -axis.direction
      const intercept = 90 - (180 * axis.intercept) / Math.PI
      const range = [
        (180 * axis.angularScale.range()[0]) / Math.PI,
        (180 * axis.angularScale.range()[1]) / Math.PI,
      ]
      const scale =
        (axis.angularScale.domain()[1] - axis.angularScale.domain()[0]) / (range[1] - range[0])
      return (
        (angle + direction * intercept * scale + (range[0] - direction * range[0]) * scale) *
        direction
      )
    }

    const enter = elements.enter().append('path').attr('d', arcGenerator)

    if (this.options.tooltip !== undefined) {
      const tooltip = this.options.tooltip

      enter
        .on('pointerover', (e: any, d: any) => {
          axis.tooltip.show()
          let x: number
          let y: number
          if (tooltip.anchor === TooltipAnchor.Center) {
            const tRange = numericRange(d, tKey)
            const rRange = numericRange(d, rKey)
            const start = angularPosition(tRange[0])
            const end = angularPosition(tRange[1])
            const centroid = d3.arc().centroid({
              innerRadius: axis.radialScale(rRange[0]),
              outerRadius: axis.radialScale(rRange[1]),
              startAngle: axis.angularScale(start),
              endAngle: axis.angularScale(end),
            })
            x = axis.margin.left + axis.width / 2 + centroid[0]
            y = axis.margin.top + axis.height / 2 + centroid[1]
          } else {
            if (tooltip.anchor !== undefined && tooltip.anchor !== TooltipAnchor.Pointer) {
              console.error(
                'Tooltip not implemented for anchor ',
                tooltip.anchor,
                ', using ',
                TooltipAnchor.Pointer,
                ' instead.',
              )
            }
            const pointer = d3.pointer(e, axis.container)
            x = pointer[0]
            y = pointer[1]
          }
          const content = this.toolTipFormatterPolar(d)
          if (content !== undefined) {
            axis.tooltip.update(content, tooltip.position ?? TooltipPosition.Top, x, y)
          }
        })
        .on('pointerout', () => {
          axis.tooltip.hide()
        })
    }

    if (colorKey) {
      enter.style('fill', (d: DataPoint) => {
        const value = d[colorKey]
        return typeof value === 'number' ? colorMap(colorScale(value)) : 'none'
      })
    }

    const update = elements.transition(t).call(arcTween, this.previousData)

    if (colorKey) {
      update.style('fill', (d: DataPoint) => {
        const value = d[colorKey]
        return typeof value === 'number' ? colorMap(colorScale(value)) : 'none'
      })
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
          oldAngles[0] = oldAngles[0] - 360
          oldAngles[1] = oldAngles[1] - 360
        } else if (mean(oldAngles) - mean(angles) < -180) {
          oldAngles[0] = oldAngles[0] + 360
          oldAngles[1] = oldAngles[1] + 360
        }
        const oldRadius = numericRange(old, rKey)
        const radius = numericRange(d, rKey)
        const tInterpolate = d3.interpolateArray(oldAngles, angles)
        const rInterpolate = d3.interpolateArray(oldRadius, radius)
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
    const svg = d3.create('svg').attr('width', 20).attr('height', 20)
    const group = svg.append('g').attr('transform', 'translate(0, 10)')
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

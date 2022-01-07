import * as d3 from 'd3'
import { CartesianAxis, PolarAxis, AxisIndex } from '../Axis'
import { Chart, AUTO_SCALE } from './chart'
import { TooltipPosition } from '../Tooltip'

function mean(x: number[] | number) {
  if (x instanceof Array) {
    return d3.mean(x)
  }
  return x
}

export class ChartRange extends Chart {
  private previousData: any[] = []

  set extent(extent: any[]) {
    this._extent = extent
  }

  get extent(): any[] {
    if (!this._extent) {
      this._extent = []
      for (const key in this.dataKeys) {
        const path = this.dataKeys[key]
        this._extent[path] = this.dataExtentFor(path)
      }
    }
    return this._extent
  }

  dataExtentFor(path) {
    const min = d3.min(this._data, function(d: any) {
      if (d[path] === null) return undefined
      if (Array.isArray(d[path])) return d3.min(d[path])
      return d[path]
    })
    const max = d3.max(this._data, function(d: any) {
      if (d[path] === null) return undefined
      if (Array.isArray(d[path])) return d3.min(d[path])
      return d[path]
    })
    return [min, max]
  }

  defaultToolTipFormatterCartesian(d) {
    const xKey = this.dataKeys.x
    const yKey = this.dataKeys.y
    let html = ''
    if (this.options.x.includeInTooltip) {
      if (d[xKey][0] != d[xKey][1]) {
        html += xKey + ': ' + d[xKey][0].toFixed(2) + '-' + d[xKey][1].toFixed(2) + '<br/>'
      }
    }
    if (this.options.y.includeInTooltip) {
      if (d[yKey][0] != d[yKey][1]) {
        html += yKey + ': ' + d[yKey][0].toFixed(2) + '-' + d[yKey][1].toFixed(2)
      }
    }
    return html
  }

  defaultToolTipFormatterPolar(d) {
    const tKey = this.dataKeys.angular
    const rKey = this.dataKeys.radial
    let html = ''
    if (this.options.angular.includeInTooltip) {
      if (d[tKey][0] != d[tKey][1]) {
        html += tKey+ ': ' + d[tKey][0].toFixed(0) + '-' + d[tKey][1].toFixed(0) + '<br/>'
      }
    }
    if (this.options.radial.includeInTooltip) {
      if (d[rKey][0] != d[rKey][1]) {
        html += rKey + ': ' + d[rKey][0].toFixed(0) + '-' + d[rKey][1].toFixed(0)
      }
    }
    return html
  }

  plotterCartesian(axis: CartesianAxis, axisIndex: AxisIndex) {
    const xKey = this.dataKeys.x
    const yKey = this.dataKeys.y
    const xScale = axis.xScale[axisIndex.x.axisIndex]
    const yScale = axis.yScale[axisIndex.y.axisIndex]
    const colorKey = this.dataKeys.color

    const colorScale = d3.scaleLinear().domain([0, 1])
    if (this.options.colorScale === AUTO_SCALE) {
      colorScale.domain(
        d3.extent(this.data, function(d: any): number {
          return d[colorKey]
        })
      )
    }

    const colorMap = this.colorMap

    this.group = this.selectGroup(axis, 'chart-range')
    this.group.style('stroke', 'none')

    const elements: any = this.group.selectAll('rect').data(this.data)

    const t = d3
      .transition()
      .duration(this.options.transitionTime)
      .ease(d3.easeLinear)
    // exit
    elements.exit().remove()
    // update + enter
    const update = elements
      .enter()
      .append('rect')
      .attr('x', (d: any) => {
        return xScale(d[xKey][0])
      })
      .attr('y', (d: any) => {
        return yScale(d[yKey][1])
      })
      .attr('width', (d: any) => {
        return xScale(d[xKey][1] - d[xKey][0])
      })
      .attr('height', (d: any) => {
        return yScale(d[yKey][0] - d[yKey][1])
      })
      .on('pointerover', (_e: any, d) => {
        axis.tooltip.show()
        axis.tooltip.update(
          this.toolTipFormatterCartesian(d),
          TooltipPosition.Top,
          axis.margin.left + xScale((d[xKey][1] + d[xKey][0])/2),
          axis.margin.top + yScale((d[yKey][1] + d[yKey][0])/2),
        )
      })
      .on('pointerout', () => {
        axis.tooltip.hide()
      })

    if (colorKey) {
      update.style('fill', (d: any) => {
        return colorMap(colorScale(mean(d[colorKey])))
      })
    }

    const enter = elements
      .transition(t)
      .attr('x', (d: any) => {
        return xScale(d[xKey][0])
      })
      .attr('y', (d: any) => {
        return yScale(d[yKey][1])
      })
      .attr('width', (d: any) => {
        return xScale(d[xKey][1] - d[xKey][0])
      })
      .attr('height', (d: any) => {
        return yScale(d[yKey][0] - d[yKey][1])
      })

    if (colorKey) {
      enter.style('fill', (d: any) => {
        return d.color
      })
    }
  }

  plotterPolar(axis: PolarAxis, axisIndex: AxisIndex) {

    const rKey = this.dataKeys.radial
    const tKey = this.dataKeys.angular
    const colorKey = this.dataKeys.color

    const colorScale = d3.scaleLinear().domain([0, 1])
    if (this.options.colorScale === AUTO_SCALE) {
      colorScale.domain(
        d3.extent(this.data, function(d: any): number {
          return d[colorKey]
        })
      )
    }
    const colorMap = this.colorMap

    const t = d3
      .transition()
      .duration(this.options.transitionTime)
      .ease(d3.easeLinear)

    const arcGenerator = d3
      .arc()
      .innerRadius((d: any, i) => {
        return axis.radialScale(d[rKey][0])
      })
      .outerRadius((d: any, i) => {
        return axis.radialScale(d[rKey][1])
      })
      .startAngle((d: any, i) => {
        return axis.angularScale(d[tKey][0])
      })
      .endAngle((d: any, i) => {
        return axis.angularScale(d[tKey][1])
      })

    this.group = this.selectGroup(axis, 'chart-range')
    this.group.style('stroke', 'none')

    const elements = this.group.selectAll('path').data(this.data)

    elements.exit().remove()

    const enter = elements
      .enter()
      .append('path')
      .attr('d', arcGenerator)
      .on('pointerover', (e: any, d) => {
        const pointer = d3.pointer(e, axis.container)
        axis.tooltip.show()
        axis.tooltip.update(
          this.toolTipFormatterPolar(d),
          TooltipPosition.Top,
          pointer[0],
          pointer[1]
        )
      })
      .on('pointerout', () => {
        axis.tooltip.hide()
      })

    if (colorKey) {
      enter.style('fill', (d: any) => {
        return colorMap(colorScale(mean(d[colorKey])))
      })
    }

    const update = elements.transition(t).call(arcTween, this.previousData)

    if (colorKey) {
      update.style('fill', function(d: any) {
        return colorMap(colorScale(mean(d[colorKey])))
      })
    }

    this.previousData = {...this.data}
    function arcTween(transition: any, p: any) {
      transition.attrTween('d', (d: any, i: number, a: any) => {
        const old = p[i]
        if (mean(old[tKey]) - mean(d[tKey]) > 180) {
          old[tKey] = old[tKey].map(function(x) {
            return x - 360
          })
        } else if (mean(old[tKey]) - mean(d[tKey]) < -180) {
          old[tKey] = old[tKey].map(function(x) {
            return x + 360
          })
        }

        const tInterpolate = d3.interpolateArray(old[tKey], d[tKey])
        const rInterpolate = d3.interpolateArray(old[rKey], d[rKey])
        return function(x: any) {
          d[tKey] = tInterpolate(x)
          d[rKey] = rInterpolate(x)
          return arcGenerator(d)
        }
      })
    }
  }

  drawLegendSymbol(legendId?: string, asSvgElement?: boolean) {
    const chartElement = this.group
      .select('path')
      .node() as Element
    const style = window.getComputedStyle(chartElement)
    const svg = d3.create('svg')
      .attr('width',20)
      .attr('height',20)
    const group = svg
      .append('g')
      .attr('transform','translate(0, 10)')
    const element = group.append('rect')
      .attr('x', 0)
      .attr('y', -5)
      .attr('width', 20)
      .attr('height', 10)
      .style('fill', style.getPropertyValue('fill'))
    if (asSvgElement) return element.node()
    return svg.node()  }

}

import * as d3 from 'd3'
import { CartesianAxis, PolarAxis, AxisIndex } from '../Axis'
import { Chart, AUTO_SCALE } from './chart'

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
      this._extent = Array()
      for (let key in this.dataKeys) {
        let path = this.dataKeys[key]
        let min = d3.min(this._data, function(d: any) {
          if (d[path] === null) return undefined
          if (Array.isArray(d[path])) return d3.min(d[path])
          return d[path]
        })
        let max = d3.max(this._data, function(d: any) {
          if (d[path] === null) return undefined
          if (Array.isArray(d[path])) return d3.min(d[path])
          return d[path]
        })
        this._extent[path] = [min, max]
      }
    }
    return this._extent
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
    let xKey = this.dataKeys.x
    let yKey = this.dataKeys.y
    const xScale = axis.xScale[axisIndex.x.axisIndex]
    const yScale = axis.yScale[axisIndex.y.axisIndex]
    let colorKey = this.dataKeys.color

    let colorScale = d3.scaleLinear().domain([0, 1])
    if (this.options.colorScale === AUTO_SCALE) {
      colorScale.domain(
        d3.extent(this.data, function(d: any): number {
          return d[colorKey]
        })
      )
    }

    let colorMap = this.colorMap

    this.group = this.selectGroup(axis, 'chart-range')
    this.group.style('stroke', 'none')

    let elements: any = this.group.selectAll('rect').data(this.data)

    let t = d3
      .transition()
      .duration(this.options.transitionTime)
      .ease(d3.easeLinear)
    let that = this
    // exit
    elements.exit().remove()
    // update + enter
    let update = elements
      .enter()
      .append('rect')
      .attr('x', function(d: any) {
        return xScale(d[xKey][0])
      })
      .attr('y', function(d: any) {
        return yScale(d[yKey][1])
      })
      .attr('width', function(d: any) {
        return xScale(d[xKey][1] - d[xKey][0])
      })
      .attr('height', function(d: any) {
        return yScale(d[yKey][0] - d[yKey][1])
      })
      .on('pointerover', function(_e: any, d) {
        axis.tooltip.show()
        axis.tooltip.update(that.toolTipFormatterCartesian(d))
      })
      .on('pointerout', function() {
        axis.tooltip.hide()
      })

    if (colorKey) {
      update.style('fill', function(d: any) {
        return colorMap(colorScale(mean(d[colorKey])))
      })
    }

    let enter = elements
      .transition(t)
      .attr('x', function(d: any) {
        return xScale(d[xKey][0])
      })
      .attr('y', function(d: any) {
        return yScale(d[yKey][1])
      })
      .attr('width', function(d: any) {
        return xScale(d[xKey][1] - d[xKey][0])
      })
      .attr('height', function(d: any) {
        return yScale(d[yKey][0] - d[yKey][1])
      })

    if (colorKey) {
      enter.style('fill', function(d: any) {
        return d.color
      })
    }
  }

  plotterPolar(axis: PolarAxis, axisIndex: AxisIndex) {
    let canvas = axis.canvas

    let rKey = this.dataKeys.radial
    let tKey = this.dataKeys.angular
    let colorKey = this.dataKeys.color

    let colorScale = d3.scaleLinear().domain([0, 1])
    if (this.options.colorScale === AUTO_SCALE) {
      colorScale.domain(
        d3.extent(this.data, function(d: any): number {
          return d[colorKey]
        })
      )
    }
    let colorMap = this.colorMap

    let t = d3
      .transition()
      .duration(this.options.transitionTime)
      .ease(d3.easeLinear)

    let arcGenerator = d3
      .arc()
      .innerRadius(function(d: any, i) {
        return axis.radialScale(d[rKey][0])
      })
      .outerRadius(function(d: any, i) {
        return axis.radialScale(d[rKey][1])
      })
      .startAngle(function(d: any, i) {
        return axis.angularScale(d[tKey][0])
      })
      .endAngle(function(d: any, i) {
        return axis.angularScale(d[tKey][1])
      })

    this.group = this.selectGroup(axis, 'chart-range')
    this.group.style('stroke', 'none')

    let elements = this.group.selectAll('path').data(this.data)

    elements.exit().remove()

    let that = this
    let enter = elements
      .enter()
      .append('path')
      .attr('d', arcGenerator)
      .on('pointerover', function(_e: any, d) {
        axis.tooltip.show()
        axis.tooltip.update(that.toolTipFormatterPolar(d))
      })
      .on('pointerout', function() {
        axis.tooltip.hide()
      })

    if (colorKey) {
      enter.style('fill', function(d: any) {
        return colorMap(colorScale(mean(d[colorKey])))
      })
    }

    let update = elements.transition(t).call(arcTween, this.previousData)

    if (colorKey) {
      update.style('fill', function(d: any) {
        return colorMap(colorScale(mean(d[colorKey])))
      })
    }

    this.previousData = {...this.data}
    function arcTween(transition: any, p: any) {
      transition.attrTween('d', function(d: any, i: number, a: any) {
        let old = p[i]
        if (mean(old[tKey]) - mean(d[tKey]) > 180) {
          old[tKey] = old[tKey].map(function(x) {
            return x - 360
          })
        } else if (mean(old[tKey]) - mean(d[tKey]) < -180) {
          old[tKey] = old[tKey].map(function(x) {
            return x + 360
          })
        }

        let tInterpolate = d3.interpolateArray(old[tKey], d[tKey])
        let rInterpolate = d3.interpolateArray(old[rKey], d[rKey])
        return function(t: any) {
          d[tKey] = tInterpolate(t)
          d[rKey] = rInterpolate(t)
          return arcGenerator(d)
        }
      })
    }
  }

  drawLegendSymbol(legendId?: string, asSvgElement?: boolean) {
    let chartElement = this.group
      .select('path')
      .node() as Element
    let style = window.getComputedStyle(chartElement)
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

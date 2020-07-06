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
          return d3.min(d[path])
        })
        let max = d3.max(this._data, function(d: any) {
          if (d[path] === null) return undefined
          return d3.max(d[path])
        })
        this._extent[path] = [min, max]
      }
    }
    return this._extent
  }

  toolTipFormatterCartesian(d) {
    let html = ''
    if (this.options.x.includeInTooltip) {
      if (d.x[0] != d.x[1]) {
        html += 'x: ' + d.x[0].toFixed(2) + '-' + d.x[1].toFixed(2) + '<br/>'
      }
    }
    if (this.options.y.includeInTooltip) {
      if (d.y[0] != d.y[1]) {
        html += 'y: ' + d.y[0].toFixed(2) + '-' + d.y[1].toFixed(2)
      }
    }
    return html
  }

  toolTipFormatterPolar(d) {
    let html = ''
    if (this.options.angular.includeInTooltip) {
      if (d.t[0] != d.t[1]) {
        html += 't: ' + d.t[0].toFixed(0) + '-' + d.t[1].toFixed(0) + '<br/>'
      }
    }
    if (this.options.radial.includeInTooltip) {
      if (d.r[0] != d.r[1]) {
        html += 'r: ' + d.r[0].toFixed(0) + '-' + d.r[1].toFixed(0)
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
      .on('mouseover', function(d: any) {
        axis.showTooltip(that.toolTipFormatterCartesian(d))
      })
      .on('mouseout', function(d: any) {
        axis.hideTooltip(d)
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
    let mappedData: any = this.data.map(function(d: any) {
      return {
        r: d[rKey],
        t: d[tKey],
        color: colorMap(colorScale(mean(d[colorKey])))
      }
    })

    let t = d3
      .transition()
      .duration(this.options.transitionTime)
      .ease(d3.easeLinear)

    let arcGenerator = d3
      .arc()
      .innerRadius(function(d: any, i) {
        return axis.radialScale(d.r[0])
      })
      .outerRadius(function(d: any, i) {
        return axis.radialScale(d.r[1])
      })
      .startAngle(function(d: any, i) {
        return axis.angularScale(d.t[0])
      })
      .endAngle(function(d: any, i) {
        return axis.angularScale(d.t[1])
      })

    this.group = this.selectGroup(axis, 'chart-range')

    let elements = this.group.selectAll('path').data(mappedData)

    elements.exit().remove()

    let that = this
    let enter = elements
      .enter()
      .append('path')
      .attr('d', arcGenerator)
      .on('mouseover', function(d: any) {
        axis.showTooltip(that.toolTipFormatterPolar(d))
      })
      .on('mouseout', function(d: any) {
        axis.hideTooltip(d)
      })

    if (colorKey) {
      enter.style('fill', function(d: any) {
        return d.color
      })
    }

    let update = elements.transition(t).call(arcTween, this.previousData)

    if (colorKey) {
      update.style('fill', function(d: any) {
        return d.color
      })
    }

    this.previousData = mappedData

    function arcTween(transition: any, p: any) {
      transition.attrTween('d', function(d: any, i: number, a: any) {
        let old = p[i]
        if (mean(old.t) - mean(d.t) > 180) {
          old.t = old.t.map(function(x) {
            return x - 360
          })
        } else if (mean(old.t) - mean(d.t) < -180) {
          old.t = old.t.map(function(x) {
            return x + 360
          })
        }

        let tInterpolate = d3.interpolateArray(old.t, d.t)
        let rInterpolate = d3.interpolateArray(old.r, d.r)
        return function(t: any) {
          d.t = tInterpolate(t)
          d.r = rInterpolate(t)
          return arcGenerator(d)
        }
      })
    }
  }

  drawLegendSymbol(entry) {
    let chartElement = this.group
      .select('path')
      .node() as Element
    let style = window.getComputedStyle(chartElement)
    entry
      .append('rect')
      .attr('x', 0)
      .attr('y', -5)
      .attr('width', 20)
      .attr('height', 10)
      .style('fill', style.getPropertyValue('fill'))
  }

}

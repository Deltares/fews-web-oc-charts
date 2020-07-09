import * as d3 from 'd3'
import { CartesianAxis, PolarAxis } from '../Axis'
import { Chart, AUTO_SCALE } from './chart'

function mean(x: number[] | number) {
  if (x instanceof Array) {
    return d3.mean(x)
  }
  return x
}

export class ChartProgress extends Chart {
  private previousData: any[] = []

  set extent(extent: any[]) {
    this._extent = extent
  }

  get extent(): any[] {
    if (!this._extent) {
      this._extent = Array()
      for (let key in this.dataKeys) {
        let path = this.dataKeys[key]
        if (key  === 'radial') {
          this._extent[path] = this._data.map((d) => {return d[path]})
        } else {
          let min = d3.min(this._data, function (d: any) {
            if (d[path] === null) return undefined
            return d3.min(d[path])
          })
          let max = d3.max(this._data, function (d: any) {
            if (d[path] === null) return undefined
            return d3.max(d[path])
          })
          this._extent[path] = [min, max]
        }

      }
    }
    return this._extent
  }

  toolTipFormatterCartesian(d) {
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

  toolTipFormatterPolar(d) {
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

  plotterCartesian (axis: CartesianAxis, dataKeys: any) {
    throw new Error("Not implemented");
  }

  plotterPolar(axis: PolarAxis, dataKeys: any) {
    let canvas = axis.canvas

    let tKey = this.dataKeys.angular
    let rKey = this.dataKeys.radial
    let colorKey = this.dataKeys.color

    const scale = axis.radialScale.copy()
    scale.padding(0.1)

    let colorMap = d3.schemeTableau10

    let t = d3
      .transition()
      .duration(this.options.transitionTime)
      .ease(d3.easeLinear)

    let arcGenerator = d3
      .arc()
      .innerRadius(function(d: any, i) {
        return scale(d[rKey])
      })
      .outerRadius(function(d: any, i) {
        return scale(d[rKey]) + scale.bandwidth()
      })
      .startAngle(function(d: any, i) {
        return axis.angularScale(d[tKey][0])
      })
      .endAngle(function(d: any, i) {
        return axis.angularScale(d[tKey][1])
      })
      // .cornerRadius(scale.bandwidth()/2)
      .cornerRadius(scale.bandwidth()/8)


    this.group = this.selectGroup(axis, 'chart-range')

    let elements = this.group.selectAll('path').data(this.data)

    elements.exit().remove()

    let that = this
    let enter = elements
      .enter()
      .append('path')
      .attr('d', arcGenerator)
      .attr('data-id', (d) => { return d[rKey] })
      .on('mouseover', function(d: any) {
        axis.showTooltip(that.toolTipFormatterPolar(d))
      })
      .on('mouseout', function(d: any) {
        axis.hideTooltip(d)
      })

    if (colorKey) {
      enter
        .style('fill', function(d: any) {
          return colorMap[d[colorKey]]
        })
        .style('stroke', function (d: any) {
          return colorMap[d[colorKey]]
        })
      // if (this.options.style) {
      //   Object.entries(this.options.style).forEach(
      //     ([prop, val]) => enter.style(prop, val))
      // }
    }

    let update = elements.transition(t).call(arcTween, this.previousData)

    if (colorKey) {
      update
        .style('fill', function (d: any) {
          return colorMap[d[colorKey]]
        })
        .style('stroke', function (d: any) {
          return colorMap[d[colorKey]]
        })
      // if (this.options.style) {
      //   Object.entries(this.options.style).forEach(
      //     ([prop, val]) => update.style(prop, val))
      // }
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

  drawLegendSymbol(asSvgElement?: boolean) {
    let chartElement = this.group
      .select('path')
      .node() as Element
    let style = window.getComputedStyle(chartElement)
    const svg = d3.create('svg')
      .attr('width',20)
      .attr('height',20)
    const group = svg
      .append('g')
      .attr('transform', 'translate(10 0)')
    const element = group.append('rect')
      .attr('x', 0)
      .attr('y', -5)
      .attr('width', 20)
      .attr('height', 10)
      .style('fill', style.getPropertyValue('fill'))
    if (asSvgElement) return element.node()
    return svg.node()
  }
}

import * as d3 from 'd3'
import { CartesianAxis, PolarAxis } from '../Axis'
import { Chart, AUTO_SCALE } from './charts'

function mean(x: number[] | number) {
  if (x instanceof Array) {
    return d3.mean(x)
  }
  return x
}

export class ChartRange extends Chart {
  private previousData: any[] = []

  plotterCartesian(axis: CartesianAxis, dataKeys: any) {
    let xkey = dataKeys.xkey ? dataKeys.xkey : 'x'
    let ykey = dataKeys.ykey ? dataKeys.ykey : 'y'
    let colorkey = dataKeys.colorkey

    let colorScale = d3.scaleLinear().domain([0, 1])
    if (this.options.colorScale === AUTO_SCALE) {
      colorScale.domain(
        d3.extent(this.data, function(d: any): number {
          return d[colorkey]
        })
      )
    }

    let colorMap = this.colorMap

    let mappedData: any = this.data.map(function(d: any) {
      return {
        x: d[xkey].map(axis.xScale),
        y: d[ykey].map(axis.yScale),
        color: colorMap(colorScale(mean(d[colorkey])))
      }
    })

    this.group = this.selectGroup(axis, 'chart-range')
    let elements: any = this.group.selectAll('rect').data(mappedData)

    let t = d3
      .transition()
      .duration(this.options.transitionTime)
      .ease(d3.easeLinear)

    // exit
    elements.exit().remove()
    // update + enter
    let update = elements
      .enter()
      .append('rect')
      .attr('x', function(d: any) {
        return d.x[0]
      })
      .attr('y', function(d: any) {
        return d.y[1]
      })
      .attr('width', function(d: any) {
        return d.x[1] - d.x[0]
      })
      .attr('height', function(d: any) {
        return d.y[0] - d.y[1]
      })

    if (colorkey) {
      update.style('fill', function(d: any) {
        return d.color
      })
    }

    let enter = elements
      .transition(t)
      .attr('x', function(d: any) {
        return d.x[0]
      })
      .attr('y', function(d: any) {
        return d.y[1]
      })
      .attr('width', function(d: any) {
        return d.x[1] - d.x[0]
      })
      .attr('height', function(d: any) {
        return d.y[0] - d.y[1]
      })

    if (colorkey) {
      enter.style('fill', function(d: any) {
        return d.color
      })
    }
  }

  plotterPolar(axis: PolarAxis, dataKeys: any) {
    let canvas = axis.canvas

    let tkey = dataKeys.tkey ? dataKeys.tkey : 't'
    let rkey = dataKeys.rkey ? dataKeys.rkey : 'r'
    let colorkey = dataKeys.colorkey

    let colorScale = d3.scaleLinear().domain([0, 1])
    if (this.options.colorScale === AUTO_SCALE) {
      colorScale.domain(
        d3.extent(this.data, function(d: any): number {
          return d[colorkey]
        })
      )
    }
    let colorMap = this.colorMap
    let mappedData: any = this.data.map(function(d: any) {
      return {
        r: d[rkey],
        t: d[tkey],
        color: colorMap(colorScale(mean(d[colorkey])))
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

    let enter = elements
      .enter()
      .append('path')
      .attr('d', arcGenerator)
      .on('mouseover', function(d: any) {
        axis.showTooltip(d)
      })
      .on('mouseout', function(d: any) {
        axis.hideTooltip(d)
      })

    if (colorkey) {
      enter.style('fill', function(d: any) {
        return d.color
      })
    }

    let update = elements.transition(t).call(arcTween, this.previousData)

    if (colorkey) {
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
}

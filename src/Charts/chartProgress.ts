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
    if (!this.extent) {
      this.extent = Array()
      for (let key in this.dataKeys) {
        console.log(key)
        let path = this.dataKeys[key]
        if (key  === 'rkey') {
          this.extent[path] = this.data.map((d) => {return d[path]})
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
    let html = ''
    if (this.options.x.includeInTooltip) {
      if (d.x[0] !== d.x[1]) {
        html += 'x: ' + d.x[0].toFixed(2) + '-' + d.x[1].toFixed(2) + '<br/>'
      }
    }
    if (this.options.y.includeInTooltip) {
      if (d.y[0] !== d.y[1]) {
        html += 'y: ' + d.y[0].toFixed(2) + '-' + d.y[1].toFixed(2)
      }
    }
    return html
  }

  toolTipFormatterPolar(d) {
    let html = ''
    console.log(this.options)
    let format = this.options.t.format
    if (this.options.t.includeInTooltip) {
      if (d.t[0] !== d.t[1]) {
        html += 't: ' + format(d.t[0]) + '-' + format(d.t[1]) + '<br/>'
      }
    }
    if (this.options.r.includeInTooltip) {
      if (d.r[0] !== d.r[1]) {
        html += 'r: ' + d.r
      }
    }
    return html
  }

  plotterCartesian (axis: CartesianAxis, dataKeys: any) {
    throw new Error("Not implemented");
  }

  plotterPolar(axis: PolarAxis, dataKeys: any) {
    let canvas = axis.canvas

    let tkey = dataKeys.tkey ? dataKeys.tkey : 't'
    let rkey = dataKeys.rkey ? dataKeys.rkey : 'r'
    let colorkey = dataKeys.colorkey

    const scale = axis.radialScale.copy()
    scale.padding(0.1)

    let colorMap = d3.schemeTableau10
    let mappedData: any = this.data.map(function(d: any) {
      return {
        r: d[rkey],
        t: d[tkey],
        color: colorMap[d[colorkey]]
      }
    })

    let t = d3
      .transition()
      .duration(this.options.transitionTime)
      .ease(d3.easeLinear)

    let arcGenerator = d3
      .arc()
      .innerRadius(function(d: any, i) {
        console.log(d)
        console.log(scale(d.r))
        return scale(d.r)
      })
      .outerRadius(function(d: any, i) {
        console.log(axis.radialScale.bandwidth())
        return scale(d.r) + scale.bandwidth()
      })
      .startAngle(function(d: any, i) {
        return axis.angularScale(d.t[0])
      })
      .endAngle(function(d: any, i) {
        return axis.angularScale(d.t[1])
      })
      // .cornerRadius(scale.bandwidth()/2)
      .cornerRadius(scale.bandwidth()/8)


    this.group = this.selectGroup(axis, 'chart-range')

    let elements = this.group.selectAll('path').data(mappedData)

    elements.exit().remove()

    let that = this
    let enter = elements
      .enter()
      .append('path')
      .attr('d', arcGenerator)
      .attr('data-id', (d) => { return d.r })
      .on('mouseover', function(d: any) {
        axis.showTooltip(that.toolTipFormatterPolar(d))
      })
      .on('mouseout', function(d: any) {
        axis.hideTooltip(d)
      })

    if (colorkey) {
      enter
        .style('fill', function(d: any) {
          return d.color
        })
        .style('stroke', function (d: any) {
          return d.color
        })
      if (this.options.style) {
        Object.entries(this.options.style).forEach(
          ([prop, val]) => enter.style(prop, val))
      }
    }

    let update = elements.transition(t).call(arcTween, this.previousData)

    if (colorkey) {
      update
        .style('fill', function (d: any) {
          return d.color
        })
        .style('stroke', function (d: any) {
          return d.color
        })
      if (this.options.style) {
        Object.entries(this.options.style).forEach(
          ([prop, val]) => update.style(prop, val))
      }
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

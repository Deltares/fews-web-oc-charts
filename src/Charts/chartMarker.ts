import * as d3 from 'd3'
import { CartesianAxis, PolarAxis } from '../Axis'
import { Chart } from './charts'

function mean(x: number[] | number) {
  if (x instanceof Array) {
    return d3.mean(x)
  }
  return x
}

export class ChartMarker extends Chart {
  private previousData: any[] = []

  plotterCartesian(axis: CartesianAxis, dataKeys: any) {
    const xkey = dataKeys.xkey ? dataKeys.xkey : 'x'
    const ykey = dataKeys.ykey ? dataKeys.ykey : 'y'

    let mappedData = this.mapDataCartesian(axis, dataKeys)
    this.group = this.selectGroup(axis, 'chart-marker')
    let elements = this.group.selectAll('.symbol').data(this.data)
    let symbolId = this.options.symbolId ? this.options.symbolId : 0

    // exit selection
    elements.exit().remove()

    // enter + update selection
    elements
      .enter()
      .append('path')
      .on('mouseover', function(d: any) {
        const v = { x: d[xkey], y: d[ykey] }
        axis.showTooltip(v)
      })
      .on('mouseout', function(d: any) {
        axis.hideTooltip(d)
      })
      .merge(elements)
      .attr('transform', function(d: any, i: number) {
        return 'translate(' + d.x + ',' + d.y + ')'
      })
      .attr('d', d3.symbol().type(d3.symbols[symbolId]))
  }

  plotterPolar(axis: PolarAxis, dataKeys: any) {
    this.group = this.selectGroup(axis, 'chart-marker')
    let symbolId = this.options.symbolId ? this.options.symbolId : 0
    const tkey = dataKeys.tkey ? dataKeys.tkey : 't'
    const rkey = dataKeys.rkey ? dataKeys.rkey : 'r'

    let elements = this.group.selectAll('path').data(this.data)

    function arcTranslation(p) {
      // We only use 'd', but list d,i,a as params just to show can have them as params.
      // Code only really uses d and t.
      return function(d, i, a) {
        let old = p[i]
        if (mean(old[tkey]) - mean(d[tkey]) > 180) {
          old[tkey] = old[tkey] - 360
        } else if (mean(old[tkey]) - mean(d[tkey]) < -180) {
          old[tkey] = old[tkey] + 360
        }
        let tInterpolate = d3.interpolate(old[tkey], d[tkey])
        let rInterpolate = d3.interpolate(old[rkey], d[rkey])
        return function(t) {
          const theta = axis.angularScale(tInterpolate(t))
          const radius = axis.radialScale(rInterpolate(t))
          return 'translate(' + -radius * Math.sin(-theta) + ',' + -radius * Math.cos(-theta) + ')'
        }
      }
    }

    // exit selection
    elements.exit().remove()

    // enter + update selection
    elements
      .enter()
      .append('path')
      .attr('transform', function(d: any, i: number) {
        const r: number = axis.radialScale(d[rkey])
        const t: number = axis.angularScale(d[tkey])
        return 'translate(' + -r * Math.sin(-t) + ',' + -r * Math.cos(-t) + ')'
      })
      .attr('d', d3.symbol().type(d3.symbols[symbolId]))
      .on('mouseover', function(d: any) {
        const v = { r: d[rkey], t: d[tkey] }
        axis.showTooltip(v)
      })
      .on('mouseout', function(d: any) {
        axis.hideTooltip(d)
      })
      .merge(elements)

    let t = d3
      .transition()
      .duration(this.options.transitionTime)
      .ease(d3.easeLinear)

    elements.transition(t).attrTween('transform', arcTranslation(this.previousData))

    this.previousData = this.data
  }
}

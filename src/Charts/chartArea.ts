import * as d3 from 'd3'
import { CartesianAxis, PolarAxis } from '../Axis'
import { Chart, AUTO_SCALE } from './chart'

function mean(x: number[] | number) {
  if (x instanceof Array) {
    return d3.mean(x)
  }
  return x
}

export class ChartArea extends Chart {
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

    var bisectX = d3.bisector(function(d) {
      return d[xkey]
    })
    let i0 = bisectX.right(this.data, axis.xScale.domain()[0])
    let i1 = bisectX.left(this.data, axis.xScale.domain()[1])
    i0 = i0 > 0 ? i0 - 1 : 0
    i1 = i1 < this.data.length - 1 ? i1 + 1 : this.data.length

    let mappedData: any = this.data.slice(i0, i1).map(function(d: any) {
      return {
        x: axis.xScale(d[xkey]),
        y: d[ykey].map(axis.yScale),
        color: colorMap(colorScale(mean(d[colorkey])))
      }
    })

    this.group = this.selectGroup(axis, 'chart-area')
    if (this.group.select('path').size() === 0) {
      this.group.append('path')
    }

    let areaGenerator = d3
      .area()
      .x(function(d: any) {
        return d.x
      })
      .y0(function(d: any) {
        return d.y[0]
      })
      .y1(function(d: any) {
        return d.y[1]
      })

    let elements = this.group.datum(mappedData)

    let area = this.group.select('path')
    area.attr('d', areaGenerator(mappedData))
    area.datum(mappedData)
  }

  plotterPolar(axis: PolarAxis, dataKeys: any) {
    console.error('plotterPolar is not implemented for ChartArea')
  }
}

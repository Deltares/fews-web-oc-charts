import * as d3 from 'd3'
import { CartesianAxis, PolarAxis, AxisIndex } from '../Axis'
import { Chart, AUTO_SCALE } from './chart'

function mean(x: number[] | number) {
  if (x instanceof Array) {
    return d3.mean(x)
  }
  return x
}

export class ChartArea extends Chart {

  set extent(extent: any[]) {
    this._extent = extent
  }

  //FIXME: implement for x-axis
  get extent(): any[] {
    if (!this._extent) {
      this._extent = Array()
      for (let key in this.dataKeys) {
        if (key !== 'y') continue
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

  plotterCartesian(axis: CartesianAxis, axisIndex: AxisIndex) {
    let xKey = this.dataKeys.x
    let yKey = this.dataKeys.y
    let colorKey = this.dataKeys.color
    const xScale = axis.xScale[axisIndex.x.axisIndex]
    const yScale = axis.yScale[axisIndex.y.axisIndex]

    let colorScale = d3.scaleLinear().domain([0, 1])
    if (this.options.colorScale === AUTO_SCALE) {
      colorScale.domain(
        d3.extent(this.data, function(d: any): number {
          return d[colorKey]
        })
      )
    }

    let colorMap = this.colorMap

    let bisectX = d3.bisector(function(d) {
      return d[xKey]
    })
    let i0 = bisectX.right(this.data, xScale.domain()[0])
    let i1 = bisectX.left(this.data, xScale.domain()[1])
    i0 = i0 > 0 ? i0 - 1 : 0
    i1 = i1 < this.data.length - 1 ? i1 + 1 : this.data.length

    let mappedData: any = this.data.slice(i0, i1).map(function(d: any) {
      return {
        [xKey]: xScale(d[xKey]),
        [yKey]: d[yKey].map(yScale),
        color: colorMap(colorScale(mean(d[colorKey])))
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
    return svg.node()
  }
}

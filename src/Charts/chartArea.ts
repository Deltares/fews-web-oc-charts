import * as d3 from 'd3'
import { isNull } from 'lodash-es'
import { CartesianAxes, PolarAxes } from '../index.js'
import { AxisIndex } from '../Axes/axes.js'
import { Chart, AUTO_SCALE } from './chart.js'

export class ChartArea extends Chart {

  set extent(extent: any[]) {
    this._extent = extent
  }

  get extent(): any[] {
    if (!this._extent) {
      this._extent = []
      for (const key in this.dataKeys) {
        const path = this.dataKeys[key]
        this._extent[path] = this.dataExtentFor(key, path)
      }
    }
    return this._extent
  }

  dataExtentFor(key, path) {
    if (key === 'y' && Array.isArray(this._data[0])) {
      const min = d3.min(this._data, function (d: any) {
        if (d[path] === null) return undefined
        return d3.min(d[path])
      })
      const max = d3.max(this._data, function (d: any) {
        if (d[path] === null) return undefined
        return d3.max(d[path])
      })
      return [min, max]
    } else {
      return d3.extent(this._data, (d) => d[path])
    }
  }

  plotterCartesian(axis: CartesianAxes, axisIndex: AxisIndex) {
    const xKey = this.dataKeys.x
    const yKey = this.dataKeys.y
    const colorKey = this.dataKeys.color
    const xScale = axis.xScales[axisIndex.x.axisIndex]
    const yScale = axis.yScales[axisIndex.y.axisIndex]

    const colorScale = d3.scaleLinear().domain([0, 1])
    if (this.options.colorScale === AUTO_SCALE) {
      colorScale.domain(
        d3.extent(this.data, function (d: any): number {
          return d[colorKey]
        })
      )
    }

    const colorMap = this.colorMap

    const bisectX = d3.bisector(function (d) {
      return d[xKey]
    })
    let i0 = bisectX.right(this.data, xScale.domain()[0])
    let i1 = bisectX.left(this.data, xScale.domain()[1])
    i0 = i0 > 0 ? i0 - 1 : 0
    i1 = i1 < this.data.length - 1 ? i1 + 1 : this.data.length

    this.group = this.selectGroup(axis, 'chart-area')
    if (this.group.select('path').size() === 0) {
      this.group.append('path')
    }

    const isArray = Array.isArray(this.data[0][yKey])

    const areaGenerator = d3
      .area()
      .defined((d) => isArray ? !isNull(d[yKey][0]) && !isNull(d[yKey][1]) : !isNull(d[yKey]) )
      .x(function (d: any) {
        return xScale(d[xKey])
      })
      .y0(function (d: any) {
        if (isArray) return yScale(d[yKey][0]) 
        return yScale(0)
      })
      .y1(function (d: any) {
        if (isArray) return yScale(d[yKey][1])
        return yScale(d[yKey])
      })
    const curve = this.curveGenerator
    if (curve !== undefined) {
      areaGenerator.curve(curve)
    }

    const area = this.group.select('path')
      .datum(this.data.slice(i0, i1))
      .join('path')
      .attr('d', areaGenerator)
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  plotterPolar(axis: PolarAxes, dataKeys: any) {
    console.error('plotterPolar is not implemented for ChartArea')
  }

  drawLegendSymbol(legendId?: string, asSvgElement?: boolean) {
    const props = ['fill']
    const source = this.group
      .select('path')
      .node() as Element
    const svg = d3.create('svg')
      .attr('width', 20)
      .attr('height', 20)
    const group = svg
      .append('g')
      .attr('transform', 'translate(0, 10)')
    const element = group.append('rect')
      .attr('x', 0)
      .attr('y', -5)
      .attr('width', 20)
      .attr('height', 10)
    this.applyStyle(source, element, props)
    if (asSvgElement) return element.node()
    return svg.node()
  }
}

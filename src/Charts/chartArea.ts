import * as d3 from 'd3'
import { isNull } from 'lodash-es'
import { CartesianAxes, PolarAxes } from '../index.js'
import { AxisIndex } from '../Axes/axes.js'
import { Chart, AUTO_SCALE, CurveType, PointBisectMethod } from './chart.js'

export class ChartArea extends Chart {
  private _areaGenerator: any

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

    this.highlight = this.selectHighlight(axis, 'path')
    const selection = this.highlight.select('path').style('opacity', 0).style('stroke-width', 1)
    this.highlight
      .append('marker')
      .attr('id', 'marker-' + this.id)
      .attr('viewBox', '-3 -3 6 6')
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('stroke', 'currentColor')
      .attr('orient', 90)
      .append('path')
      .attr('d', 'M0,-3v6')

    let markerType: string | undefined
    switch (this.options.curve) {
      case CurveType.StepAfter:
        break
      case CurveType.StepBefore:
        break
      default:
        markerType = 'tick'
    }

    if (markerType) {
      selection.attr('marker-start', 'url(#marker-' + this.id + ')')
      selection.attr('marker-mid', 'url(#marker-' + this.id + ')')
    }

    const colorScale = d3.scaleLinear().domain([0, 1])
    if (this.options.colorScale === AUTO_SCALE) {
      colorScale.domain(
        d3.extent(this.data, function (d: any): number {
          return d[colorKey]
        })
      )
    }

    const bisectX = d3.bisector(function (d) {
      return d[xKey]
    })
    let i0 = bisectX.right(this.data, xScale.domain()[0])
    let i1 = bisectX.left(this.data, xScale.domain()[1])
    i0 = i0 > 0 ? i0 - 1 : 0
    i1 = i1 < this.data.length - 1 ? i1 + 1 : this.data.length

    this.datum = this.data

    this.group = this.selectGroup(axis, 'chart-area')
    if (this.group.select('path').size() === 0) {
      this.group.append('path')
    }

    const areaGenerator = d3.area().x(function (d: any) {
      return xScale(d[xKey])
    })

    // If y value is an array then use it as y0 and y1, toherwise use y as y1 and 0 as y0
    if (this.data !== undefined && this.data.length > 0 && Array.isArray(this.data[0][yKey])) {
      areaGenerator
        .defined((d) => !isNull(d[yKey][0]) && !isNull(d[yKey][1]))
        .y0(function (d: any) {
          return yScale(d[yKey][0])
        })
        .y1(function (d: any) {
          return yScale(d[yKey][1])
        })
    } else {
      areaGenerator
        .defined((d) => !isNull(d[yKey]))
        .y0(function (d: any) {
          return yScale(0)
        })
        .y1(function (d: any) {
          return yScale(d[yKey])
        })
    }

    const curve = this.curveGenerator
    if (curve !== undefined) {
      areaGenerator.curve(curve)
    }

    this._areaGenerator = areaGenerator

    const area = this.group
      .select('path')
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
    const source = this.group.select('path').node() as Element
    const svg = d3.create('svg').attr('width', 20).attr('height', 20)
    const group = svg.append('g').attr('transform', 'translate(0, 10)')
    const element = group
      .append('rect')
      .attr('x', 0)
      .attr('y', -5)
      .attr('width', 20)
      .attr('height', 10)
    this.applyStyle(source, element, props)
    if (asSvgElement) return element.node()
    return svg.node()
  }

  public onPointerOver() {
    const element = this.group.select('path')
    if (element.node() === null) return
    const color = window.getComputedStyle(element.node() as Element).getPropertyValue('fill')
    this.highlight
      .select('path')
      .style('opacity', 1)
      .style('stroke', 'currentColor')
      .style('fill', color)
      .attr('transform', null)
  }

  public onPointerOut() {
    this.highlight.select('path').style('opacity', 0)
  }

  public onPointerMove(x: number | Date, _xScale, _yScale) {
    let method: PointBisectMethod = 'center'
    if (this.options.curve === CurveType.StepBefore || this.options.curve === CurveType.StepAfter) {
      method = 'right'
    }

    const index = this.findXIndex(x, method)
    const p1 = this.datum[index - 1]
    const p2 = this.datum[index]
    if (p1 === undefined) {
      return
    }
    const datum = [
      {
        x: p1[this.dataKeys.x],
        y: p1[this.dataKeys.y],
      },
      {
        x: p2[this.dataKeys.x],
        y: p2[this.dataKeys.y],
      },
    ]

    const point = this.options.curve === CurveType.StepBefore ? datum[1] : datum[0]

    switch (this.options.curve) {
      case CurveType.StepAfter:
        break
      case CurveType.StepBefore:
        break
      default:
        datum.shift()
    }

    this.highlight.select('path').datum(datum).join('path').attr('d', this._areaGenerator)
    const element = this.group.select('path')
    if (element.node() === null) {
      return { point, style: {} }
    } else {
      const color = window.getComputedStyle(element.node() as Element).getPropertyValue('fill')
      return { point, style: { color } }
    }
  }
}

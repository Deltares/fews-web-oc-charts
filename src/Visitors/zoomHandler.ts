import * as d3 from 'd3'
import { Axis, CartesianAxis } from '../Axis'
import { Visitor } from './visitor'

enum SelectionMode {
  CANCEL = 0,
  X = 1,
  XY = 2,
  Y = 3
}

export class ZoomHandler implements Visitor {
  private brushStartPoint: [number, number]
  private svg: any
  private brushGroup: any
  private mouseGroup: any
  private axis: CartesianAxis
  private x0: any
  private y0: any
  private mode: SelectionMode
  private readonly MINMOVE = 15

  constructor() {}

  visit(axis: Axis) {
    this.axis = axis as CartesianAxis
    this.createHandler(axis as CartesianAxis)
  }

  createHandler(axis: CartesianAxis) {
    if (!this.x0) this.x0 = axis.xScale.domain()
    if (!this.y0) this.y0 = axis.yScale.domain()
    this.svg = axis.canvas
    if (!this.brushGroup) {
      this.brushGroup = this.svg.append('g').attr('class', 'brush')
      this.brushGroup
        .append('rect')
        .attr('class', 'select-rect')
        .attr('visibility', 'hidden')
      this.brushGroup
        .append('rect')
        .attr('class', 'handle east')
        .attr('visibility', 'hidden')
        .attr('height', 2 * this.MINMOVE)
        .attr('width', 4)
      this.brushGroup
        .append('rect')
        .attr('class', 'handle west')
        .attr('visibility', 'hidden')
        .attr('height', 2 * this.MINMOVE)
        .attr('width', 4)
      this.brushGroup
        .append('rect')
        .attr('class', 'handle south')
        .attr('visibility', 'hidden')
        .attr('width', 2 * this.MINMOVE)
        .attr('height', 4)
      this.brushGroup
        .append('rect')
        .attr('class', 'handle north')
        .attr('visibility', 'hidden')
        .attr('width', 2 * this.MINMOVE)
        .attr('height', 4)
    }

    this.mouseGroup = this.svg.select('.mouse-events')
    if (this.mouseGroup.size() === 0) {
      this.mouseGroup = this.svg
        .append('g')
        .attr('class', 'mouse-events')
        .attr('pointer-events', 'all')
      let that = this
      let mouseRect = this.mouseGroup
        .append('rect')
        .attr('class', 'overlay')
        .attr('pointer-events', 'all')
      mouseRect
        .on('mousedown', function() {
          console.log('mousedown')
          that.initSelection(d3.mouse(this))
        })
        .on('mouseup', function() {
          console.log('mouseup')
          that.endSelection(d3.mouse(this))
        })
        .on('dblclick', function() {
          that.resetZoom(d3.mouse(this))
          that.mouseGroup.dispatch('mouseover')
        })
    }
    let mouseRect = this.mouseGroup
      .select('rect')
      .attr('height', this.axis.height)
      .attr('width', this.axis.width)
  }

  initSelection(point: [number, number]) {
    this.brushStartPoint = point
    this.mode = SelectionMode.CANCEL
    let that = this
    this.mouseGroup.dispatch('mouseout')
    this.mouseGroup.select('.overlay').on('mousemove', function() {
      that.updateSelection(d3.mouse(this))
    })
    this.brushGroup
      .select('.select-rect')
      .attr('visibility', 'initial')
      .attr('width', 0)
      .attr('height', 0)
      .attr('x', 0)
      .attr('y', 0)
  }

  updateSelection(point: [number, number]) {
    if (!this.brushStartPoint) return
    let m = [0, 0]
    m[0] = point[0] - this.brushStartPoint[0]
    m[1] = point[1] - this.brushStartPoint[1]
    let x = this.brushStartPoint[0]
    let y = this.brushStartPoint[1]
    let width = Math.abs(m[0])
    let height = Math.abs(m[1])
    let selectRect = this.brushGroup.select('.select-rect')
    if (m[0] < 0) x = this.brushStartPoint[0] + m[0]
    if (m[1] < 0) y = this.brushStartPoint[1] + m[1]
    if (Math.abs(m[0]) <= this.MINMOVE && Math.abs(m[1]) <= this.MINMOVE) {
      this.mode = SelectionMode.CANCEL
      selectRect.attr('visibility', 'hidden')
      this.brushGroup.selectAll('.handle').attr('visibility', 'hidden')
    } else if (Math.abs(m[0]) > this.MINMOVE && Math.abs(m[1]) < this.MINMOVE) {
      this.mode = SelectionMode.X
      selectRect
        .attr('width', width)
        .attr('x', x)
        .attr('y', 0)
        .attr('height', this.axis.height)
        .attr('visibility', 'initial')
      this.brushGroup
        .select('.west')
        .attr('visibility', 'initial')
        .attr('x', x - 4)
        .attr('y', this.brushStartPoint[1] - this.MINMOVE)
      this.brushGroup
        .select('.east')
        .attr('visibility', 'initial')
        .attr('x', x + width)
        .attr('y', this.brushStartPoint[1] - this.MINMOVE)
      this.brushGroup.select('.north').attr('visibility', 'hidden')
      this.brushGroup.select('.south').attr('visibility', 'hidden')
    } else if (Math.abs(m[1]) > this.MINMOVE && Math.abs(m[0]) < this.MINMOVE) {
      this.mode = SelectionMode.Y
      selectRect
        .attr('height', height)
        .attr('y', y)
        .attr('x', 0)
        .attr('width', this.axis.width)
        .attr('visibility', 'initial')
      this.brushGroup
        .select('.north')
        .attr('visibility', 'initial')
        .attr('x', this.brushStartPoint[0] - this.MINMOVE)
        .attr('y', y - 4)
      this.brushGroup
        .select('.south')
        .attr('visibility', 'initial')
        .attr('y', y + height)
        .attr('x', this.brushStartPoint[0] - this.MINMOVE)
      this.brushGroup.select('.east').attr('visibility', 'hidden')
      this.brushGroup.select('.west').attr('visibility', 'hidden')
    } else {
      this.mode = SelectionMode.XY
      selectRect
        .attr('height', height)
        .attr('y', y)
        .attr('x', x)
        .attr('width', width)
        .attr('visibility', 'initial')
      this.brushGroup.selectAll('.handle').attr('visibility', 'hidden')
    }
  }

  endSelection(point: [number, number]) {
    this.mouseGroup.select('.overlay').on('mousemove', null)
    this.brushGroup.select('.select-rect').attr('visibility', 'hidden')
    let xScale = this.axis.xScale
    let yScale = this.axis.yScale
    switch (this.mode) {
      case SelectionMode.X: {
        let xExtent = d3.extent([point[0], this.brushStartPoint[0]].map(xScale.invert))
        this.axis.xScale.domain(xExtent)
        break
      }
      case SelectionMode.Y: {
        let yExtent = d3.extent([point[1], this.brushStartPoint[1]].map(yScale.invert))
        this.axis.yScale.domain(yExtent)
        break
      }
      case SelectionMode.XY: {
        let xExtent = d3.extent([point[0], this.brushStartPoint[0]].map(xScale.invert))
        let yExtent = d3.extent([point[1], this.brushStartPoint[1]].map(yScale.invert))
        this.axis.xScale.domain(xExtent)
        this.axis.yScale.domain(yExtent)
        break
      }
      case SelectionMode.CANCEL: {
        this.brushGroup.selectAll('*').attr('visibility', 'hidden')
        return
      }
      default: {
        return
      }
    }
    this.brushGroup.selectAll('*').attr('visibility', 'hidden')
    this.mouseGroup.dispatch('mouseover')
    this.axis.zoom()
  }

  resetZoom(point: [number, number]) {
    this.axis.xScale.domain(this.x0)
    this.axis.yScale.domain(this.y0)
    this.axis.zoom()
  }
}

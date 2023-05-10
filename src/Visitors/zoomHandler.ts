import * as d3 from 'd3'
import { Axes } from '../Axes/axes.js'
import { CartesianAxes } from '../index.js';
import { Visitor } from './visitor.js'

enum SelectionMode {
  CANCEL = 0,
  X = 1,
  XY = 2,
  Y = 3
}

 export enum WheelMode {
  X = 0,
  XY = 1,
  Y = 2
}

export class ZoomHandler implements Visitor {
  private brushStartPoint: [number, number]
  private brushGroup: any
  private mouseGroup: any
  private axis: CartesianAxes
  private mode: SelectionMode
  private wheelMode: WheelMode
  private readonly MINMOVE = 15
  private lastPoint: [number, number]

  constructor(wheelMode?: WheelMode) {
    this.wheelMode = wheelMode ?? WheelMode.XY
  }
  visit(axis: Axes): void {
    this.axis = axis as CartesianAxes
    this.createHandler(axis as CartesianAxes)
  }
  createHandler(axis: CartesianAxes): void {
    this.mouseGroup = axis.layers.mouse
    const mouseRect = this.mouseGroup.select('rect').attr('pointer-events', 'all')
    this.brushGroup = axis.canvas.insert('g', '.mouse').attr('class', 'brush')
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

    const documentMouseUp = (): void => {
      this.endSelection(null)
      document.removeEventListener('mouseup', documentMouseUp)
    }

    mouseRect
      .on('mousedown', (event) => {
        event.preventDefault()
        this.initSelection(d3.pointer(event))
        document.addEventListener('mouseup', documentMouseUp)
      })
      .on('mouseup', (event) => {
        document.removeEventListener('mouseup', documentMouseUp)
        this.endSelection(d3.pointer(event))
        this.mouseGroup.dispatch('pointerover')
      })
      .on('dblclick', () => {
        this.resetZoom()
        this.mouseGroup.dispatch('pointerover')
      })

    this.axis.svg.on('wheel', (event) => {
        event.preventDefault() // prevent page scrolling
        const delta = event.deltaY 
        const factor = delta > 0 ? 1.1 : 0.9
        this.zoom(factor, d3.pointer(event)) 
        this.axis.svg.dispatch('zoom')
      })
  }  

  private updateAxisScales(scales: Array<any> , coord: number, factor: number): void { 
    for (const scale of scales) {
      const x = scale.invert(coord)
      scale.domain([x - (x - scale.domain()[0]) * factor, x - (x - scale.domain()[1]) * factor])
    }
  }
  
  zoom(factor: number, point: [number, number]): void {  
    switch (this.wheelMode) {
      case WheelMode.X:
        this.updateAxisScales(this.axis.xScale, point[0], factor)
        break
      case WheelMode.Y:
        this.updateAxisScales(this.axis.yScale, point[1], factor)
        break
      case WheelMode.XY:
        this.updateAxisScales(this.axis.xScale, point[0], factor)
        this.updateAxisScales(this.axis.yScale, point[1], factor)
        break
      }
    this.axis.update()
    this.axis.zoom() 
  }
  
  initSelection(point: [number, number]): void {
    this.brushStartPoint = point
    this.lastPoint = null
    this.mode = SelectionMode.CANCEL
    const mouseRect = this.mouseGroup.select('rect')
    this.mouseGroup.dispatch('pointerout')
    mouseRect.on('mousemove', (event) => {
      this.updateSelection(d3.pointer(event))
    })
    this.brushGroup
      .select('.select-rect')
      .attr('visibility', 'initial')
      .attr('width', 0)
      .attr('height', 0)
      .attr('x', 0)
      .attr('y', 0)
  }

  updateSelection(point: [number, number]): void {
    if (!this.brushStartPoint) return
    this.lastPoint = point
    const m = [0, 0]
    m[0] = point[0] - this.brushStartPoint[0]
    m[1] = point[1] - this.brushStartPoint[1]
    let x = this.brushStartPoint[0]
    let y = this.brushStartPoint[1]
    const width = Math.abs(m[0])
    const height = Math.abs(m[1])
    const selectRect = this.brushGroup.select('.select-rect')
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

  endSelection(point: [number, number]): void {
    if (!this.brushStartPoint) return
    point = point !== null ? point : this.lastPoint
    const mouseRect = this.mouseGroup.select('rect')
    mouseRect.on('mousemove', null)
    this.brushGroup.select('.select-rect').attr('visibility', 'hidden')
    switch (this.mode) {
      case SelectionMode.X: {
        for (const key in this.axis.xScale) {
          const scale = this.axis.xScale[key]
          const extent = d3.extent([point[0], this.brushStartPoint[0]].map(scale.invert))
          scale.domain(extent)
        }
        break
      }
      case SelectionMode.Y: {
        for (const key in this.axis.yScale) {
          const scale = this.axis.yScale[key]
          const extent = d3.extent([point[1], this.brushStartPoint[1]].map(scale.invert))
          scale.domain(extent)
        }
        break
      }
      case SelectionMode.XY: {
        for (const key in this.axis.xScale) {
          const scale = this.axis.xScale[key]
          const extent = d3.extent([point[0], this.brushStartPoint[0]].map(scale.invert))
          scale.domain(extent)
        }
        for (const key in this.axis.yScale) {
          const scale = this.axis.yScale[key]
          const extent = d3.extent([point[1], this.brushStartPoint[1]].map(scale.invert))
          scale.domain(extent)
        }
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
    this.mouseGroup.dispatch('pointerover')
    this.axis.zoom()
  }

  resetZoom(): void {
    this.axis.resetZoom()
  }

  redraw(): void {
    this.mouseGroup
      .select('rect')
      .attr('height', this.axis.height)
      .attr('width', this.axis.width)
  }
}

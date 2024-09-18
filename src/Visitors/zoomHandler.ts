import * as d3 from 'd3'
import type { Axes } from '../Axes/axes.js'
import type { CartesianAxes, D3Selection } from '../index.js';
import type { Visitor } from './visitor.js'

const SelectionMode = {
  CANCEL: "CANCEL",
  X: "X",
  XY: "XY",
  Y: "Y"
}
type SelectionMode = typeof SelectionMode[keyof typeof SelectionMode]

export const ZoomMode = {
  X: "X",
  XY: "XY",
  Y: "Y"
}
export type ZoomMode = typeof ZoomMode[keyof typeof ZoomMode]

export enum WheelMode {
  X = 0,
  XY = 1,
  Y = 2,
  NONE = 3
}

export interface ZoomHandlerOptions {
  wheelMode: WheelMode
  sharedZoomMode: ZoomMode
}

function isWheelMode(arg: any): arg is WheelMode {
  return arg in WheelMode
}

type BrushGroup = D3Selection<SVGElement, null>

export class ZoomHandler implements Visitor {
  private brushStartPoint: [number, number]
  private axes: CartesianAxes[]
  private mode: SelectionMode
  private options: ZoomHandlerOptions
  private readonly MINMOVE = 15
  private lastPoint: [number, number]

  constructor(wheelMode?: WheelMode);
  constructor(options?: Partial<ZoomHandlerOptions>);
  constructor(param?: WheelMode | Partial<ZoomHandlerOptions>) {
    this.options = {
      wheelMode: WheelMode.NONE,
      sharedZoomMode: ZoomMode.XY
    }

    if (isWheelMode(param)) {
      this.options.wheelMode = param ?? WheelMode.NONE
    } else {
      this.options = { ...this.options, ...param }
    }

    this.axes = []
  }
  visit(axis: Axes): void {
    this.axes.push(axis as CartesianAxes)
    this.createHandler(axis as CartesianAxes)
  }
  createHandler(axis: CartesianAxes): void {
    const mouseGroup = axis.layers.mouse
    const mouseRect = mouseGroup.select('rect').attr('pointer-events', 'all')
    const brushGroup = axis.canvas.insert('g', '.mouse').attr('class', 'brush')
    brushGroup
      .append('rect')
      .attr('class', 'select-rect')
      .attr('visibility', 'hidden')
    brushGroup
      .append('rect')
      .attr('class', 'handle east')
      .attr('visibility', 'hidden')
      .attr('height', 2 * this.MINMOVE)
      .attr('width', 4)
    brushGroup
      .append('rect')
      .attr('class', 'handle west')
      .attr('visibility', 'hidden')
      .attr('height', 2 * this.MINMOVE)
      .attr('width', 4)
    brushGroup
      .append('rect')
      .attr('class', 'handle south')
      .attr('visibility', 'hidden')
      .attr('width', 2 * this.MINMOVE)
      .attr('height', 4)
    brushGroup
      .append('rect')
      .attr('class', 'handle north')
      .attr('visibility', 'hidden')
      .attr('width', 2 * this.MINMOVE)
      .attr('height', 4)

    const documentMouseUp = (): void => {
      this.axes.forEach((axis) => this.endSelection(axis, mouseGroup, brushGroup, null))
      document.removeEventListener('mouseup', documentMouseUp)
    }

    mouseRect
      .on('mousedown', (event: MouseEvent) => {
        event.preventDefault()
        this.axes.forEach((axis) => this.initSelection(axis, mouseGroup, brushGroup, d3.pointer(event)))
        document.addEventListener('mouseup', documentMouseUp)
      })
      .on('mouseup', (event: MouseEvent) => {
        document.removeEventListener('mouseup', documentMouseUp)
        this.endSelection(axis, mouseGroup, brushGroup, d3.pointer(event))
        this.axes.forEach((axis) => {
          this.dispatchZoomEvent(axis)
        })
        mouseGroup.dispatch('pointerover')
      })
      .on('dblclick', () => {
        this.axes.forEach((axis) => this.resetZoom(axis))
        mouseGroup.dispatch('pointerover')
      })

      if (this.options.wheelMode !== WheelMode.NONE) {
        mouseRect.on('wheel', (event: WheelEvent) => {
          event.preventDefault() // prevent page scrolling
          const delta = event.deltaY
          const factor = delta > 0 ? 1.1 : 0.9
          this.zoom(axis, factor, d3.pointer(event))
          this.axes.forEach((axis) => {
            this.dispatchZoomEvent(axis)
          })
        })
      }
  }

  private dispatchZoomEvent(axis: CartesianAxes) {
    const zoomEvent = new CustomEvent('zoom', { detail: {
      'xScalesDomains': axis.xScalesDomains,
      'yScalesDomains': axis.yScalesDomains
    }})

    axis.container.dispatchEvent(zoomEvent)
  }

  private updateZoomAxisScales(scales: Array<any> , coord: number, factor: number): void {
    for (const scale of scales) {
      const x = scale.invert(coord)
      scale.domain([x - (x - scale.domain()[0]) * factor, x - (x - scale.domain()[1]) * factor])
    }
  }

  zoom(axis: CartesianAxes, factor: number, point: [number, number]): void {
    const updateXScales = () => {
      const axes = [ZoomMode.X, ZoomMode.XY].includes(this.options.sharedZoomMode) ?
        this.axes : [axis]
      axes.forEach((axis) => this.updateZoomAxisScales(axis.xScales, point[0], factor))
    }
    const updateYScales = () => {
      const axes = [ZoomMode.Y, ZoomMode.XY].includes(this.options.sharedZoomMode) ?
        this.axes : [axis]
      axes.forEach((axis) => this.updateZoomAxisScales(axis.yScales, point[1], factor))
    }
    switch (this.options.wheelMode) {
      case WheelMode.X:
        updateXScales()
        break
      case WheelMode.Y:
        updateYScales()
        break
      case WheelMode.XY:
        updateXScales()
        updateYScales()
        break
      case WheelMode.NONE:
        break
    }
    this.axes.forEach((axis) => {
      axis.update()
      axis.zoom()
    })
  }

  initSelection(axis: Axes, mouseGroup: any, brushGroup: BrushGroup, point: [number, number]): void {
    this.brushStartPoint = point
    this.lastPoint = null
    this.mode = SelectionMode.CANCEL
    const mouseRect = mouseGroup.select('rect')
    mouseGroup.dispatch('pointerout')
    mouseRect.on('mousemove', (event: MouseEvent) => {
      this.updateSelection(axis, brushGroup, d3.pointer(event))
    })
    brushGroup
      .select('.select-rect')
      .attr('visibility', 'initial')
      .attr('width', 0)
      .attr('height', 0)
      .attr('x', 0)
      .attr('y', 0)
  }

  updateSelection(axis: Axes, brushGroup: BrushGroup, point: [number, number]): void {
    if (!this.brushStartPoint) return
    this.lastPoint = point
    const m = [0, 0]
    m[0] = point[0] - this.brushStartPoint[0]
    m[1] = point[1] - this.brushStartPoint[1]
    let x = this.brushStartPoint[0]
    let y = this.brushStartPoint[1]
    const width = Math.abs(m[0])
    const height = Math.abs(m[1])
    const selectRect = brushGroup.select('.select-rect')
    if (m[0] < 0) x = this.brushStartPoint[0] + m[0]
    if (m[1] < 0) y = this.brushStartPoint[1] + m[1]
    if (Math.abs(m[0]) <= this.MINMOVE && Math.abs(m[1]) <= this.MINMOVE) {
      this.mode = SelectionMode.CANCEL
      selectRect.attr('visibility', 'hidden')
      brushGroup.selectAll('.handle').attr('visibility', 'hidden')
    } else if (Math.abs(m[0]) > this.MINMOVE && Math.abs(m[1]) < this.MINMOVE) {
      this.mode = SelectionMode.X
      selectRect
        .attr('width', width)
        .attr('x', x)
        .attr('y', 0)
        .attr('height', axis.height)
        .attr('visibility', 'initial')
      brushGroup
        .select('.west')
        .attr('visibility', 'initial')
        .attr('x', x - 4)
        .attr('y', this.brushStartPoint[1] - this.MINMOVE)
      brushGroup
        .select('.east')
        .attr('visibility', 'initial')
        .attr('x', x + width)
        .attr('y', this.brushStartPoint[1] - this.MINMOVE)
      brushGroup.select('.north').attr('visibility', 'hidden')
      brushGroup.select('.south').attr('visibility', 'hidden')
    } else if (Math.abs(m[1]) > this.MINMOVE && Math.abs(m[0]) < this.MINMOVE) {
      this.mode = SelectionMode.Y
      selectRect
        .attr('height', height)
        .attr('y', y)
        .attr('x', 0)
        .attr('width', axis.width)
        .attr('visibility', 'initial')
      brushGroup
        .select('.north')
        .attr('visibility', 'initial')
        .attr('x', this.brushStartPoint[0] - this.MINMOVE)
        .attr('y', y - 4)
      brushGroup
        .select('.south')
        .attr('visibility', 'initial')
        .attr('y', y + height)
        .attr('x', this.brushStartPoint[0] - this.MINMOVE)
      brushGroup.select('.east').attr('visibility', 'hidden')
      brushGroup.select('.west').attr('visibility', 'hidden')
    } else {
      this.mode = SelectionMode.XY
      selectRect
        .attr('height', height)
        .attr('y', y)
        .attr('x', x)
        .attr('width', width)
        .attr('visibility', 'initial')
      brushGroup.selectAll('.handle').attr('visibility', 'hidden')
    }
  }

  private updateAxisScales(scales: Array<any> , point: [number, number], index: number): void {
    for (const scale of scales) {
      const extent = d3.extent([point[index], this.brushStartPoint[index]].map(scale.invert))
      scale.domain(extent)
    }
  }

  endSelection(axis: CartesianAxes, mouseGroup: any, brushGroup: BrushGroup, point: [number, number]): void {
    if (!this.brushStartPoint) return
    point = point !== null ? point : this.lastPoint
    const mouseRect = mouseGroup.select('rect')
    mouseRect.on('mousemove', null)
    brushGroup.select('.select-rect').attr('visibility', 'hidden')
    const updateXScales = () => {
      const axes = [ZoomMode.X, ZoomMode.XY].includes(this.options.sharedZoomMode) ?
        this.axes : [axis]
      axes.forEach((axis) => this.updateAxisScales(axis.xScales, point, 0))
    }
    const updateYScales = () => {
      const axes = [ZoomMode.Y, ZoomMode.XY].includes(this.options.sharedZoomMode) ?
        this.axes : [axis]
      axes.forEach((axis) => this.updateAxisScales(axis.yScales, point, 1))
    }
    switch (this.mode) {
      case SelectionMode.X: {
        updateXScales()
        break
      }
      case SelectionMode.Y: {
        updateYScales()
        break
      }
      case SelectionMode.XY: {
        updateXScales()
        updateYScales()
        break
      }
      case SelectionMode.CANCEL: {
        brushGroup.selectAll('*').attr('visibility', 'hidden')
        return
      }
      default: {
        return
      }
    }
    brushGroup.selectAll('*').attr('visibility', 'hidden')
    mouseGroup.dispatch('pointerover')
    this.axes.forEach((axis) => axis.zoom())
  }

  resetZoom(axis: Axes): void {
    axis.resetZoom()
  }

  redraw(): void {
    this.axes.forEach((axis) => {
      const mouseGroup = axis.layers.mouse
      mouseGroup
        .select('rect')
        .attr('height', axis.height)
        .attr('width', axis.width)
    })
  }
}

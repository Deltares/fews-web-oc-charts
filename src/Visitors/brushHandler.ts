import * as d3 from 'd3'

import { Axes, CartesianAxes } from '../Axes'
import { Visitor } from './visitor'
import { defaultsDeep } from 'lodash-es'

export const BrushMode = {
  X: 'X',
  Y: 'Y',
  XY: 'XY',
}
export type BrushMode = (typeof BrushMode)[keyof typeof BrushMode]

export interface BrushHandlerOptions {
  brushMode: BrushMode
}

const defaultBrushHandlerOptions: BrushHandlerOptions = {
  brushMode: BrushMode.X,
}

type Domain = [number, number] | [Date, Date]

export class BrushHandler implements Visitor {
  private labels: {
    x?: d3.Selection<SVGTextElement, unknown, SVGGElement, unknown>
    y?: d3.Selection<SVGTextElement, unknown, SVGGElement, unknown>
  }
  private axes: CartesianAxes[] = []
  private options: BrushHandlerOptions

  constructor(options?: Partial<BrushHandlerOptions>) {
    this.options = defaultsDeep({}, options, defaultBrushHandlerOptions)
    this.labels = {}
  }

  visit(axes: Axes): void {
    if (!(axes instanceof CartesianAxes)) {
      throw new Error('Brush handler is only supported on Cartesian axes.')
    }

    this.createHandler(axes)
  }

  addAxes(axes: Axes): void {
    if (!(axes instanceof CartesianAxes)) {
      throw new Error('Brush handler is only supported on Cartesian axes.')
    }
    this.axes.push(axes)
  }

  private createHandler(axes: CartesianAxes) {
    this.createLabels(axes)

    const brushed = ({ selection }) => {
      if (!(axes instanceof CartesianAxes)) {
        throw new Error('Brush handler is only supported on Cartesian axes.')
      }
      if (!selection) return

      const updateLabelsForAxis = (axisKey: 'x' | 'y', range: [number, number]) => {
        const scale = axes.getScale(axisKey, 0)
        this.updateLabels(
          axisKey,
          range.map((value: number) => ({
            value,
            text: scale.invert(value),
          })),
        )
      }

      const updateDomainForAxis = (axisKey: 'x' | 'y', range: [number, number]) => {
        const scale = axes.getScale(axisKey, 0)
        const extent = range.map(scale.invert, scale) as Domain
        this.axes.forEach((axis) => {
          axis.setDomain(axisKey, 0, extent)
          axis.update()
          axis.zoom()
        })
      }

      const updateForAxis = (axisKey: 'x' | 'y', range: [number, number]) => {
        updateLabelsForAxis(axisKey, range)
        updateDomainForAxis(axisKey, range)
      }

      if (this.options.brushMode === BrushMode.X) {
        updateForAxis('x', selection)
      }

      if (this.options.brushMode === BrushMode.Y) {
        updateForAxis('y', selection)
      }

      if (this.options.brushMode === BrushMode.XY) {
        updateForAxis(
          'x',
          selection.map((s: number[]) => s[0]),
        )
        updateForAxis(
          'y',
          selection.map((s: number[]) => s[1]),
        )
      }
    }
    const debouncedBrushed = debounce(brushed)

    const brushended = ({ selection }) => {
      if (selection) return

      this.hideLabels()
      this.axes.forEach((axis) => axis.resetZoom())
    }

    const brush = getBrush(this.options.brushMode)
      .extent([
        [0, 0],
        [axes.width, axes.height],
      ])
      .on('brush', debouncedBrushed)
      .on('end', brushended)

    axes.canvas.append('g').call(brush)
  }

  private createLabels(axes: CartesianAxes) {
    const labelG = axes.canvas.append('g').attr('class', 'brush-labels')

    const addLabel = (x: number, y: number, textAnchor: string) => {
      return labelG
        .append('text')
        .attr('x', x)
        .attr('y', y)
        .attr('text-anchor', textAnchor)
        .attr('fill', 'none')
        .node()
    }

    if (this.options.brushMode === BrushMode.X || this.options.brushMode === BrushMode.XY) {
      this.labels.x = d3.selectAll([
        addLabel(0, axes.height + 20, 'end'),
        addLabel(0, axes.height + 20, 'start'),
      ])
    }

    if (this.options.brushMode === BrushMode.Y || this.options.brushMode === BrushMode.XY) {
      this.labels.y = d3.selectAll([
        addLabel(axes.width, 0, 'start'),
        addLabel(axes.width, 0, 'start'),
      ])
    }
  }

  private updateLabels(axisKey: 'x' | 'y', selection: { value: number; text: string }[]) {
    this.labels[axisKey]
      ?.attr('fill', 'black')
      .data(selection)
      .attr(axisKey, (d) => d.value)
      .text((d) => d.text)
  }

  private hideLabels() {
    this.labels.x?.attr('fill', 'none').text('')
    this.labels.y?.attr('fill', 'none').text('')
  }

  redraw(): void {}
}

function getBrush(mode: BrushMode) {
  switch (mode) {
    case BrushMode.X:
      return d3.brushX()
    case BrushMode.Y:
      return d3.brushY()
    case BrushMode.XY:
      return d3.brush()
    default:
      throw new Error(`Unknown brush mode: ${mode}`)
  }
}

function debounce(fn: Function) {
  let frame: number
  return function (...args: any[]) {
    if (frame) cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => {
      fn.apply(this, args)
    })
  }
}

import * as d3 from 'd3'

import { Axes, CartesianAxes } from '../Axes'
import { Visitor } from './visitor'
import { defaultsDeep, isEqual } from 'lodash-es'

export const BrushMode = {
  X: 'X',
  Y: 'Y',
  XY: 'XY',
}
export type BrushMode = (typeof BrushMode)[keyof typeof BrushMode]

export interface BrushHandlerOptions {
  brushMode: BrushMode
  domain: Domains
}

const defaultBrushHandlerOptions: BrushHandlerOptions = {
  brushMode: BrushMode.X,
  domain: {},
}

type Domain = [number, number] | [Date, Date]
type Domains = { x?: Domain; y?: Domain }

export interface BrushDomainChangeEvent {
  old: Domain
  new: Domain
}

export type BrushHandlerEventType = 'update:x-brush-domain'
export type BrushDomainChangeCallback = (event: BrushDomainChangeEvent) => void

export class BrushHandler implements Visitor {
  private labels: {
    x?: d3.Selection<SVGTextElement, unknown, SVGGElement, unknown>
    y?: d3.Selection<SVGTextElement, unknown, SVGGElement, unknown>
  }
  private axis: CartesianAxes | null = null
  private options: BrushHandlerOptions
  private brush: d3.BrushBehavior<unknown> | null = null
  private brushGroup: d3.Selection<SVGGElement, unknown, SVGGElement, unknown> | null = null
  private lastDomainUpdate: Domains = {}
  private domainChangeCallbacks: BrushDomainChangeCallback[] = []

  constructor(options?: Partial<BrushHandlerOptions>) {
    this.options = defaultsDeep({}, options, defaultBrushHandlerOptions)
    this.labels = {}
  }

  visit(axes: Axes): void {
    if (!(axes instanceof CartesianAxes)) {
      throw new Error('Brush handler is only supported on Cartesian axes.')
    }

    this.axis = axes
    this.createHandler(axes)
    // Requires a timeout to ensure the brush is created before updating the domain
    setTimeout(() => {
      this.setBrushDomain(this.options.domain)
    })
  }

  addEventListener(_event: BrushHandlerEventType, callback: BrushDomainChangeCallback) {
    this.domainChangeCallbacks.push(callback)
  }

  removeEventListener(_event: BrushHandlerEventType, callback: BrushDomainChangeCallback) {
    // Remove only the specified callback from the list of callbacks; this is a no-op
    // if the specified callback does not exist.
    this.domainChangeCallbacks = this.domainChangeCallbacks.filter((entry) => entry !== callback)
  }

  setBrushDomain(domains: Domains): void {
    if (!this.brush || !this.brushGroup) {
      throw new Error('Brush has not been created yet.')
    }

    this.lastDomainUpdate = domains

    // TODO: Add support for other brush modes
    if (this.options.brushMode === BrushMode.X && domains.x) {
      const xScale = this.axis?.getScale('x', 0)
      if (xScale) {
        const domain: number[] = domains.x.map(xScale)

        // Clamp the domain to the scale range
        domain[0] = Math.max(domain[0], xScale.range()[0])
        domain[1] = Math.min(domain[1], xScale.range()[1])

        this.brushGroup.call(this.brush.move, domain as d3.BrushSelection)
      }
    }
  }

  private createHandler(axes: CartesianAxes) {
    this.createLabels(axes)

    const brushed = ({ selection, sourceEvent }) => {
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
        const oldDomain = scale.domain()
        const newDomain = range.map(scale.invert, scale) as Domain

        if (
          sourceEvent &&
          axisKey === 'x' &&
          this.domainChangeCallbacks.length > 0 &&
          !isEqual(oldDomain, newDomain)
        ) {
          const event: BrushDomainChangeEvent = {
            old: oldDomain,
            new: newDomain,
          }

          this.domainChangeCallbacks.forEach((callback) => callback(event))
        }
      }

      const updateForAxis = (axisKey: 'x' | 'y', range: [number, number]) => {
        updateLabelsForAxis(axisKey, range)
        updateDomainForAxis(axisKey, range)
      }

      if (this.options.brushMode === BrushMode.X) {
        updateForAxis('x', selection)
      }

      if (this.options.brushMode === BrushMode.Y) {
        updateForAxis('y', selection.toReversed())
      }

      if (this.options.brushMode === BrushMode.XY) {
        updateForAxis(
          'x',
          selection.map((s: number[]) => s[0]),
        )
        updateForAxis('y', selection.map((s: number[]) => s[1]).toReversed())
      }
    }
    const brushended = ({ selection }) => {
      if (selection) return

      this.hideLabels()
      this.setBrushDomain(this.lastDomainUpdate)
    }

    this.brush = getBrush(this.options.brushMode)
      .extent([
        [0, 0],
        [axes.width, axes.height],
      ])
      .on('brush', brushed)
      .on('end', brushended)

    this.brushGroup = axes.canvas.append('g').call(this.brush)
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

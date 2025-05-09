import * as d3 from 'd3'

import { Axes, CartesianAxes } from '../Axes'
import { Visitor } from './visitor'
import { LayerKeys } from '../Layers/layers'

type SelectionNoData<T extends SVGElement> = d3.Selection<T, undefined, null, undefined>

type AxisScale =
  | d3.ScaleLinear<number, number>
  | d3.ScaleTime<number, number>
  | d3.ScaleBand<string>

function isScaleBand(scale: AxisScale): scale is d3.ScaleBand<string> {
  return 'paddingInner' in scale
}

export enum PanningDirection {
  X = 'x',
  Y = 'y',
  XY = 'xy',
}

function isPannableDirection(axisKey: 'x' | 'y', direction: PanningDirection): boolean {
  return direction.includes(axisKey)
}

export interface PanHandlerOptions {
  mouseButton?: number
  direction?: PanningDirection
  startEnabled?: boolean
  changeCursor?: boolean
  notPanningCursor?: string
  panningCursor?: string
}

export class PanHandler implements Visitor {
  private allAxes: CartesianAxes[]
  private enabled: boolean

  private mouseButton: number
  private direction: PanningDirection

  private changeCursor: boolean
  private notPanningCursor: string
  private panningCursor: string

  constructor(options?: PanHandlerOptions) {
    this.allAxes = []
    this.enabled = options?.startEnabled ?? true

    this.mouseButton = options?.mouseButton ?? 1
    this.direction = options?.direction ?? PanningDirection.XY

    this.changeCursor = options?.changeCursor ?? true
    this.notPanningCursor = options?.notPanningCursor ?? 'grab'
    this.panningCursor = options?.panningCursor ?? 'grabbing'
  }

  visit(axes: Axes): void {
    if (!(axes instanceof CartesianAxes)) {
      throw new Error('Panning is only supported on Cartesian axes.')
    }
    this.allAxes.push(axes)
    if (this.enabled) this.enablePanning(axes)
  }

  redraw(): void {}

  isEnabled(): boolean {
    return this.enabled
  }

  enable(): void {
    if (!this.enabled) {
      this.allAxes.forEach((axes) => this.enablePanning(axes))
    }
    this.enabled = true
  }

  disable(): void {
    if (this.enabled) {
      this.allAxes.forEach((axes) => this.disablePanning(axes))
    }
    this.enabled = false
  }

  private enablePanning(axes: CartesianAxes): void {
    const mouseRect = getLayerRect(axes, 'mouse')
    if (this.changeCursor) {
      // Change cursor to "not panning" cursor.
      mouseRect.node().style.cursor = this.notPanningCursor
    }
    // Add mousedown listener to start panning.
    mouseRect.on('mousedown.pan', (event) => this.onMouseDown(event))
  }

  private disablePanning(axes: CartesianAxes): void {
    const mouseRect = getLayerRect(axes, 'mouse')
    if (this.changeCursor) {
      // Change cursor to default cursor.
      mouseRect.node().style.cursor = ''
    }
    // Disable mousedown listener.
    mouseRect.on('mousedown.pan', null)
  }

  private onMouseDown(clickEvent: MouseEvent): void {
    if (clickEvent.button !== this.mouseButton) return

    const mouseRectElement = clickEvent.target as SVGRectElement

    if (this.changeCursor) {
      // Change cursor while dragging.
      mouseRectElement.style.cursor = this.panningCursor
    }

    // Add a mousemove listener to pan the chart while dragging.
    const startPoint = d3.pointer(clickEvent, mouseRectElement)
    const axisUpdateCallbacks = this.allAxes.flatMap((axes) =>
      this.createAxisUpdateCallbacks(axes, startPoint),
    )
    const mouseMoveCallback = (moveEvent: MouseEvent) => {
      const currentPoint = d3.pointer(moveEvent, mouseRectElement)
      // Update the domains for all axes.
      axisUpdateCallbacks.forEach((callback) => callback(currentPoint))
      // Redraw the axes without updating axis scales, cryptically named zoom().
      this.allAxes.forEach((axes) => axes.zoom())
    }
    window.addEventListener('mousemove', mouseMoveCallback)

    // On mouseup, stop panning by removing the mousemove listener.
    window.addEventListener(
      'mouseup',
      () => {
        window.removeEventListener('mousemove', mouseMoveCallback)
        if (this.changeCursor) {
          mouseRectElement.style.cursor = this.notPanningCursor
        }
      },
      { once: true },
    )
  }

  private createAxisUpdateCallbacks(
    axes: CartesianAxes,
    startPointScreen: [number, number],
  ): ((currentPoint: [number, number]) => void)[] {
    // Create a callback for each axis (x- and y-axes on both sides) to update
    // the domain based on the current drag starting point.
    const callbacks: ((currentPointScreen: [number, number]) => void)[] = []
    for (const axisKey of ['x', 'y'] as ('x' | 'y')[]) {
      // If we are not panning in the specified direction, do not add an axis
      // update callback for that direction.
      if (!isPannableDirection(axisKey, this.direction)) continue

      const startCoordScreen = getCoord(axisKey, startPointScreen)

      for (const axisIndex of [0, 1] as (0 | 1)[]) {
        const scale = axes.getScale(axisKey, axisIndex) as AxisScale
        if (!scale) continue

        // We currently do not support panning for band scales.
        if (isScaleBand(scale)) continue

        // Make a copy of the original scale, as we would otherwise use a
        // reference to the scale we are mutating in the callback.
        const originalScale = scale.copy()

        // Always convert dates to timestamps.
        const originalDomain = originalScale.domain().map(convertCoordToNumber)
        const startCoordDomain = convertCoordToNumber(originalScale.invert(startCoordScreen))

        // Create a callback to update the axis domain based on the starting
        // point of the dragging motion.
        const axisUpdateCallback = (currentPoint: [number, number]) => {
          // Compute how much we moved our mouse in the original domain.
          const currentCoord = getCoord(axisKey, currentPoint)
          const currentCoordDomain = convertCoordToNumber(originalScale.invert(currentCoord))

          // Move the by the difference between the start coordinate and the
          // current coordinate in the original domain.
          const diffInDomain = startCoordDomain - currentCoordDomain
          const newDomain = originalDomain.map((value: number) => value + diffInDomain)

          // We always set the new domain as numbers; timestamps also work for
          // setting time domains.
          axes.setDomain(axisKey, axisIndex, newDomain as [number, number])
        }
        callbacks.push(axisUpdateCallback)
      }
    }
    return callbacks
  }
}

function getLayerRect(axes: CartesianAxes, layer: LayerKeys): SelectionNoData<SVGRectElement> {
  const mouseLayer = axes.layers[layer] as SelectionNoData<SVGGElement>
  return mouseLayer.select<SVGRectElement>('rect')
}

function getCoord(axisKey: 'x' | 'y', point: [number, number]): number {
  return axisKey === 'x' ? point[0] : point[1]
}

function convertCoordToNumber(coord: number | Date): number {
  return coord instanceof Date ? coord.getTime() : coord
}

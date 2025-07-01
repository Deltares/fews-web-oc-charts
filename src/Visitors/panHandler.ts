import * as d3 from 'd3'

import { Axes, CartesianAxes } from '../Axes'
import { Visitor } from './visitor'
import { LayerKeys } from '../Layers/layers'
import { isModifierKeyPress, ModifierKey } from '../Utils'

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

export enum MouseButton {
  Left = 0,
  Middle = 1,
  // No support for other mouse buttons as overriding the right mouse button is
  // tricky in browsers and other buttons are not likely to be present.
}

function isMouseButtonPress(event: MouseEvent, button: MouseButton): boolean {
  if (button === MouseButton.Left) {
    return event.button === 0
  } else {
    return event.button === 1
  }
}

function isPannableDirection(axisKey: 'x' | 'y', direction: PanningDirection): boolean {
  return direction.includes(axisKey)
}

export interface PanHandlerOptions {
  mouseButton?: MouseButton
  modifierKey?: ModifierKey
  direction?: PanningDirection
  startEnabled?: boolean
  changeHoveringCursor?: boolean
  changePanningCursor?: boolean
  hoveringCursor?: string
  panningCursor?: string
}

export class PanHandler implements Visitor {
  private id: string

  private allAxes: CartesianAxes[]
  private enabled: boolean

  private isPanningEnabled: boolean
  private isPanning: boolean

  private mouseButton: MouseButton
  private modifierKey: ModifierKey

  private direction: PanningDirection

  private changeHoveringCursor: boolean
  private changePanningCursor: boolean
  private hoveringCursor: string
  private panningCursor: string

  private keyDownCallback: (event: KeyboardEvent) => void
  private keyUpCallback: (event: KeyboardEvent) => void

  constructor(options?: PanHandlerOptions) {
    this.id = Math.random().toString(36).substring(2, 18)

    this.allAxes = []
    this.enabled = false
    this.isPanning = false

    this.mouseButton = options?.mouseButton ?? MouseButton.Middle
    this.modifierKey = options?.modifierKey ?? ModifierKey.None

    this.direction = options?.direction ?? PanningDirection.XY

    this.changeHoveringCursor = options?.changeHoveringCursor ?? true
    this.changePanningCursor = options?.changePanningCursor ?? true

    this.hoveringCursor = options?.hoveringCursor ?? 'grab'
    this.panningCursor = options?.panningCursor ?? 'grabbing'

    this.keyDownCallback = (event) => this.onKeyDown(event)
    this.keyUpCallback = (event) => this.onKeyUp(event)

    const startEnabled = options?.startEnabled ?? true
    if (startEnabled) this.enable()
  }

  private get mouseDownHandlerId(): string {
    return `mousedown.${this.id}`
  }

  visit(axes: Axes): void {
    if (!(axes instanceof CartesianAxes)) {
      throw new Error('Panning is only supported on Cartesian axes.')
    }
    this.allAxes.push(axes)
    if (this.enabled && this.modifierKey === ModifierKey.None) {
      this.enablePanningForAxes(axes)
    }
  }

  redraw(): void {}

  isEnabled(): boolean {
    return this.enabled
  }

  enable(): void {
    this.enabled = true
    if (this.modifierKey === ModifierKey.None) {
      this.enablePanning()
    } else {
      // Add listener for the modifier key to enable panning.
      window.addEventListener('keydown', this.keyDownCallback)
    }
  }

  disable(): void {
    this.enabled = false
    this.disablePanning()
    window.removeEventListener('keydown', this.keyDownCallback)
  }

  destroy(): void {
    window.removeEventListener('keydown', this.keyDownCallback)
    window.removeEventListener('keyup', this.keyUpCallback)
    // The 'mousemove' window event listener will always be removed in the
    // 'mouseup' event listener (which itself is removed after 1 call).
  }

  private enablePanning(): void {
    this.allAxes.forEach((axes) => this.enablePanningForAxes(axes))
    this.isPanningEnabled = true
  }

  private disablePanning(): void {
    this.allAxes.forEach((axes) => this.disablePanningForAxes(axes))
    this.isPanningEnabled = false
  }

  private enablePanningForAxes(axes: CartesianAxes): void {
    const mouseRect = getLayerRect(axes, 'mouse')
    if (this.changeHoveringCursor) {
      // Change cursor to "hovering" cursor.
      mouseRect.node().style.cursor = this.hoveringCursor
    }
    // Add mousedown listener (with a unique ID) to start panning.
    mouseRect.on(this.mouseDownHandlerId, (event) => this.onMouseDown(event))
  }

  private disablePanningForAxes(axes: CartesianAxes): void {
    const mouseRect = getLayerRect(axes, 'mouse')
    if (this.changeHoveringCursor && !this.isPanning) {
      // Change cursor to default cursor if we are not panning. If we are
      // currently panning, the cursor will be changed back in the mouseup
      // listener.
      mouseRect.node().style.cursor = ''
    }
    // Disable mousedown listener.
    mouseRect.on(this.mouseDownHandlerId, null)
  }

  private onKeyDown(keyboardEvent: KeyboardEvent): void {
    if (!isModifierKeyPress(keyboardEvent, this.modifierKey)) return
    window.addEventListener('keyup', this.keyUpCallback)
    window.removeEventListener('keydown', this.keyDownCallback)
    // Also check whether the window loses focus, since Windows might highjack
    // the keyup event, so we stay in a panning state. Just disable panning if
    // we lose focus.
    window.addEventListener('blur', () => this.disablePanning(), { once: true })
    this.enablePanning()
  }

  private onKeyUp(keyboardEvent: KeyboardEvent): void {
    if (!isModifierKeyPress(keyboardEvent, this.modifierKey)) return
    window.removeEventListener('keyup', this.keyUpCallback)
    window.addEventListener('keydown', this.keyDownCallback)
    this.disablePanning()
  }

  private onMouseDown(clickEvent: MouseEvent): void {
    if (!isMouseButtonPress(clickEvent, this.mouseButton)) return

    this.isPanning = true

    const mouseRectElement = clickEvent.target as SVGRectElement
    if (this.changePanningCursor) {
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
        this.isPanning = false
        if (this.changePanningCursor) {
          mouseRectElement.style.cursor =
            this.changeHoveringCursor && this.isPanningEnabled ? this.hoveringCursor : ''
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
        const isTimeScale = originalScale.domain()[0] instanceof Date
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

          // Set the domain as the appropriate type; setting a time scale as
          // timestamps works, but its domain() function will return the
          // timestamps instead of parsed Date objects, which may be surprising.
          if (isTimeScale) {
            axes.setDomain(
              axisKey,
              axisIndex,
              newDomain.map((timestamp) => new Date(timestamp)) as [Date, Date],
            )
          } else {
            axes.setDomain(axisKey, axisIndex, newDomain as [number, number])
          }
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

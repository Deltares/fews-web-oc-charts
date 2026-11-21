import { afterEach, expect, test } from 'vite-plus/test'
import { AxisType, CartesianAxes, ModifierKey, WheelMode, ZoomHandler } from '../src'

let container: HTMLDivElement | undefined
let axes: CartesianAxes | undefined

afterEach(() => {
  axes?.observer.disconnect()
  container?.remove()
})

test.each([
  { deltaX: 0, deltaY: -100, shiftKey: false, factor: 0.9 },
  { deltaX: 0, deltaY: 100, shiftKey: false, factor: 1.1 },
  { deltaX: 0, deltaY: -0.1, shiftKey: false, factor: 0.9 },
  { deltaX: 0, deltaY: 0.1, shiftKey: false, factor: 1.1 },
  { deltaX: -100, deltaY: 0, shiftKey: true, factor: 0.9 },
  { deltaX: 100, deltaY: 0, shiftKey: true, factor: 1.1 },
  { deltaX: 100, deltaY: -100, shiftKey: true, factor: 0.9 },
  { deltaX: -100, deltaY: 100, shiftKey: true, factor: 1.1 },
  { deltaX: 0, deltaY: 0, shiftKey: true, factor: 1 },
  { deltaX: -100, deltaY: 0, shiftKey: false, factor: 1 },
])(
  'legacy wheel zoom respects direction ($deltaX, $deltaY, Shift: $shiftKey)',
  ({ deltaX, deltaY, shiftKey, factor }) => {
    container = document.createElement('div')
    document.body.append(container)
    axes = new CartesianAxes(container, 400, 200, {
      x: [{ type: AxisType.value, domain: [0, 100] }],
      y: [{ type: AxisType.value, domain: [0, 100] }],
    })
    const handler = new ZoomHandler(WheelMode.XY, shiftKey ? ModifierKey.Shift : ModifierKey.None)
    axes.accept(handler)
    const details: unknown[] = []
    container.addEventListener('zoom', (event) => details.push(event))
    const target = axes.layers.mouse.select('rect').node()!
    const bounds = target.getBoundingClientRect()
    const event = new WheelEvent('wheel', {
      clientX: bounds.x + bounds.width / 2,
      clientY: bounds.y + bounds.height / 2,
      deltaX,
      deltaY,
      shiftKey,
      cancelable: true,
      bubbles: true,
    })
    target.dispatchEvent(event)

    for (const key of ['x', 'y'] as const) {
      const domain = axes.getScale(key, 0)!.domain()
      expect(Number(domain[1]) - Number(domain[0])).toBeCloseTo(100 * factor)
      expect((Number(domain[0]) + Number(domain[1])) / 2).toBeCloseTo(50)
    }
    expect(event.defaultPrevented).toBe(factor !== 1)
    expect(details).toHaveLength(factor === 1 ? 0 : 1)
  },
)

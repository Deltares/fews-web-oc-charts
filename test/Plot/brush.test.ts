import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  axis,
  bandScale,
  brush,
  brushEvent,
  createPlot,
  linearScale,
  logScale,
  ModifierKey,
  pan,
  timeScale,
  type BrushHandle,
  type BrushSelection,
  type Plot,
  type PlotConfig,
} from '../../src/index.js'

const plots: Plot[] = []
const hosts: HTMLElement[] = []
async function frame() {
  await new Promise(requestAnimationFrame)
  await new Promise(requestAnimationFrame)
}
async function setup(handle: BrushHandle, config: PlotConfig = {}) {
  const host = document.createElement('div')
  document.body.append(host)
  hosts.push(host)
  const plot = createPlot(host, {
    width: 500,
    height: 300,
    margins: { top: 20, right: 20, bottom: 20, left: 20 },
    directions: { x: 'x', y: 'y' },
    scales: {
      x: linearScale({ domain: [0, 460] }),
      y: linearScale({ domain: [0, 260] }),
    },
    plugins: [handle],
    ...config,
  })
  plots.push(plot)
  await frame()
  vi.spyOn(plot.element, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 500, 300))
  return plot
}
function pointer(plot: Plot, type: string, x: number, y: number, target: Element = plot.element) {
  target.dispatchEvent(
    new PointerEvent(type, {
      clientX: x,
      clientY: y,
      pointerId: 1,
      button: 0,
      isPrimary: true,
      bubbles: true,
      cancelable: true,
    }),
  )
}
function rectangle(plot: Plot) {
  const node = plot.element.querySelector('[data-brush-selection]')!
  return ['x', 'y', 'width', 'height'].map((name) => Number(node.getAttribute(name)))
}
function resizeHandle(plot: Plot, name: string) {
  return plot.element.querySelector(`[data-brush-handle="${name}"]`)!
}
afterEach(() => {
  for (const plot of plots.splice(0)) plot.destroy()
  for (const host of hosts.splice(0)) host.remove()
  vi.restoreAllMocks()
})

describe('persistent brush', () => {
  test('publishes live selection and retains movable, resizable handles after release', async () => {
    const interaction = brush({ mode: 'x', modifier: ModifierKey.None, persistent: true })
    const plot = await setup(interaction)
    const events = vi.fn()
    plot.element.addEventListener(brushEvent, events)
    pointer(plot, 'pointerdown', 100, 100)
    pointer(plot, 'pointermove', 300, 180)
    expect(events).toHaveBeenCalledTimes(1)
    expect(interaction.selection.get()).toEqual({ mode: 'x', scales: { x: [80, 280] } })
    pointer(plot, 'pointerup', 300, 180)
    expect(rectangle(plot)).toEqual([100, 20, 200, 260])
    expect(resizeHandle(plot, 'w').getAttribute('display')).toBe('')
    expect(resizeHandle(plot, 'e').getAttribute('display')).toBe('')
    expect(resizeHandle(plot, 'n').getAttribute('display')).toBe('none')

    pointer(plot, 'pointerdown', 200, 100, plot.element.querySelector('[data-brush-selection]')!)
    pointer(plot, 'pointermove', 250, 120)
    pointer(plot, 'pointerup', 250, 120)
    expect(rectangle(plot)).toEqual([150, 20, 200, 260])
    expect(interaction.selection.get()?.scales.x).toEqual([130, 330])

    pointer(plot, 'pointerdown', 350, 150, resizeHandle(plot, 'e'))
    pointer(plot, 'pointermove', 450, 150)
    pointer(plot, 'pointerup', 450, 150)
    expect(rectangle(plot)).toEqual([150, 20, 300, 260])
    expect(interaction.selection.get()?.scales.x).toEqual([130, 430])
  })

  test.each(['x', 'y', 'xy'] as const)(
    'supports %s resizing, crossing and constrained movement',
    async (mode) => {
      const interaction = brush({ mode, modifier: ModifierKey.None, persistent: true })
      const plot = await setup(interaction)
      pointer(plot, 'pointerdown', 100, 80)
      pointer(plot, 'pointerup', 300, 200)
      const handleName = mode === 'x' ? 'w' : mode === 'y' ? 'n' : 'nw'
      pointer(plot, 'pointerdown', 100, 80, resizeHandle(plot, handleName))
      pointer(plot, 'pointermove', 350, 230)
      pointer(plot, 'pointerup', 350, 230)
      expect(rectangle(plot)).toEqual(
        [
          mode === 'y' ? 20 : 300,
          mode === 'x' ? 20 : 200,
          mode === 'y' ? 460 : 50,
          mode === 'x' ? 260 : 30,
        ].map((value) => expect.closeTo(value, 10)),
      )
      pointer(plot, 'pointerdown', 320, 215, plot.element.querySelector('[data-brush-selection]')!)
      pointer(plot, 'pointermove', 900, 900)
      pointer(plot, 'pointerup', 900, 900)
      expect(rectangle(plot)).toEqual(
        [
          mode === 'y' ? 20 : 430,
          mode === 'x' ? 20 : 250,
          mode === 'y' ? 460 : 50,
          mode === 'x' ? 260 : 30,
        ].map((value) => expect.closeTo(value, 10)),
      )
    },
  )

  test('sets, reprojects and clears domain selections without emitting user events', async () => {
    const interaction = brush({ mode: 'x', modifier: ModifierKey.None, persistent: true })
    interaction.setSelection({ mode: 'x', scales: { x: [80, 280] } })
    const plot = await setup(interaction)
    const events = vi.fn()
    plot.element.addEventListener(brushEvent, events)
    expect(rectangle(plot)).toEqual([100, 20, 200, 260])
    plot.update({ width: 960 })
    await frame()
    expect(rectangle(plot)).toEqual([180, 20, 400, 260])
    interaction.setSelection({ mode: 'x', scales: { x: [0, 460] } })
    await frame()
    expect(rectangle(plot)).toEqual([20, 20, 920, 260])
    expect(Object.isFrozen(interaction.selection.get()?.scales.x)).toBe(true)
    interaction.setSelection(undefined)
    await frame()
    expect(plot.element.querySelector('[data-brush-selection]')?.getAttribute('display')).toBe(
      'none',
    )
    expect(events).not.toHaveBeenCalled()
  })

  test('reprojects reversed log/time scales with inset axes and changed domains', async () => {
    const interaction = brush({ mode: 'xy', persistent: true })
    const x = logScale({ domain: [1, 100], reverse: true })
    const y = timeScale({ domain: [0, 1000] })
    interaction.setSelection({ mode: 'xy', scales: { x: [10, 100], y: [250, 750] } })
    const plot = await setup(interaction, { scales: { x, y }, axisLayout: 'inset' })
    const [px, py, width, height] = rectangle(plot)
    expect(px).toBeCloseTo(20)
    expect(py).toBeCloseTo(85)
    expect(width).toBeCloseTo(230)
    expect(height).toBeCloseTo(130)
    x.domain.set([1, 1000])
    await frame()
    expect(rectangle(plot)[0]).toBeCloseTo(plot.scales.x.project(100))
    expect(rectangle(plot)[2]).toBeCloseTo(plot.scales.x.project(10) - plot.scales.x.project(100))
  })

  test('validates selections and plot patches atomically and releases validators on removal', async () => {
    const interaction = brush({ mode: 'x', persistent: true })
    const plot = await setup(interaction)
    interaction.setSelection({ mode: 'x', scales: { x: [80, 280] } })
    const selection = interaction.selection.get()
    expect(() => interaction.setSelection({ mode: 'x', scales: { x: [280, 80] } })).toThrow()
    expect(() => interaction.setSelection({ mode: 'x', scales: { missing: [0, 1] } })).toThrow(
      'missing scale',
    )
    expect(() => interaction.setSelection({ mode: 'x', scales: { y: [0, 1] } })).toThrow(
      'does not match mode',
    )
    expect(interaction.selection.get()).toBe(selection)
    expect(() => plot.update({ scales: { x: undefined } })).toThrow('missing scale')
    expect(plot.scales.x).toBeDefined()
    plot.update({ plugins: [] })
    interaction.setSelection({ mode: 'x', scales: { missing: [0, 1] } })
    expect(plot.element.querySelector('[data-layer="brush"]')).toBeNull()
    expect(() => brush().setSelection({ mode: 'xy', scales: { x: [0, 1] } })).toThrow(
      'persistent: true',
    )
  })

  test('cancels capture without further changes and clears selection on mode changes', async () => {
    const interaction = brush({ mode: 'x', persistent: true, modifier: ModifierKey.None })
    const plot = await setup(interaction)
    pointer(plot, 'pointerdown', 100, 100)
    pointer(plot, 'pointermove', 300, 150)
    pointer(plot, 'pointercancel', 300, 150)
    const selection = interaction.selection.get()
    pointer(plot, 'pointermove', 400, 150)
    expect(interaction.selection.get()).toBe(selection)
    interaction.update({ mode: 'y' })
    await frame()
    expect(interaction.selection.get()).toBeUndefined()
    expect(plot.element.querySelector('[data-brush-selection]')?.getAttribute('display')).toBe(
      'none',
    )
    plot.destroy()
    expect(plot.element.querySelector('[data-layer="brush"]')).toBeNull()
  })

  test('cancels an active gesture immediately when options or the controlled selection change', async () => {
    const interaction = brush({ mode: 'x', persistent: true, modifier: ModifierKey.None })
    const plot = await setup(interaction)
    pointer(plot, 'pointerdown', 100, 100)
    pointer(plot, 'pointermove', 300, 150)
    interaction.update({ persistent: false })
    expect(() => pointer(plot, 'pointerup', 350, 150)).not.toThrow()
    expect(interaction.selection.get()).toBeUndefined()
    interaction.update({ persistent: true })
    pointer(plot, 'pointerdown', 100, 100)
    interaction.setSelection({ mode: 'x', scales: { x: [0, 100] } })
    pointer(plot, 'pointermove', 400, 200)
    pointer(plot, 'pointerup', 400, 200)
    expect(interaction.selection.get()?.scales.x).toEqual([0, 100])
    expect(rectangle(plot)).toEqual([20, 20, 100, 260])
  })

  test('projects category selections and rejects invalid categories', async () => {
    const interaction = brush({ mode: 'x', persistent: true })
    const x = bandScale({ domain: ['a', 'b', 'c'], reverse: true })
    interaction.setSelection({ mode: 'x', scales: { x: ['b'] } })
    const plot = await setup(interaction, {
      scales: { x, y: linearScale({ domain: [0, 100] }) },
    })
    expect(rectangle(plot)[0]).toBeCloseTo(plot.scales.x.project('b'))
    expect(rectangle(plot)[2]).toBeCloseTo(plot.scales.x.bandwidth)
    expect(() => interaction.setSelection({ mode: 'x', scales: { x: ['missing'] } })).toThrow(
      'categories from the scale domain',
    )
    expect(() => interaction.setSelection({ mode: 'x', scales: { x: ['b', 'b'] } })).toThrow()
  })

  test.each([true, false])(
    'brush gestures take precedence over pan (brush first: %s)',
    async (first) => {
      const interaction = brush({ mode: 'x', modifier: ModifierKey.None, persistent: true })
      const panning = pan({ mode: 'x' })
      const plot = await setup(interaction, {
        plugins: first ? [interaction, panning] : [panning, interaction],
      })
      pointer(plot, 'pointerdown', 100, 100)
      pointer(plot, 'pointerup', 300, 200)
      pointer(plot, 'pointerdown', 300, 100, resizeHandle(plot, 'e'))
      pointer(plot, 'pointermove', 350, 100)
      pointer(plot, 'pointerup', 350, 100)
      expect(interaction.selection.get()?.scales.x).toEqual([80, 330])
      expect(plot.scales.x.scale.domain.get()).toEqual([0, 460])
    },
  )

  test('controls an independent main scale live without narrowing the overview', async () => {
    const interaction = brush({ mode: 'x', persistent: true, modifier: ModifierKey.None })
    const plot = await setup(interaction)
    const mainTime = linearScale({ domain: [0, 460] })
    plot.element.addEventListener(brushEvent, (event) => {
      mainTime.domain.set((event as CustomEvent<BrushSelection>).detail.scales.x)
    })
    pointer(plot, 'pointerdown', 100, 100)
    pointer(plot, 'pointermove', 300, 150)
    expect(mainTime.domain.get()).toEqual([80, 280])
    expect(plot.scales.x.scale.domain.get()).toEqual([0, 460])
    pointer(plot, 'pointerup', 300, 150)
    mainTime.domain.set([0, 100])
    interaction.setSelection({ mode: 'x', scales: { x: mainTime.domain.get() } })
    await frame()
    expect(rectangle(plot)).toEqual([20, 20, 100, 260])
  })
})

describe('automatic brush mode', () => {
  test('uses the v4 25-pixel bounds, switches modes and displays matching handles', async () => {
    const interaction = brush({ mode: 'auto', modifier: ModifierKey.None })
    const plot = await setup(interaction, {
      axes: [axis('x', { position: 'bottom' })],
    })
    const events = vi.fn()
    plot.element.addEventListener(brushEvent, events)
    pointer(plot, 'pointerdown', 100, 100)
    pointer(plot, 'pointermove', 125, 125)
    expect(plot.element.querySelector('[data-brush-selection]')?.getAttribute('display')).toBe(
      'none',
    )
    pointer(plot, 'pointermove', 120, 200)
    expect(plot.element.querySelector('[data-layer="brush"]')?.getAttribute('data-mode')).toBe('y')
    expect(resizeHandle(plot, 'n').getAttribute('display')).toBe('')
    expect(resizeHandle(plot, 'w').getAttribute('display')).toBe('none')
    expect(Number(resizeHandle(plot, 'n').getAttribute('x'))).toBe(75)
    expect(Number(resizeHandle(plot, 'n').getAttribute('width'))).toBe(50)
    pointer(plot, 'pointermove', 300, 120)
    expect(plot.element.querySelector('[data-layer="brush"]')?.getAttribute('data-mode')).toBe('x')
    expect(Number(resizeHandle(plot, 'w').getAttribute('y'))).toBe(75)
    expect(Number(resizeHandle(plot, 'w').getAttribute('height'))).toBe(50)
    pointer(plot, 'pointermove', 300, 200)
    expect(plot.element.querySelector('[data-layer="brush"]')?.getAttribute('data-mode')).toBe('xy')
    expect(
      [...plot.element.querySelectorAll('[data-brush-handle]')].every(
        (node) => node.getAttribute('display') === 'none',
      ),
    ).toBe(true)
    expect(events).not.toHaveBeenCalled()
    pointer(plot, 'pointerup', 300, 200)
    expect(events).toHaveBeenCalledTimes(1)
    expect((events.mock.calls[0][0] as CustomEvent<BrushSelection>).detail.mode).toBe('xy')
  })

  test('cancels small movements and emits only the selected axis for vertical gestures', async () => {
    const interaction = brush({ mode: 'auto', modifier: ModifierKey.None })
    const plot = await setup(interaction)
    const events = vi.fn()
    plot.element.addEventListener(brushEvent, events)
    pointer(plot, 'pointerdown', 100, 100)
    pointer(plot, 'pointerup', 125, 125)
    expect(events).not.toHaveBeenCalled()
    pointer(plot, 'pointerdown', 100, 200)
    pointer(plot, 'pointerup', 110, 100)
    const detail = (events.mock.calls[0][0] as CustomEvent<BrushSelection>).detail
    expect(detail).toEqual({ mode: 'y', scales: { y: [80, 180] } })
  })
})

import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  createPlot,
  createPolarPlot,
  axis,
  linearScale,
  timeScale,
  bandScale,
  angularScale,
  radialScale,
  degreesScale,
  sharedScale,
  line,
  series,
  createSeries,
  zoom,
  pan,
  brush,
  brushEvent,
  crosshair,
  batch,
  type Plot,
  type BrushSelection,
} from '../../src/index.js'
import { reactive } from '../../src/core/runtime.js'

const plots: Plot[] = []
const hosts: HTMLElement[] = []
function host(width = 500, height = 300) {
  const element = document.createElement('div')
  element.style.width = `${width}px`
  element.style.height = `${height}px`
  document.body.append(element)
  hosts.push(element)
  return element
}
function plot(...args: Parameters<typeof createPlot>) {
  const result = createPlot(...args)
  plots.push(result)
  return result
}
async function frame() {
  await new Promise(requestAnimationFrame)
  await new Promise(requestAnimationFrame)
}
afterEach(() => {
  for (const current of plots.splice(0)) current.destroy()
  for (const element of hosts.splice(0)) element.remove()
  vi.restoreAllMocks()
})

describe('createPlot named scales', () => {
  test('keeps inset mark geometry local and public projections absolute', async () => {
    const current = plot(host(), {
      width: 500,
      height: 300,
      margins: { top: 40, right: 40, bottom: 40, left: 40 },
      axisLayout: 'inset',
      background: 'plot',
      clipMarks: false,
      directions: { x: 'x' },
      scales: {
        x: linearScale({ domain: [0, 1] }),
        y: linearScale({ domain: [0, 1] }),
      },
      axes: [
        axis('x', { position: 'bottom', style: 'classic' }),
        axis('y', { style: 'classic', crossAt: { scale: 'x', value: 0.5 } }),
      ],
      marks: [line({ x: 'x', y: 'y', xValues: [0, 1], yValues: [0, 1] })],
    })
    await frame()
    expect(current.regions.get().plot).toMatchObject({ x: 40, y: 40, width: 420, height: 220 })
    expect(current.scales.x.project(0)).toBe(40)
    expect(current.element.querySelector('[data-mark="line"]')?.getAttribute('d')).toBe(
      'M0,220L420,0',
    )
    expect(current.element.querySelector('[data-layer="marks"]')?.hasAttribute('clip-path')).toBe(
      false,
    )
    current.update({ axisLayout: 'outside', clipMarks: true })
    await frame()
    expect(current.element.querySelector('[data-mark="line"]')?.getAttribute('d')).toBe(
      `M${current.scales.x.project(0)},${current.scales.y.project(0)}L${current.scales.x.project(1)},${current.scales.y.project(1)}`,
    )
    expect(
      current.element.querySelector('[data-layer="marks"]')?.getAttribute('clip-path'),
    ).toMatch(/^url/)
  })

  test('publishes primary pointer coordinates once per animation frame', async () => {
    const current = plot(host(), {
      width: 500,
      height: 300,
      directions: { t: 'x' },
      scales: {
        t: linearScale({ domain: [0, 100] }),
        q: linearScale({ domain: [0, 100] }),
        category: bandScale({ domain: ['a', 'b', 'c'] }),
      },
    })
    await frame()
    vi.spyOn(current.element, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 500, 300))
    const initialVersion = current.pointer.version
    current.element.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: 100,
        clientY: 100,
        pointerType: 'pen',
        isPrimary: true,
      }),
    )
    current.element.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: 250,
        clientY: 150,
        pointerType: 'pen',
        isPrimary: true,
      }),
    )
    current.element.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: 400,
        clientY: 200,
        pointerType: 'pen',
        isPrimary: true,
      }),
    )
    await frame()
    expect(current.pointer.version).toBe(initialVersion + 1)
    expect(current.pointer.get()).toMatchObject({ px: 392, py: 192, inside: true })
    expect(current.pointer.get().x.get('t')).toBeCloseTo(80.991736)
    expect(current.pointer.get().x.get('q')).toBeCloseTo(32.394366)

    const bandCenter = current.scales.category.project('b') + current.scales.category.bandwidth / 2
    current.element.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: bandCenter,
        clientY: 150,
        pointerType: 'touch',
        isPrimary: true,
      }),
    )
    await frame()
    expect(current.pointer.get().x.get('category')).toBe('b')

    current.element.dispatchEvent(
      new PointerEvent('pointerleave', {
        clientX: 500,
        clientY: 200,
        pointerType: 'pen',
        isPrimary: true,
      }),
    )
    await frame()
    expect(current.pointer.get().inside).toBe(false)
  })

  test('ignores secondary pointers and cancels a queued publication on destroy', async () => {
    const current = plot(host(), { scales: { q: linearScale({ domain: [0, 1] }) } })
    await frame()
    vi.spyOn(current.element, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 500, 300))
    const initialVersion = current.pointer.version
    current.element.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: 250,
        clientY: 150,
        pointerType: 'touch',
        isPrimary: false,
      }),
    )
    expect(current.pointer.version).toBe(initialVersion)
    current.element.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: 250,
        clientY: 150,
        pointerType: 'touch',
        isPrimary: true,
      }),
    )
    current.destroy()
    await frame()
    expect(current.pointer.version).toBe(initialVersion)
  })

  test('inverts polar pointer coordinates into angular and radial scale values', async () => {
    const current = createPolarPlot(host(), {
      width: 500,
      height: 300,
      scales: {
        bearing: angularScale({ domain: [0, 360] }),
        distance: radialScale({ domain: [0, 100] }),
      },
    })
    plots.push(current)
    await frame()
    vi.spyOn(current.element, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 500, 300))
    const region = current.regions.get().plot
    const radius = current.scales.distance.project(50)
    current.element.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: region.x + region.width / 2 + radius,
        clientY: region.y + region.height / 2,
        pointerType: 'mouse',
        isPrimary: true,
      }),
    )
    await frame()
    expect(current.pointer.get().x.get('bearing')).toBeCloseTo(90)
    expect(current.pointer.get().x.get('distance')).toBeCloseTo(50)
  })

  test('tracks the pointer with configurable crosshair guides and removes the overlay', async () => {
    const interaction = crosshair({ mode: 'x' })
    const current = plot(host(), {
      width: 500,
      height: 300,
      scales: { x: linearScale({ domain: [0, 100] }), y: linearScale({ domain: [0, 100] }) },
      plugins: [interaction],
    })
    await frame()
    vi.spyOn(current.element, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 500, 300))
    const vertical = current.element.querySelector('[data-crosshair-axis="x"]')!
    const horizontal = current.element.querySelector('[data-crosshair-axis="y"]')!

    expect(current.element.querySelector('[data-layer="crosshair"]')?.getAttribute('display')).toBe(
      'none',
    )
    current.element.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: 250,
        clientY: 150,
        pointerType: 'mouse',
        isPrimary: true,
      }),
    )
    await frame()
    expect(current.element.querySelector('[data-layer="crosshair"]')?.getAttribute('display')).toBe(
      '',
    )
    expect(vertical.getAttribute('display')).toBe('')
    expect(vertical.getAttribute('x1')).toBe('242')
    expect(horizontal.getAttribute('display')).toBe('none')

    interaction.update({ mode: 'y' })
    await frame()
    expect(vertical.getAttribute('display')).toBe('none')
    expect(horizontal.getAttribute('display')).toBe('')

    current.element.dispatchEvent(
      new PointerEvent('pointerleave', {
        clientX: 500,
        clientY: 200,
        pointerType: 'mouse',
        isPrimary: true,
      }),
    )
    await frame()
    expect(current.element.querySelector('[data-layer="crosshair"]')?.getAttribute('display')).toBe(
      'none',
    )
    current.update({ plugins: [] })
    expect(current.element.querySelector('[data-layer="crosshair"]')).toBeNull()
  })

  test('zooms selected Cartesian domains at the pointer and resets to initial domains', async () => {
    const x = linearScale({ domain: [0, 100] })
    const y = linearScale({ domain: [0, 100] })
    const interaction = zoom({ mode: 'x', wheel: 'x', modifier: 'ctrl' })
    const current = plot(host(), {
      width: 500,
      height: 300,
      directions: { x: 'x', y: 'y' },
      scales: { x, y },
      plugins: [interaction],
    })

    await frame()
    vi.spyOn(current.element, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 500, 300))
    const wheel = (ctrlKey: boolean) =>
      new WheelEvent('wheel', {
        clientX: 250,
        clientY: 150,
        deltaY: -100,
        ctrlKey,
        cancelable: true,
      })
    const unmodified = wheel(false)
    current.element.dispatchEvent(unmodified)
    expect(unmodified.defaultPrevented).toBe(false)
    expect(x.domain.get()).toEqual([0, 100])

    const modified = wheel(true)
    current.element.dispatchEvent(modified)
    expect(modified.defaultPrevented).toBe(true)
    const zoomed = x.domain.get()
    expect(zoomed[0]).toBeGreaterThan(0)
    expect(zoomed[1]).toBeLessThan(100)
    expect((zoomed[0] + zoomed[1]) / 2).toBeCloseTo(50)
    expect(y.domain.get()).toEqual([0, 100])

    current.element.dispatchEvent(
      new MouseEvent('dblclick', {
        clientX: 250,
        clientY: 150,
        button: 0,
        cancelable: true,
      }),
    )
    expect(x.domain.get()).toEqual([0, 100])
    expect(y.domain.get()).toEqual([0, 100])

    interaction.update({ mode: 'xy', wheel: 'xy' })
    current.element.dispatchEvent(wheel(true))
    expect(x.domain.get()[0]).toBeGreaterThan(0)
    expect(y.domain.get()[0]).toBeGreaterThan(0)

    current.element.dispatchEvent(
      new MouseEvent('dblclick', {
        clientX: 250,
        clientY: 150,
        button: 0,
        cancelable: true,
      }),
    )
    expect(x.domain.get()).toEqual([0, 100])
    expect(y.domain.get()).toEqual([0, 100])

    interaction.update({ mode: 'y', wheel: 'y' })
    current.element.dispatchEvent(wheel(true))
    expect(x.domain.get()).toEqual([0, 100])
    expect(y.domain.get()[0]).toBeGreaterThan(0)
    expect(y.domain.get()[1]).toBeLessThan(100)
  })

  test('pans selected continuous Cartesian domains while dragging', async () => {
    const x = linearScale({ domain: [0, 100] })
    const y = linearScale({ domain: [0, 100] })
    const interaction = pan({ mode: 'x' })
    const current = plot(host(), {
      width: 500,
      height: 300,
      directions: { x: 'x', y: 'y' },
      scales: { x, y },
      plugins: [interaction],
    })
    await frame()
    vi.spyOn(current.element, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 500, 300))
    const pointer = (type: string, clientX: number, clientY: number, button = 0) =>
      new PointerEvent(type, {
        clientX,
        clientY,
        pointerId: 1,
        button,
        isPrimary: true,
        pointerType: 'mouse',
        cancelable: true,
      })
    const down = pointer('pointerdown', 250, 150)
    current.element.dispatchEvent(down)
    expect(down.defaultPrevented).toBe(true)
    current.element.dispatchEvent(pointer('pointermove', 300, 170))
    expect(x.domain.get()[0]).toBeLessThan(0)
    expect(x.domain.get()[1]).toBeLessThan(100)
    expect(y.domain.get()).toEqual([0, 100])
    current.element.dispatchEvent(pointer('pointerup', 300, 170))
    const stopped = x.domain.get()
    current.element.dispatchEvent(pointer('pointermove', 350, 170))
    expect(x.domain.get()).toEqual(stopped)
  })

  test('brushes selected scales and emits an immutable selection event', async () => {
    const x = linearScale({ domain: [0, 100] })
    const y = linearScale({ domain: [0, 100] })
    const interaction = brush({ mode: 'x' })
    const current = plot(host(), {
      width: 500,
      height: 300,
      directions: { x: 'x', y: 'y' },
      scales: { x, y },
      plugins: [interaction, pan({ mode: 'x', modifier: 'shift' })],
    })
    await frame()
    vi.spyOn(current.element, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 500, 300))
    let result: BrushSelection | undefined
    current.element.addEventListener(brushEvent, (event) => {
      result = (event as CustomEvent<BrushSelection>).detail
    })
    const pointer = (type: string, clientX: number, clientY: number, shiftKey = true) =>
      new PointerEvent(type, {
        clientX,
        clientY,
        pointerId: 1,
        button: 0,
        shiftKey,
        isPrimary: true,
        pointerType: 'mouse',
        cancelable: true,
      })
    const unmodified = pointer('pointerdown', 100, 100, false)
    current.element.dispatchEvent(unmodified)
    expect(unmodified.defaultPrevented).toBe(false)
    current.element.dispatchEvent(pointer('pointerup', 100, 100, false))

    current.element.dispatchEvent(pointer('pointerdown', 100, 100))
    const moving = pointer('pointermove', 300, 200)
    current.element.dispatchEvent(moving)
    expect(moving.defaultPrevented).toBe(true)
    expect(
      current.element.querySelector('[data-layer="brush"] rect')?.getAttribute('display'),
    ).toBe('')
    current.element.dispatchEvent(pointer('pointerup', 300, 200))

    const start = current.scales.x.invert(100)
    const end = current.scales.x.invert(300)
    expect(result).toEqual({
      mode: 'x',
      scales: { x: [Math.min(start, end), Math.max(start, end)] },
    })
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result?.scales)).toBe(true)
    expect(
      current.element.querySelector('[data-layer="brush"] rect')?.getAttribute('display'),
    ).toBe('none')
    expect(y.domain.get()).toEqual([0, 100])
    expect(x.domain.get()).toEqual([0, 100])

    current.update({ plugins: [] })
    expect(current.element.querySelector('[data-layer="brush"]')).toBeNull()
  })

  test.each(['x', 'y', 'xy'] as const)(
    'positions the %s brush overlay at the selected interval',
    async (mode) => {
      const current = plot(host(), {
        width: 500,
        height: 300,
        margins: { top: 30, right: 40, bottom: 50, left: 60 },
        directions: { x: 'x', y: 'y' },
        scales: {
          x: linearScale({ domain: [0, 100] }),
          y: linearScale({ domain: [0, 100] }),
        },
        plugins: [brush({ mode, modifier: 'none' })],
      })
      await frame()
      vi.spyOn(current.element, 'getBoundingClientRect').mockReturnValue(
        new DOMRect(0, 0, 500, 300),
      )
      const pointer = (type: string, clientX: number, clientY: number) =>
        new PointerEvent(type, {
          clientX,
          clientY,
          pointerId: 1,
          button: 0,
          isPrimary: true,
          cancelable: true,
        })
      for (const [startX, startY, endX, endY] of [
        [100, 80, 300, 200],
        [300, 200, 100, 80],
      ]) {
        current.element.dispatchEvent(pointer('pointerdown', startX, startY))
        current.element.dispatchEvent(pointer('pointermove', endX, endY))
        const overlay = current.element.querySelector('[data-layer="brush"] rect')!
        const region = current.regions.get().plot
        expect(
          ['x', 'y', 'width', 'height'].map((name) => Number(overlay.getAttribute(name))),
        ).toEqual([
          mode === 'y' ? region.x : 100,
          mode === 'x' ? region.y : 80,
          mode === 'y' ? region.width : 200,
          mode === 'x' ? region.height : 120,
        ])
        current.element.dispatchEvent(pointer('pointerup', endX, endY))
      }
    },
  )

  test('brush selection includes band categories intersecting the selected interval', async () => {
    const categories = bandScale({ domain: ['a', 'b', 'c'] })
    const interaction = brush({ mode: 'x', modifier: 'none' })
    const current = plot(host(), {
      width: 500,
      height: 300,
      directions: { category: 'x' },
      scales: { category: categories },
      plugins: [interaction],
    })
    await frame()
    vi.spyOn(current.element, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 500, 300))
    let result: BrushSelection | undefined
    current.element.addEventListener(brushEvent, (event) => {
      result = (event as CustomEvent<BrushSelection>).detail
    })
    const center = (value: string) =>
      current.scales.category.project(value) + current.scales.category.bandwidth / 2
    const pointer = (type: string, clientX: number) =>
      new PointerEvent(type, {
        clientX,
        clientY: 150,
        pointerId: 1,
        button: 0,
        isPrimary: true,
        pointerType: 'mouse',
        cancelable: true,
      })
    current.element.dispatchEvent(pointer('pointerdown', center('a')))
    current.element.dispatchEvent(pointer('pointermove', center('b')))
    current.element.dispatchEvent(pointer('pointerup', center('b')))
    expect(result).toEqual({ mode: 'x', scales: { category: ['a', 'b'] } })
  })

  test('requires configured modifiers and releases pan listeners when removed', async () => {
    const x = linearScale({ domain: [0, 100] })
    const interaction = pan({ mode: 'x', modifier: 'ctrl' })
    const current = plot(host(), {
      width: 500,
      height: 300,
      directions: { x: 'x' },
      scales: { x },
      plugins: [interaction],
    })
    await frame()
    vi.spyOn(current.element, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 500, 300))
    const dispatch = (type: string, clientX: number, ctrlKey = false) =>
      current.element.dispatchEvent(
        new PointerEvent(type, {
          clientX,
          clientY: 150,
          pointerId: 1,
          button: 0,
          ctrlKey,
          isPrimary: true,
          pointerType: 'mouse',
          cancelable: true,
        }),
      )
    dispatch('pointerdown', 250)
    dispatch('pointermove', 300)
    expect(x.domain.get()).toEqual([0, 100])
    dispatch('pointerdown', 250, true)
    dispatch('pointermove', 300, true)
    expect(x.domain.get()[0]).toBeLessThan(0)
    current.update({ plugins: [] })
    const stopped = x.domain.get()
    dispatch('pointerdown', 250, true)
    dispatch('pointermove', 300, true)
    expect(x.domain.get()).toEqual(stopped)
  })

  test('adapts touch gestures to pan direction and restores the host style', async () => {
    const interaction = pan({ mode: 'x' })
    const current = plot(host(), {
      directions: { x: 'x' },
      scales: { x: linearScale({ domain: [0, 100] }) },
    })
    current.element.style.setProperty('touch-action', 'manipulation')
    current.update({ plugins: [interaction] })
    expect(current.element.style.getPropertyValue('touch-action')).toBe('pan-y')
    interaction.update({ mode: 'xy' })
    await frame()
    expect(current.element.style.getPropertyValue('touch-action')).toBe('none')
    current.update({ plugins: [] })
    expect(current.element.style.getPropertyValue('touch-action')).toBe('manipulation')
  })

  test('stops wheel zoom when its plugin is removed or disabled', async () => {
    const x = linearScale({ domain: [0, 100] })
    const interaction = zoom({ mode: 'x', wheel: 'x' })
    const current = plot(host(), {
      width: 500,
      height: 300,
      directions: { x: 'x' },
      scales: { x },
      plugins: [interaction],
    })
    await frame()
    vi.spyOn(current.element, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 500, 300))
    interaction.update({ wheel: 'none' })
    const disabled = new WheelEvent('wheel', {
      clientX: 250,
      clientY: 150,
      deltaY: 100,
      cancelable: true,
    })
    current.element.dispatchEvent(disabled)
    expect(disabled.defaultPrevented).toBe(false)
    expect(x.domain.get()).toEqual([0, 100])

    interaction.update({ wheel: 'x' })
    current.update({ plugins: [] })
    const removed = new WheelEvent('wheel', {
      clientX: 250,
      clientY: 150,
      deltaY: 100,
      cancelable: true,
    })
    current.element.dispatchEvent(removed)
    expect(removed.defaultPrevented).toBe(false)
    expect(x.domain.get()).toEqual([0, 100])
  })

  test('attaches gesture listeners only while a zoom plugin is installed', () => {
    const added = vi.spyOn(SVGSVGElement.prototype, 'addEventListener')
    const removed = vi.spyOn(SVGSVGElement.prototype, 'removeEventListener')
    const gestureTypes = (spy: typeof added | typeof removed) =>
      spy.mock.calls.map(([type]) => type).filter((type) => type === 'wheel' || type === 'dblclick')
    const current = plot(host(), {
      directions: { x: 'x' },
      scales: { x: linearScale({ domain: [0, 100] }) },
    })
    expect(gestureTypes(added)).toEqual([])

    current.update({ plugins: [zoom({ wheel: 'x' })] })
    expect(gestureTypes(added)).toEqual(['wheel', 'dblclick'])
    expect(added.mock.calls.find(([type]) => type === 'wheel')?.[2]).toEqual({ passive: false })

    current.update({ plugins: [] })
    expect(gestureTypes(removed)).toEqual(['wheel', 'dblclick'])
  })

  test('releases zoom listeners when the plot is destroyed', async () => {
    const current = plot(host(), {
      directions: { x: 'x' },
      scales: { x: linearScale({ domain: [0, 100] }) },
      plugins: [zoom({ wheel: 'x' })],
    })
    await frame()
    const removed = vi.spyOn(current.element, 'removeEventListener')
    current.destroy()
    const types = removed.mock.calls.map(([type]) => type)
    expect(types).toEqual(expect.arrayContaining(['wheel', 'dblclick']))
  })

  test('ignores zoom gestures outside the plot region', async () => {
    const x = linearScale({ domain: [0, 100] })
    const current = plot(host(), {
      width: 500,
      height: 300,
      directions: { x: 'x' },
      scales: { x },
      plugins: [zoom({ wheel: 'x', reset: 'full' })],
    })
    await frame()
    vi.spyOn(current.element, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 500, 300))
    const region = current.regions.get().plot
    const wheel = new WheelEvent('wheel', {
      clientX: region.x - 2,
      clientY: 150,
      deltaY: -100,
      cancelable: true,
    })
    current.element.dispatchEvent(wheel)
    expect(wheel.defaultPrevented).toBe(false)
    expect(x.domain.get()).toEqual([0, 100])
    const doubleClick = new MouseEvent('dblclick', {
      clientX: region.x - 2,
      clientY: 150,
      button: 0,
      cancelable: true,
    })
    current.element.dispatchEvent(doubleClick)
    expect(doubleClick.defaultPrevented).toBe(false)
  })

  test('validates plugin membership atomically', () => {
    const interaction = zoom()
    const current = plot(host(), { scales: { x: linearScale({ domain: [0, 1] }) } })
    expect(() => current.update({ plugins: [{} as never] })).toThrow(
      'plot.plugins accepts zoom(), pan(), brush() or crosshair() plugins only.',
    )
    expect(() => current.update({ plugins: [interaction, interaction] })).toThrow(
      'Duplicate plugin handle in plot.plugins.',
    )
    expect(() => current.update({ plugins: [interaction, zoom()] })).toThrow(
      'A plot can install at most one zoom plugin.',
    )
    expect(() => current.update({ plugins: [pan(), pan()] })).toThrow(
      'A plot can install at most one pan plugin.',
    )
    expect(current.options.get().resolved.plugins).toEqual([])
    const polar = createPolarPlot(host(), {
      scales: { a: angularScale({ domain: [0, 360] }), r: radialScale({ domain: [0, 1] }) },
    })
    plots.push(polar)
    expect(() => polar.update({ plugins: [interaction] })).toThrow(
      'The zoom plugin currently supports Cartesian plots only.',
    )
    expect(() => polar.update({ plugins: [pan()] })).toThrow(
      'The pan plugin currently supports Cartesian plots only.',
    )
  })

  test('reinstalls a replaced zoom handle with its own initial domains', async () => {
    const x = linearScale({ domain: [0, 100] })
    const first = zoom({ wheel: 'x', reset: 'initial' })
    const current = plot(host(), {
      width: 500,
      height: 300,
      directions: { x: 'x' },
      scales: { x },
      plugins: [first],
    })
    await frame()
    vi.spyOn(current.element, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 500, 300))
    x.update({ domain: [10, 90] })
    current.update({ plugins: [zoom({ wheel: 'x', reset: 'initial' })] })
    current.element.dispatchEvent(
      new WheelEvent('wheel', { clientX: 250, clientY: 150, deltaY: -100, cancelable: true }),
    )
    expect(x.domain.get()[0]).toBeGreaterThan(10)
    current.element.dispatchEvent(
      new MouseEvent('dblclick', { clientX: 250, clientY: 150, button: 0, cancelable: true }),
    )
    expect(x.domain.get()).toEqual([10, 90])
  })

  test('supports y-only zoom over an autoscaled visible-data domain', async () => {
    const x = linearScale({ domain: [0, 2] })
    const y = linearScale({ autoscale: 'visible', defaultDomain: [0, 100] })
    const interaction = zoom({ mode: 'y', wheel: 'y' })
    const current = plot(host(), {
      width: 500,
      height: 300,
      directions: { x: 'x', y: 'y' },
      scales: { x, y },
      marks: [line({ x: 'x', y: 'y', xValues: [0, 1, 2], yValues: [20, 40, 60] })],
      plugins: [interaction],
    })
    await frame()
    vi.spyOn(current.element, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 500, 300))
    expect(y.domain.get()).toEqual([20, 60])
    const wheel = new WheelEvent('wheel', {
      clientX: 250,
      clientY: 150,
      deltaY: -100,
      cancelable: true,
    })
    current.element.dispatchEvent(wheel)
    expect(wheel.defaultPrevented).toBe(true)
    expect(x.domain.get()).toEqual([0, 2])
    expect(y.options.get().explicit.domain).not.toBeUndefined()
    expect(y.domain.get()[0]).toBeGreaterThan(20)
    expect(y.domain.get()[1]).toBeLessThan(60)

    current.element.dispatchEvent(
      new MouseEvent('dblclick', {
        clientX: 250,
        clientY: 150,
        button: 0,
        cancelable: true,
      }),
    )
    expect(y.options.get().explicit.domain).toBeUndefined()
    expect(y.domain.get()).toEqual([20, 60])
  })

  test('shares domains but never ranges or derived scales between differently sized plots', async () => {
    const shared = sharedScale(linearScale({ domain: [0, 100] }))
    const first = plot(host(), { scales: { q: shared }, directions: { q: 'x' } })
    const second = plot(host(800), { scales: { q: shared }, directions: { q: 'x' } })
    await frame()
    expect(first.scales.q).not.toBe(second.scales.q)
    expect(first.scales.q.range.get()).toEqual([8, 492])
    expect(second.scales.q.range.get()).toEqual([8, 792])
    expect(first.scales.q.project(50)).toBe(250)
    expect(second.scales.q.project(50)).toBe(400)
    shared.domain.set([0, 200])
    await frame()
    expect(first.scales.q.project(100)).toBe(250)
    expect(second.scales.q.invert(400)).toBe(100)
    first.destroy()
    shared.update({ domain: [0, 400] })
    await frame()
    expect(second.scales.q.project(200)).toBe(400)
    expect(first.element.isConnected).toBe(false)
  })

  test('uses local x/y directions, reversed ranges, and immutable snapshots', async () => {
    const y = linearScale({ domain: [-10, 10], reverse: true })
    const current = plot(host(), { scales: { q: y }, axes: [axis('q')] })
    await frame()
    expect(current.scales.q.project(-10)).toBe(current.regions.get().plot.y)
    expect(current.scales.q.project(10)).toBe(292)
    expect(Object.isFrozen(current.scales)).toBe(true)
    expect(Object.isFrozen(y.domain.get())).toBe(true)
    expect(Object.isFrozen(current.options.get().resolved.margins)).toBe(true)
    expect(current.options.get().resolved.scales.q).toBe(y)
    const version = y.options.version
    y.update({ reverse: true })
    expect(y.options.version).toBe(version)
    y.update({ reverse: undefined })
    await frame()
    expect(y.options.get().explicit.reverse).toBeUndefined()
    expect(current.scales.q.project(-10)).toBe(292)
  })

  test('updates, unsets and replaces configuration without mutating external handles', async () => {
    const shared = linearScale({ domain: [2, 8] })
    const left = axis('q', { id: 'left', label: 'Flow', format: () => 'custom' })
    const current = plot(host(), {
      width: 600,
      title: 'Flow',
      theme: 'dark',
      margins: { left: 12, top: 20 },
      scales: { q: shared },
      axes: [left],
    })
    await frame()
    const binding = current.scales.q
    current.update({ margins: { left: undefined }, title: '', width: 0 })
    await frame()
    expect(current.size.get().width).toBe(0)
    expect(current.options.get().resolved.margins).toEqual({
      left: 8,
      top: 20,
      right: 8,
      bottom: 8,
    })
    expect(current.element.hasAttribute('aria-label')).toBe(false)
    current.update({ width: undefined, theme: undefined })
    left.update({ label: undefined, format: undefined, grid: true })
    await frame()
    expect(current.size.get().width).toBe(500)
    expect(current.element.textContent).not.toContain('custom')
    expect(current.scales.q).toBe(binding)
    current.setConfig({ scales: { q: shared }, axes: [left] })
    await frame()
    expect(current.options.get().resolved.margins.top).toBe(8)
    expect(shared.domain.get()).toEqual([2, 8])
    expect(left.options.get().resolved.grid).toBe(true)
    current.update({ axes: [], scales: { q: undefined } })
    await frame()
    expect(Object.keys(current.scales)).toEqual([])
    expect(current.element.querySelectorAll('[data-layer="axes"] > g')).toHaveLength(0)
  })

  test('rejects unknown keys, duplicate axes and dangling references atomically', async () => {
    const q = linearScale()
    const current = plot(host(), {
      title: 'original',
      scales: { q },
      axes: [axis('q', { id: 'axis' })],
    })
    await frame()
    expect(() => current.update({ title: 'broken', scales: { q: undefined } })).toThrow(
      /missing scale/,
    )
    expect(current.options.get().resolved.title).toBe('original')
    expect(current.scales.q.scale).toBe(q)
    expect(() =>
      current.update({ axes: [axis('q', { id: 'same' }), axis('q', { id: 'same' })] }),
    ).toThrow(/Duplicate axis id/)
    expect(() =>
      current.update({ scales: { missing: linearScale() }, axes: [axis('not-bound')] }),
    ).toThrow(/missing scale/)
    // @ts-expect-error Unknown options are also checked for untyped JavaScript callers.
    expect(() => current.update({ unknown: 1 })).toThrow(/plot.unknown/)
    expect(() => current.update({ margins: { top: -1 } })).toThrow(/plot.margins.top/)
    expect(() => current.update({ axes: [axis('q'), axis('q', { position: 'bottom' })] })).toThrow(
      /both x and y/,
    )
  })

  test('resizes automatically and keeps unrelated host content on destruction', async () => {
    const element = host()
    const child = document.createElement('span')
    element.append(child)
    const current = plot(element, { scales: { q: linearScale() } })
    await frame()
    element.style.width = '700px'
    await vi.waitFor(() => expect(current.size.get().width).toBe(700))
    expect(current.scales.q.range.get()).toEqual([292, 8])
    current.destroy()
    current.destroy()
    expect(element.children).toHaveLength(1)
    expect(element.firstChild).toBe(child)
    expect(() => current.update({ title: 'no' })).toThrow(/destroyed plot/)
    expect(() => current.setConfig({})).toThrow(/destroyed plot/)
  })

  test('releases reactive consumers and cancels queued rendering before first frame', async () => {
    const q = linearScale()
    q.domain.get()
    const baseline = reactive.getDiagnostics()
    for (let index = 0; index < 20; index += 1) {
      const current = plot(host(), { scales: { q } })
      current.destroy()
    }
    await frame()
    const diagnostics = reactive.getDiagnostics()
    expect(diagnostics.activeScopes).toBe(baseline.activeScopes)
    expect(diagnostics.activeEffects).toBe(baseline.activeEffects)
    expect(diagnostics.activeComputeds).toBe(baseline.activeComputeds)
    q.domain.set([10, 20])
    await frame()
    expect(reactive.getDiagnostics().effectRuns).toBe(diagnostics.effectRuns)
  })

  test('releases plugin, mark and scale-binding scopes on removal and destroy', async () => {
    const x = linearScale({ domain: [0, 1] })
    const y = linearScale({ domain: [0, 1] })
    x.domain.get()
    y.domain.get()
    const baseline = reactive.getDiagnostics()
    const current = plot(host(), { directions: { x: 'x', y: 'y' }, scales: { x, y } })
    await frame()
    const empty = reactive.getDiagnostics()
    const mark = series(createSeries({ x: [0, 1], y: [0, 1] }), { x: 'x', y: 'y' })
    for (let index = 0; index < 5; index += 1) {
      current.update({ plugins: [zoom()], marks: [mark] })
      await frame()
      current.update({ plugins: [], marks: [] })
      await frame()
    }
    expect(reactive.getDiagnostics().activeScopes).toBe(empty.activeScopes)
    expect(reactive.getDiagnostics().activeEffects).toBe(empty.activeEffects)
    current.update({ plugins: [zoom()], marks: [mark] })
    current.destroy()
    await frame()
    const diagnostics = reactive.getDiagnostics()
    expect(diagnostics.activeScopes).toBe(baseline.activeScopes)
    expect(diagnostics.activeEffects).toBe(baseline.activeEffects)
    expect(diagnostics.activeComputeds).toBe(baseline.activeComputeds)
  })

  test('coalesces shared updates into one plot render and ignores no-ops', async () => {
    const q = linearScale()
    const current = plot(host(), { scales: { q }, axes: [axis('q')] })
    await frame()
    const replace = vi.spyOn(
      current.element.querySelector('[data-layer="axes"]')!,
      'replaceChildren',
    )
    batch(() => {
      q.update({ domain: [0, 10] })
      q.update({ domain: [0, 20] })
      current.update({ title: 'updated' })
    })
    await frame()
    expect(replace).toHaveBeenCalledTimes(1)
    replace.mockClear()
    q.update({ domain: [0, 20] })
    current.update({ title: 'updated' })
    await frame()
    expect(replace).not.toHaveBeenCalled()
  })

  test('validates axis direction changes against every live consumer before committing', async () => {
    const shared = axis('q', { position: 'left' })
    const first = plot(host(), { scales: { q: linearScale() }, axes: [shared, axis('q')] })
    const second = plot(host(), { scales: { q: linearScale() }, axes: [shared] })
    await frame()
    expect(() => shared.update({ position: 'bottom', label: 'invalid' })).toThrow(/both x and y/)
    expect(shared.options.get().resolved).toMatchObject({ position: 'left', label: '' })
    first.destroy()
    shared.update({ position: 'bottom' })
    await frame()
    expect(second.scales.q.range.get()).toEqual([8, 492])
    second.destroy()
    expect(() => shared.update({ position: 'left' })).not.toThrow()
  })

  test('reconciles replacement bindings and reordered axes, detaching removed handles', async () => {
    const original = linearScale()
    const replacement = linearScale({ domain: [0, 10] })
    const first = axis('q', { id: 'first', label: 'first' })
    const second = axis('q', { id: 'second', label: 'second' })
    const current = plot(host(), { scales: { q: original }, axes: [first, second] })
    await frame()
    const before = current.scales.q
    current.update({ scales: { q: replacement }, axes: [second, first] })
    await frame()
    // Avoid matcher deep comparisons that read getters on the disposed binding.
    expect(current.scales.q === before).toBe(false) // NOSONAR(S5906) - intentional reference comparison to avoid deep comparison of disposed binding
    expect(current.scales.q.scale).toBe(replacement)
    expect(current.scales.q.invert(current.scales.q.project(5))).toBeCloseTo(5)
    expect(current.element.querySelector('[data-layer="axes"] > g')!.textContent).toContain(
      'second',
    )
    const version = current.regions.version
    original.domain.set([0, 20])
    await frame()
    expect(current.regions.version).toBe(version)
    current.update({ axes: [second] })
    await frame()
    const nextVersion = current.regions.version
    first.update({ label: 'detached', position: 'bottom' })
    await frame()
    expect(current.regions.version).toBe(nextVersion)
  })

  test('resolves theme tokens on change only and disconnects the opted-in observer', async () => {
    const element = host()
    element.style.setProperty('--fews-chart-accent', '#ff0000')
    const current = plot(element, { themeElement: element, theme: 'dark' })
    await frame()
    expect(current.theme.get().accent).toBe('#ff0000')
    expect(current.theme.get().background).toBe('#182026')
    const computed = vi.spyOn(window, 'getComputedStyle')
    current.update({ title: 'no theme change' })
    await frame()
    expect(computed).not.toHaveBeenCalled()
    element.style.setProperty('--fews-chart-accent', '#0000ff')
    await vi.waitFor(() => expect(current.theme.get().accent).toBe('#0000ff'))
    expect(computed).toHaveBeenCalledTimes(1)
    current.update({ theme: 'light', themeElement: undefined })
    await frame()
    expect(current.theme.get().background).toBe('#ffffff')
    computed.mockClear()
    element.style.setProperty('--fews-chart-accent', '#00ff00')
    await frame()
    expect(computed).not.toHaveBeenCalled()
  })

  test('repaints only style for colour changes and remeasures when the font changes', async () => {
    const current = plot(host(), {
      scales: { q: linearScale() },
      axes: [axis('q', { grid: true })],
    })
    await frame()
    const replace = vi.spyOn(
      current.element.querySelector('[data-layer="axes"]')!,
      'replaceChildren',
    )
    const regionsVersion = current.regions.version
    current.update({ theme: 'dark' })
    await frame()
    expect(replace).not.toHaveBeenCalled()
    expect(current.regions.version).toBe(regionsVersion)
    current.update({ themeElement: hosts[0] })
    await frame()
    hosts[0].style.setProperty('--fews-chart-font-size', '24px')
    await vi.waitFor(() => expect(current.theme.get().fontSize).toBe(24))
    expect(replace).toHaveBeenCalledTimes(1)
    expect(current.regions.version).toBeGreaterThan(regionsVersion)
  })

  test('applies a theme replacement before the initial scheduled frame', async () => {
    const current = plot(host(), { theme: 'light' })
    current.update({ theme: 'dark' })
    await frame()
    expect(current.theme.get().background).toBe('#182026')
    expect(current.element.querySelector('rect')!.getAttribute('fill')).toContain('#182026')
  })

  test('renders unlimited secondary axes, categorical and time scales without global locale changes', async () => {
    const current = plot(host(1000, 500), {
      scales: {
        t: timeScale({
          domain: [Date.UTC(2026, 9, 24), Date.UTC(2026, 9, 26)],
          timeZone: 'Europe/Amsterdam',
        }),
        q: linearScale({ domain: [0, 10] }),
        h: linearScale({ domain: [-1, 1] }),
        dir: degreesScale(),
        categories: bandScale({ domain: ['a', 'b', 'c'] }),
      },
      axes: [
        axis('t', { position: 'bottom' }),
        axis('q', { position: 'left', label: 'Flow' }),
        axis('h', { position: 'left' }),
        axis('dir', { position: 'right' }),
        axis('categories', { position: 'top' }),
      ],
    })
    await frame()
    expect(current.element.querySelectorAll('[data-layer="axes"] > g')).toHaveLength(5)
    const regions = current.regions.get()
    expect(regions.axes[2].x + regions.axes[2].width).toBe(regions.axes[1].x)
    expect(current.scales.categories.bandwidth).toBeGreaterThan(0)
    expect(current.element.textContent).toContain('Oct')
    expect(current.element.textContent).toContain('a')
    expect(() => current.scales.categories.invert(20)).toThrow(/band/)
  })

  test.each(['top', 'right', 'bottom', 'left'] as const)(
    'preserves %s axis geometry, band centering, grid and captions',
    async (position) => {
      const handle = axis('categories', {
        position,
        grid: true,
        label: 'Category',
        unit: 'm',
        labelAngle: 30,
        format: (value) => `tick:${value}`,
      })
      const current = plot(host(), {
        scales: { categories: bandScale({ domain: ['a', 'b', 'c'], reverse: true }) },
        axes: [handle],
      })
      await frame()
      const group = current.element.querySelector('[data-layer="axes"] > g')!
      const grid = current.element.querySelector('[data-layer="grid"]')!
      const region = current.regions.get().plot
      const bandRegion = current.regions.get().axes[0]
      const horizontal = position === 'top' || position === 'bottom'
      const sign = position === 'top' || position === 'left' ? -1 : 1
      const baseline = {
        top: bandRegion.y + bandRegion.height,
        right: bandRegion.x,
        bottom: bandRegion.y,
        left: bandRegion.x + bandRegion.width,
      }[position]
      const coordinates = (element: Element) =>
        ['x1', 'y1', 'x2', 'y2'].map((name) => Number(element.getAttribute(name)))
      expect(group.getAttribute('fill')).toBe('currentColor')
      expect(coordinates(group.firstElementChild!)).toEqual(
        horizontal
          ? [region.x, baseline, region.x + region.width, baseline]
          : [baseline, region.y, baseline, region.y + region.height],
      )
      const ticks = current.scales.categories.ticks(6)
      const lines = group.querySelectorAll('line')
      expect(lines).toHaveLength(ticks.length + 1)
      expect(grid.children).toHaveLength(ticks.length)
      ticks.forEach((value, index) => {
        const pixel =
          current.scales.categories.project(value) + current.scales.categories.bandwidth / 2
        const x = horizontal ? pixel : baseline
        const y = horizontal ? baseline : pixel
        const line = lines[index + 1]
        expect(coordinates(line)).toEqual([
          x,
          y,
          x + (horizontal ? 0 : sign * 5),
          y + (horizontal ? sign * 5 : 0),
        ])
        expect(line.getAttribute('stroke')).toBe('currentColor')
        const label = line.nextElementSibling!
        const labelX = x + (horizontal ? 0 : sign * 9)
        const labelY = y + (horizontal ? sign * 9 : 0)
        expect(label.textContent).toBe(`tick:${value}`)
        expect(Number(label.getAttribute('x'))).toBe(labelX)
        expect(Number(label.getAttribute('y'))).toBe(labelY)
        expect(label.getAttribute('transform')).toBe(`rotate(30 ${labelX} ${labelY})`)
        expect(label.getAttribute('text-anchor')).toBe(
          horizontal ? 'middle' : position === 'left' ? 'end' : 'start',
        )
        expect(label.getAttribute('dominant-baseline')).toBe(
          horizontal ? (position === 'top' ? 'auto' : 'hanging') : 'middle',
        )
        expect(coordinates(grid.children[index])).toEqual(
          horizontal
            ? [pixel, region.y, pixel, region.y + region.height]
            : [region.x, pixel, region.x + region.width, pixel],
        )
        expect(grid.children[index].getAttribute('stroke')).toBe('inherit')
      })
      const fontSize = current.theme.get().fontSize
      const captionX = horizontal
        ? region.x + region.width / 2
        : bandRegion.x + (sign < 0 ? fontSize : bandRegion.width - fontSize)
      const captionY = horizontal
        ? bandRegion.y + (sign > 0 ? bandRegion.height - fontSize : fontSize)
        : region.y + region.height / 2
      const caption = group.lastElementChild!
      expect(caption.textContent).toBe('Category (m)')
      expect(Number(caption.getAttribute('x'))).toBe(captionX)
      expect(Number(caption.getAttribute('y'))).toBe(captionY)
      expect(caption.getAttribute('transform')).toBe(
        horizontal ? null : `rotate(-90 ${captionX} ${captionY})`,
      )
      expect(caption.getAttribute('text-anchor')).toBe('middle')
      expect(caption.getAttribute('dominant-baseline')).toBe('middle')

      handle.update({ grid: false, label: '', unit: '', labelAngle: 0 })
      await frame()
      const updatedGroup = current.element.querySelector('[data-layer="axes"] > g')!
      expect(grid.children).toHaveLength(0)
      expect(updatedGroup.querySelectorAll('text')).toHaveLength(ticks.length)
      expect(updatedGroup.querySelector('[transform]')).toBeNull()
    },
  )

  test.each(['top', 'bottom'] as const)(
    'renders multi-level civil-time labels on %s with per-axis timezone overrides',
    async (position) => {
      const current = plot(host(700, 320), {
        scales: {
          t: timeScale({
            domain: [Date.UTC(2024, 11, 31, 18), Date.UTC(2025, 0, 2, 18)],
            timeZone: 'UTC',
          }),
        },
        axes: [
          axis('t', {
            position,
            timeZone: 'America/New_York',
            locale: 'en-US',
            labelAngle: 15,
          }),
        ],
      })
      await frame()
      const contexts = [...current.element.querySelectorAll('[data-tick-context]')]
      expect(contexts.length).toBeGreaterThan(0)
      expect(contexts.map((label) => label.textContent).join(' ')).toContain('Dec 31, 2024')
      expect(current.regions.get().axes[0].height).toBeGreaterThanOrEqual(36)
      for (const context of contexts) {
        const primary = context.previousElementSibling!
        const x = Number(context.getAttribute('x'))
        const y = Number(context.getAttribute('y'))
        expect(x).toBe(Number(primary.getAttribute('x')))
        expect(y - Number(primary.getAttribute('y'))).toBe(
          (position === 'top' ? -1 : 1) * current.theme.get().fontSize,
        )
        expect(context.getAttribute('transform')).toBe(`rotate(15 ${x} ${y})`)
      }

      current.options.get().resolved.axes[0].update({ format: () => 'custom' })
      await frame()
      expect(current.element.querySelectorAll('[data-tick-context]')).toHaveLength(0)
      expect(current.element.textContent).toContain('custom')
    },
  )
})

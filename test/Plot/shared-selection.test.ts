import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  bandScale,
  brush,
  createPlot,
  linearScale,
  ModifierKey,
  sharedClock,
  sharedSelection,
  subscribe,
  type BrushHandle,
  type Plot,
  type PlotConfig,
} from '../../src/index.js'
import { reactive } from '../../src/core/runtime.js'

const plots: Plot[] = []
const hosts: HTMLElement[] = []
const stops: (() => void)[] = []
function mount(handle: BrushHandle, config: PlotConfig, width = 500) {
  const host = document.createElement('div')
  document.body.append(host)
  hosts.push(host)
  const plot = createPlot(host, {
    width,
    height: 300,
    margins: { top: 20, right: 20, bottom: 20, left: 20 },
    plugins: [handle],
    ...config,
  })
  plots.push(plot)
  vi.spyOn(plot.element, 'getBoundingClientRect').mockImplementation(
    () => new DOMRect(0, 0, plot.size.get().width, plot.size.get().height),
  )
  return plot
}
async function frames() {
  for (let index = 0; index < 3; index += 1) await new Promise(requestAnimationFrame)
}
function pointer(plot: Plot, type: string, x: number, y = 100, target: Element = plot.element) {
  target.dispatchEvent(
    new PointerEvent(type, {
      clientX: x,
      clientY: y,
      isPrimary: true,
      pointerId: 1,
      button: 0,
      bubbles: true,
      cancelable: true,
    }),
  )
}
function rect(plot: Plot) {
  return plot.element.querySelector('[data-brush-selection]')!
}
function bounds(plot: Plot) {
  return ['x', 'y', 'width', 'height'].map((name) => Number(rect(plot).getAttribute(name)))
}
afterEach(() => {
  for (const stop of stops.splice(0)) stop()
  for (const plot of plots.splice(0)) plot.destroy()
  for (const host of hosts.splice(0)) host.remove()
  vi.restoreAllMocks()
})

describe('shared brush selection', () => {
  test('propagates bidirectional gestures across unequal local bindings without echoing brush events', async () => {
    const selection = sharedSelection()
    const x = linearScale({ domain: [0, 100] })
    const a = brush({ mode: 'x', modifier: ModifierKey.None, persistent: true, selection })
    const b = brush({ mode: 'x', modifier: ModifierKey.None, persistent: true, selection })
    const first = mount(a, { scales: { t: x }, directions: { t: 'x' } })
    const second = mount(b, { scales: { time: x }, directions: { time: 'x' } }, 800)
    await frames()
    const firstEvents = vi.fn()
    const secondEvents = vi.fn()
    const notifications = vi.fn()
    first.element.addEventListener('brush', firstEvents)
    second.element.addEventListener('brush', secondEvents)
    stops.push(subscribe(selection.selection, notifications))
    await frames()
    notifications.mockClear()
    pointer(first, 'pointerdown', first.scales.t.project(20))
    pointer(first, 'pointerup', first.scales.t.project(40))
    await frames()
    expect(a.selection.get()?.scales.t).toEqual([20, 40])
    expect(b.selection.get()?.scales.time).toEqual([20, 40])
    expect(bounds(second)[0]).toBeCloseTo(second.scales.time.project(20))
    expect(bounds(second)[2]).toBeCloseTo(
      second.scales.time.project(40) - second.scales.time.project(20),
    )
    expect(firstEvents).toHaveBeenCalledTimes(1)
    expect(secondEvents).not.toHaveBeenCalled()
    expect(notifications).toHaveBeenCalledTimes(1)
    const previous = selection.selection.version
    pointer(second, 'pointerdown', second.scales.time.project(30), 100, rect(second))
    pointer(second, 'pointermove', second.scales.time.project(50))
    pointer(second, 'pointerup', second.scales.time.project(50))
    await frames()
    expect(a.selection.get()?.scales.t[0]).toBeCloseTo(40)
    expect(a.selection.get()?.scales.t[1]).toBeCloseTo(60)
    expect(firstEvents).toHaveBeenCalledTimes(1)
    expect(secondEvents).toHaveBeenCalledTimes(2)
    expect(selection.selection.version).toBe(previous + 1)
    b.setSelection(undefined)
    await frames()
    expect(rect(first).getAttribute('display')).toBe('none')
    expect(rect(second).getAttribute('display')).toBe('none')
    expect(secondEvents).toHaveBeenCalledTimes(2)
  })

  test('reprojects programmatic xy selection through reversed ranges and clips without mutating shared state', async () => {
    const selection = sharedSelection()
    const x = linearScale({ domain: [0, 100], reverse: true })
    const y = linearScale({ domain: [0, 100] })
    selection.setSelection({
      mode: 'xy',
      ranges: [
        { scale: x, axis: 'x', range: [20, 40] },
        { scale: y, axis: 'y', range: [30, 60] },
      ],
    })
    const handle = brush({ persistent: true, selection })
    const plot = mount(handle, { scales: { t: x, q: y }, directions: { t: 'x', q: 'y' } })
    const event = vi.fn()
    plot.element.addEventListener('brush', event)
    await frames()
    expect(bounds(plot)[0]).toBeCloseTo(plot.scales.t.project(40))
    expect(bounds(plot)[2]).toBeCloseTo(plot.scales.t.project(20) - plot.scales.t.project(40))
    expect(bounds(plot)[1]).toBeCloseTo(plot.scales.q.project(60))
    const state = selection.selection.get()
    plot.update({ width: 800 })
    x.domain.set([30, 100])
    await frames()
    expect(bounds(plot)[0]).toBeCloseTo(plot.scales.t.project(40))
    expect(bounds(plot)[0] + bounds(plot)[2]).toBeCloseTo(
      plot.regions.get().plot.x + plot.regions.get().plot.width,
    )
    x.domain.set([50, 100])
    await frames()
    expect(rect(plot).getAttribute('display')).toBe('none')
    expect(selection.selection.get()).toBe(state)
    x.domain.set([0, 100])
    await frames()
    expect(rect(plot).getAttribute('display')).toBe('')
    expect(event).not.toHaveBeenCalled()
  })

  test('detaches on removal/destroy and restores persistent state on recreation with no resource leaks', async () => {
    const selection = sharedSelection()
    const x = linearScale({ domain: [0, 100] })
    const a = brush({ mode: 'x', persistent: true, selection })
    const b = brush({ mode: 'x', persistent: true, selection })
    const baseline = reactive.getDiagnostics()
    const config = { scales: { x }, directions: { x: 'x' as const } }
    const first = mount(a, config)
    const second = mount(b, config)
    await frames()
    a.setSelection({ mode: 'x', scales: { x: [10, 30] } })
    await frames()
    const state = selection.selection.get()
    first.update({ plugins: [] })
    first.destroy()
    await frames()
    expect(selection.selection.get()).toBe(state)
    expect(rect(second).getAttribute('display')).toBe('')
    const third = mount(a, config, 800)
    await frames()
    expect(bounds(third)[0]).toBeCloseTo(third.scales.x.project(10))
    second.destroy()
    third.destroy()
    expect(selection.selection.get()).toBe(state)
    expect(reactive.getDiagnostics().activeScopes).toBe(baseline.activeScopes)
    expect(reactive.getDiagnostics().activeEffects).toBe(baseline.activeEffects)
    expect(reactive.getDiagnostics().activeComputeds).toBe(baseline.activeComputeds)
  })

  test('tracks shared-handle replacement, local membership and mismatched directions', async () => {
    const selection = sharedSelection()
    const next = sharedSelection()
    const x = linearScale({ domain: [0, 100] })
    selection.setSelection({ mode: 'x', ranges: [{ scale: x, axis: 'x', range: [10, 30] }] })
    next.setSelection({ mode: 'x', ranges: [{ scale: x, axis: 'x', range: [50, 70] }] })
    const handle = brush({ mode: 'x', persistent: true, selection })
    const plot = mount(handle, { scales: { t: x }, directions: { t: 'x' } })
    await frames()
    handle.update({ selection: next })
    await frames()
    expect(handle.selection.get()?.scales.t).toEqual([50, 70])
    plot.update({ scales: { t: undefined, time: x }, directions: { t: undefined, time: 'x' } })
    await frames()
    expect(handle.selection.get()?.scales.time).toEqual([50, 70])
    const unrelated = linearScale({ domain: [0, 100] })
    plot.update({ scales: { time: unrelated } })
    await frames()
    expect(rect(plot).getAttribute('display')).toBe('none')
    plot.update({ scales: { time: x }, directions: { time: 'y' } })
    await frames()
    expect(rect(plot).getAttribute('display')).toBe('none')
    plot.update({ directions: { time: 'x' } })
    await frames()
    expect(rect(plot).getAttribute('display')).toBe('')
    expect(selection.selection.get()?.ranges[0].range).toEqual([10, 30])
    handle.update({ selection: undefined })
    await frames()
    expect(handle.selection.get()).toBeUndefined()
    expect(next.selection.get()?.ranges[0].range).toEqual([50, 70])
  })

  test.each([false, true])(
    'retains categorical selections across missing categories (reverse: %s)',
    async (reverse) => {
      const selection = sharedSelection()
      const x = bandScale({ domain: ['a', 'b', 'c'], reverse })
      const handle = brush({ mode: 'x', persistent: true, selection })
      const plot = mount(handle, { scales: { x } })
      await frames()
      handle.setSelection({ mode: 'x', scales: { x: ['b', 'c'] } })
      await frames()
      expect(bounds(plot)[2]).toBeCloseTo(2 * plot.scales.x.bandwidth)
      x.domain.set(['a'])
      await frames()
      expect(rect(plot).getAttribute('display')).toBe('none')
      expect(handle.selection.get()?.scales.x).toEqual(['b', 'c'])
      x.domain.set(['a', 'b', 'c'])
      await frames()
      expect(rect(plot).getAttribute('display')).toBe('')
    },
  )

  test('external selection changes cancel an active drag without overwriting the new shared state', async () => {
    const selection = sharedSelection()
    const x = linearScale({ domain: [0, 100] })
    const handle = brush({ mode: 'x', persistent: true, selection, modifier: ModifierKey.None })
    const plot = mount(handle, { scales: { x }, directions: { x: 'x' } })
    await frames()
    pointer(plot, 'pointerdown', plot.scales.x.project(10))
    pointer(plot, 'pointermove', plot.scales.x.project(30))
    selection.setSelection({ mode: 'x', ranges: [{ scale: x, axis: 'x', range: [50, 70] }] })
    await frames()
    pointer(plot, 'pointermove', plot.scales.x.project(80))
    pointer(plot, 'pointerup', plot.scales.x.project(80))
    await frames()
    expect(handle.selection.get()?.scales.x).toEqual([50, 70])
  })

  test('one clock updates multiple plot-owned consumers and survives one plot being destroyed', async () => {
    const selection = sharedSelection()
    const x = linearScale()
    const config = { scales: { x }, directions: { x: 'x' as const } }
    const a = mount(brush({ mode: 'x', persistent: true, selection }), config)
    const b = mount(brush({ mode: 'x', persistent: true, selection }), config)
    const clock = sharedClock({ initial: 1000 })
    const first = vi.fn()
    const second = vi.fn()
    const controller = new AbortController()
    stops.push(subscribe(clock.time, first, { signal: controller.signal }))
    stops.push(subscribe(clock.time, second))
    await frames()
    first.mockClear()
    second.mockClear()
    clock.set(2000)
    await frames()
    expect(first).toHaveBeenCalledWith(2000, 1000)
    expect(second).toHaveBeenCalledWith(2000, 1000)
    controller.abort()
    a.destroy()
    clock.set(3000)
    await frames()
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenLastCalledWith(3000, 2000)
    b.destroy()
    expect(clock.destroyed).toBe(false)
    clock.destroy()
  })
})

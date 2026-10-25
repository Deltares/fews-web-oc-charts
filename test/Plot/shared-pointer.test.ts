import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  bandScale,
  createPlot,
  crosshair,
  line,
  linearScale,
  sharedPointer,
  subscribe,
  type Plot,
  type PlotConfig,
} from '../../src/index.js'
import { reactive } from '../../src/core/runtime.js'

const plots: Plot[] = []
const hosts: HTMLElement[] = []

function mount(config: PlotConfig, width = 500) {
  const host = document.createElement('div')
  document.body.append(host)
  hosts.push(host)
  const plot = createPlot(host, {
    width,
    height: 300,
    margins: { top: 20, right: 20, bottom: 20, left: 20 },
    ...config,
  })
  plots.push(plot)
  vi.spyOn(plot.element, 'getBoundingClientRect').mockImplementation(
    () => new DOMRect(0, 0, plot.size.get().width, plot.size.get().height),
  )
  return plot
}

async function frames() {
  for (let index = 0; index < 4; index += 1) {
    await new Promise(requestAnimationFrame)
  }
}

function move(plot: Plot, x: number, y = 100, type = 'pointermove') {
  plot.element.dispatchEvent(
    new PointerEvent(type, {
      clientX: x,
      clientY: y,
      isPrimary: true,
      pointerId: 1,
    }),
  )
}

function layer(plot: Plot) {
  return plot.element.querySelector('[data-layer="crosshair"]')!
}

function guide(plot: Plot, axis: string) {
  return plot.element.querySelector(`[data-crosshair-axis="${axis}"]`)!
}

function guidePosition(plot: Plot, axis: 'x' | 'y') {
  const region = plot.regions.get().plot
  return Number(guide(plot, axis).getAttribute(`${axis}1`)) + region[axis]
}

afterEach(() => {
  for (const plot of plots.splice(0)) plot.destroy()
  for (const host of hosts.splice(0)) host.remove()
  vi.restoreAllMocks()
})

describe('shared pointer crosshairs', () => {
  test('projects scale identities through unequal local bindings and never echoes pixels', async () => {
    const t = linearScale({ domain: [0, 100] })
    const pointer = sharedPointer()
    const first = mount({
      scales: { time: t },
      directions: { time: 'x' },
      plugins: [crosshair({ pointer, labels: { x: 'time' } })],
    })
    const second = mount(
      {
        scales: { otherName: t },
        directions: { otherName: 'x' },
        plugins: [crosshair({ pointer, labels: { x: 'otherName' } })],
      },
      800,
    )
    await frames()
    const notify = vi.fn()
    const stop = subscribe(pointer.state, notify)
    await frames()
    notify.mockClear()
    move(first, first.scales.time.project(25))
    await frames()
    expect(guidePosition(first, 'x')).toBeCloseTo(first.scales.time.project(25))
    expect(guidePosition(second, 'x')).toBeCloseTo(second.scales.otherName.project(25))
    expect(guidePosition(second, 'x')).not.toBe(guidePosition(first, 'x'))
    expect(guide(second, 'y').getAttribute('display')).toBe('none')
    expect(layer(second).getAttribute('display')).toBe('')
    expect(second.pointer.get().inside).toBe(false)
    expect(notify).toHaveBeenCalledTimes(1)
    const state = pointer.state.get()
    expect(state).toMatchObject({ active: true, values: [{ scale: t, value: 25 }] })
    expect(Object.isFrozen(state)).toBe(true)
    expect(Object.isFrozen(state.values)).toBe(true)
    expect(Object.isFrozen(state.values[0])).toBe(true)
    const version = pointer.state.version
    second.update({ width: 600 })
    t.update({ reverse: true })
    t.domain.set([0, 200])
    await frames()
    expect(guidePosition(second, 'x')).toBeCloseTo(second.scales.otherName.project(25))
    expect(pointer.state.version).toBe(version)
    expect(notify).toHaveBeenCalledTimes(1)
    stop()
  })

  test.each(['y', 'xy'] as const)(
    'shares %s coordinates and ignores unrelated identities',
    async (by) => {
      const x = linearScale({ domain: [0, 100] })
      const y = linearScale({ domain: [0, 100], reverse: true })
      const pointer = sharedPointer({ by })
      const a = mount({
        scales: { x, y },
        directions: { x: 'x', y: 'y' },
        plugins: [crosshair({ pointer })],
      })
      const b = mount(
        {
          scales: { xx: x, yy: y },
          directions: { xx: 'x', yy: 'y' },
          plugins: [crosshair({ pointer })],
        },
        800,
      )
      const unrelated = mount({
        scales: { x: linearScale({ domain: [0, 100] }) },
        directions: { x: 'x' },
        plugins: [crosshair({ pointer })],
      })
      await frames()
      move(a, a.scales.x.project(25), a.scales.y.project(70))
      await frames()
      expect(guidePosition(b, 'y')).toBeCloseTo(b.scales.yy.project(70))
      expect(guide(b, 'x').getAttribute('display')).toBe(by === 'xy' ? '' : 'none')
      expect(layer(unrelated).getAttribute('display')).toBe('none')
    },
  )

  test('clips per destination and reprojects a stationary domain value without publishing', async () => {
    const x = linearScale({ domain: [0, 100] })
    const pointer = sharedPointer()
    const a = mount({
      scales: { x },
      directions: { x: 'x' },
      plugins: [crosshair({ pointer })],
    })
    const b = mount(
      {
        scales: { x },
        directions: { x: 'x' },
        plugins: [crosshair({ pointer, mode: 'x' })],
      },
      800,
    )
    await frames()
    move(a, a.scales.x.project(25))
    await frames()
    const version = pointer.state.version
    x.domain.set([50, 100])
    await frames()
    expect(layer(b).getAttribute('display')).toBe('none')
    expect(pointer.state.get().active).toBe(true)
    x.domain.set([0, 50])
    await frames()
    expect(layer(b).getAttribute('display')).toBe('')
    expect(guidePosition(b, 'x')).toBeCloseTo(b.scales.x.project(25))
    expect(pointer.state.version).toBe(version)
  })

  test('hands ownership to the latest source and ignores an older source leaving or dying', async () => {
    const x = linearScale({ domain: [0, 100] })
    const pointer = sharedPointer()
    const config = {
      scales: { x },
      directions: { x: 'x' as const },
      plugins: [crosshair({ pointer })],
    }
    const a = mount(config)
    const b = mount(config, 800)
    await frames()
    move(a, a.scales.x.project(20))
    await frames()
    const oldSource = pointer.state.get().source
    move(b, b.scales.x.project(70))
    await frames()
    const state = pointer.state.get()
    expect(state.source).not.toBe(oldSource)
    move(a, 0, 0, 'pointerleave')
    await frames()
    a.destroy()
    expect(pointer.state.get()).toBe(state)
    move(b, 0, 0, 'pointercancel')
    await frames()
    expect(pointer.state.get().active).toBe(false)
    expect(layer(b).getAttribute('display')).toBe('none')
  })

  test('clears an active owner on removal/destroy, cancels queued input and permits recreation', async () => {
    const x = linearScale({ domain: [0, 100] })
    const pointer = sharedPointer()
    const handle = crosshair({ pointer })
    const baseline = reactive.getDiagnostics()
    const config = { scales: { x }, directions: { x: 'x' as const }, plugins: [handle] }
    const a = mount(config)
    const b = mount(config)
    await frames()
    move(a, a.scales.x.project(20))
    await frames()
    a.update({ plugins: [] })
    await frames()
    expect(pointer.state.get().active).toBe(false)
    expect(layer(b).getAttribute('display')).toBe('none')
    move(a, a.scales.x.project(40))
    await frames()
    expect(pointer.state.get().active).toBe(false)
    a.update({ plugins: [handle] })
    await frames()
    move(a, a.scales.x.project(60))
    await frames()
    expect(pointer.state.get().active).toBe(true)
    move(a, a.scales.x.project(80))
    a.destroy()
    await frames()
    expect(pointer.state.get().active).toBe(false)
    expect(layer(b).getAttribute('display')).toBe('none')
    const c = mount(config)
    await frames()
    move(c, c.scales.x.project(10))
    await frames()
    expect(guidePosition(b, 'x')).toBeCloseTo(b.scales.x.project(10))
    b.destroy()
    c.destroy()
    expect(reactive.getDiagnostics().activeEffects).toBe(baseline.activeEffects)
    expect(reactive.getDiagnostics().activeScopes).toBe(baseline.activeScopes)
    expect(reactive.getDiagnostics().activeComputeds).toBe(baseline.activeComputeds)
  })

  test('switches pointer handles and scale membership without republishing stale local values', async () => {
    const x = linearScale({ domain: [0, 100] })
    const pointer = sharedPointer()
    const next = sharedPointer()
    const handle = crosshair({ pointer })
    const a = mount({ scales: { x }, directions: { x: 'x' }, plugins: [handle] })
    await frames()
    move(a, a.scales.x.project(20))
    await frames()
    handle.update({ pointer: next })
    await frames()
    expect(pointer.state.get().active).toBe(false)
    expect(next.state.get().active).toBe(false)
    move(a, a.scales.x.project(40))
    await frames()
    expect(next.state.get().values[0].value).toBeCloseTo(40)
    a.update({ title: 'Not a binding change' })
    handle.update({ mode: 'x' })
    await frames()
    expect(next.state.get().active).toBe(true)
    a.update({ scales: { x: linearScale({ domain: [0, 200] }) } })
    await frames()
    expect(next.state.get().active).toBe(false)
    move(a, a.scales.x.project(80))
    await frames()
    expect(next.state.get().values[0].value).toBeCloseTo(80)
    handle.update({ pointer: undefined })
    await frames()
    expect(next.state.get().active).toBe(false)
    expect(layer(a).getAttribute('display')).toBe('')
  })

  test.each(['xy', 'y'] as const)(
    'snaps on destination data in %s mode without broadcasting the snapped result',
    async (mode) => {
      const x = linearScale({ domain: [0, 100] })
      const y = linearScale({ domain: [0, 100] })
      const pointer = sharedPointer()
      const a = mount({
        scales: { x },
        directions: { x: 'x' },
        plugins: [crosshair({ pointer })],
      })
      const mark = line({ x: 't', y: 'q', xValues: [20, 60], yValues: [30, 80] })
      const b = mount(
        {
          scales: { t: x, q: y },
          directions: { t: 'x', q: 'y' },
          marks: [mark],
          plugins: [
            crosshair({ pointer, mode, snap: { mark, axis: 'x' }, labels: { x: 't', y: 'q' } }),
          ],
        },
        800,
      )
      await frames()
      move(a, a.scales.x.project(22))
      await frames()
      expect(guidePosition(b, 'x')).toBeCloseTo(b.scales.t.project(20))
      expect(guidePosition(b, 'y')).toBeCloseTo(b.scales.q.project(30))
      expect(guide(b, 'x').getAttribute('display')).toBe(mode.includes('x') ? '' : 'none')
      expect(pointer.state.get().values[0].value).toBeCloseTo(22)
      expect(guidePosition(a, 'x')).toBeCloseTo(a.scales.x.project(22))
      expect(b.pointer.get().inside).toBe(false)
    },
  )

  test.each([false, true])(
    'shares band values by identity and hides removed categories (reverse: %s)',
    async (reverse) => {
      const x = bandScale({ domain: ['a', 'b', 'c'], reverse })
      const pointer = sharedPointer()
      const config = {
        scales: { x },
        directions: { x: 'x' as const },
        plugins: [crosshair({ pointer })],
      }
      const a = mount(config)
      const b = mount(config, 800)
      await frames()
      move(a, a.scales.x.project('b') + a.scales.x.bandwidth / 2)
      await frames()
      expect(pointer.state.get().values[0].value).toBe('b')
      expect(guidePosition(b, 'x')).toBeCloseTo(b.scales.x.project('b'))
      x.domain.set(['a', 'c'])
      await frames()
      expect(layer(b).getAttribute('display')).toBe('none')
    },
  )

  test('validates options atomically and preserves handle identity', () => {
    const pointer = sharedPointer({ by: 'xy' })
    const handle = crosshair({ pointer })
    expect(handle.options.get().resolved.pointer).toBe(pointer)
    expect(pointer.by).toBe('xy')
    expect(() => sharedPointer({ by: 'bad' as 'x' })).toThrow(/by/)
    expect(() => sharedPointer({ extra: true } as object)).toThrow(/Unknown option/)
    expect(() => handle.update({ pointer: { by: 'x' } })).toThrow(/sharedPointer/)
    expect(handle.options.get().resolved.pointer).toBe(pointer)
  })
})

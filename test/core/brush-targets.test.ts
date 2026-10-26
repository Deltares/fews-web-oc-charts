import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { bandScale, brush, linearScale, sharedSelection, timeScale } from '../../src/index.js'
import { connectBrushSelection } from '../../src/plot/plugins/brush/brush.js'
import { reactive, sourceOf, withSource } from '../../src/core/runtime.js'
import { connectBrushTargets } from '../../src/plot/plugins/brush/brush-targets.js'

let frames: FrameRequestCallback[] = []
function flush() {
  while (frames.length) {
    const callbacks = frames
    frames = []
    for (const callback of callbacks) callback(0)
  }
}
beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback)
    return frames.length
  })
})
afterEach(() => {
  flush()
  vi.unstubAllGlobals()
})

test('synchronizes target domains, skips own echoes and releases all synchronization on disposal', () => {
  const target = timeScale({ domain: [100.25, 300.75] })
  const overview = timeScale({ domain: [0, 1000] })
  const handle = brush({ mode: 'x', persistent: true, targets: { t: target } })
  const context = { scales: { t: overview }, direction: () => 'x' as const }
  const disconnect = connectBrushSelection(handle, context)
  const scope = reactive.createScope()
  const stop = scope.run(() => connectBrushTargets(handle, context))
  try {
    flush()
    expect(handle.selection.get()?.scales.t).toEqual([100.25, 300.75])
    target.domain.set([200.25, 400.75])
    flush()
    expect(handle.selection.get()?.scales.t).toEqual([200.25, 400.75])
    handle.setSelection({ mode: 'x', scales: { t: [300.25, 500.75] } })
    const selection = handle.selection.get()
    flush()
    expect(handle.selection.get()).toBe(selection)
    expect(target.domain.get()).toEqual([300.25, 500.75])
    target.domain.set([400.25, 600.75])
    handle.setSelection(undefined)
    flush()
    expect(handle.selection.get()).toBeUndefined()
    expect(target.domain.get()).toEqual([400.25, 600.75])
    target.domain.set([500.25, 700.75])
    flush()
    expect(handle.selection.get()?.scales.t).toEqual([500.25, 700.75])
    scope.dispose()
    target.domain.set([600.25, 800.75])
    flush()
    expect(handle.selection.get()?.scales.t).toEqual([500.25, 700.75])
    expect(overview.domain.get()).toEqual([0, 1000])
  } finally {
    stop()
    scope.dispose()
    disconnect()
  }
})

test('rebinds mapped axes and derives auto direction without retaining old target subscriptions', () => {
  const first = linearScale({ domain: [10, 20] })
  const second = linearScale({ domain: [30, 40] })
  const vertical = linearScale({ domain: [50, 60] })
  const handle = brush({ mode: 'auto', persistent: true, targets: { x: first } })
  const context = {
    scales: { x: linearScale(), y: linearScale() },
    direction: (name: string) => (name === 'x' ? ('x' as const) : ('y' as const)),
  }
  const disconnect = connectBrushSelection(handle, context)
  const scope = reactive.createScope()
  const stop = scope.run(() => connectBrushTargets(handle, context))
  try {
    flush()
    expect(handle.selection.get()).toEqual({ mode: 'x', scales: { x: [10, 20] } })
    handle.update({ targets: { x: second, y: vertical } })
    flush()
    expect(handle.selection.get()).toEqual({ mode: 'xy', scales: { x: [30, 40], y: [50, 60] } })
    const selection = handle.selection.get()
    first.domain.set([100, 200])
    flush()
    expect(handle.selection.get()).toBe(selection)
    handle.update({ targets: undefined })
    flush()
    expect(handle.selection.get()).toBeUndefined()
    second.domain.set([100, 200])
    flush()
    expect(handle.selection.get()).toBeUndefined()
  } finally {
    stop()
    scope.dispose()
    disconnect()
  }
})

test('programmatic selections update mapped targets without narrowing the overview', () => {
  const overview = timeScale({ domain: [0, 1000] })
  const target = timeScale({ domain: [100.25, 300.75], follow: { window: 200.5 } })
  const handle = brush({ mode: 'x', persistent: true, targets: { t: target } })
  const disconnect = connectBrushSelection(handle, {
    scales: { t: overview },
    direction: () => 'x',
  })
  try {
    handle.setSelection({ mode: 'x', scales: { t: [200.25, 400.75] } })
    expect(target.domain.get()).toEqual([200.25, 400.75])
    expect(sourceOf(target)).toBe('api')
    expect(target.following.get()).toBe(true)
    expect(overview.domain.get()).toEqual([0, 1000])
    withSource('brush', () => handle.setSelection({ mode: 'x', scales: { t: [300.25, 500.75] } }))
    expect(target.following.get()).toBe(false)
    expect(sourceOf(target)).toBe('brush')
    const version = target.domain.version
    handle.setSelection({ mode: 'x', scales: { t: [300.25, 500.75] } })
    expect(target.domain.version).toBe(version)
    handle.setSelection(undefined)
    expect(handle.selection.get()).toBeUndefined()
    expect(target.domain.get()).toEqual([300.25, 500.75])
  } finally {
    disconnect()
  }
})

test('validates target configurations and installed mappings before changing options', () => {
  const target = timeScale({ domain: [100, 200] })
  expect(() => brush({ targets: { t: target } })).toThrow(/persistent/)
  expect(() => brush({ persistent: true, targets: {} })).toThrow(/non-empty/)
  expect(() => brush({ persistent: true, targets: { t: bandScale() } })).toThrow(/continuous/)
  expect(() =>
    brush({ persistent: true, targets: { t: target }, selection: sharedSelection() }),
  ).toThrow(/cannot be combined/)
  expect(() => brush({ persistent: true, targets: { t: target, other: target } })).toThrow(
    /distinct/,
  )
  const handle = brush({ mode: 'x', persistent: true, targets: { t: target } })
  expect(() =>
    connectBrushSelection(handle, { scales: { t: target }, direction: () => 'x' }),
  ).toThrow(/independent/)
  expect(() => connectBrushSelection(handle, { scales: {}, direction: () => 'x' })).toThrow(
    /missing overview/,
  )
  expect(() =>
    connectBrushSelection(handle, { scales: { t: linearScale() }, direction: () => 'x' }),
  ).toThrow(/scale kind/)
  const disconnect = connectBrushSelection(handle, {
    scales: { t: timeScale() },
    direction: () => 'x',
  })
  try {
    expect(() => handle.update({ mode: 'y' })).toThrow(/does not match/)
    expect(handle.options.get().resolved.mode).toBe('x')
    expect(() => handle.update({ targets: { t: linearScale() } })).toThrow(/scale kind/)
    expect(handle.options.get().resolved.targets?.t).toBe(target)
  } finally {
    disconnect()
  }
})

test('validates every mapped range before updating any targets', () => {
  const x = timeScale({ domain: [100, 200] })
  const y = linearScale({ domain: [1, 2] })
  const handle = brush({ mode: 'xy', persistent: true, targets: { x, y } })
  expect(() =>
    handle.setSelection({ mode: 'xy', scales: { x: [300, 400], y: ['a', 'b'] } }),
  ).toThrow(/continuous domain/)
  expect(x.domain.get()).toEqual([100, 200])
  expect(y.domain.get()).toEqual([1, 2])
  handle.setSelection({ mode: 'xy', scales: { x: [300.25, 400.75], y: [3, 4] } })
  expect(x.domain.get()).toEqual([300.25, 400.75])
  expect(y.domain.get()).toEqual([3, 4])
})

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { reactive, subscribe } from '../../src/core/runtime.js'
import { bandScale, linearScale, logScale, timeScale } from '../../src/scales/scale.js'
import {
  brush,
  connectBrushSelection,
  validateSharedBrushContext,
} from '../../src/plot/plugins/brush/brush.js'
import {
  localSharedSelection,
  sharedSelection,
  type SharedSelectionValue,
} from '../../src/sync/shared-selection.js'

let frames: FrameRequestCallback[] = []
const cleanups: (() => void)[] = []
function flush() {
  while (frames.length) {
    const current = frames
    frames = []
    for (const callback of current) callback(0)
  }
}
beforeEach(() => {
  frames = []
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback)
    return frames.length
  })
})
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup()
  flush()
  vi.unstubAllGlobals()
})

describe('shared selection', () => {
  test('owns frozen scale-identity snapshots, suppresses no-ops and clears explicitly', () => {
    const selection = sharedSelection()
    const scale = linearScale()
    const range = [0.2, 0.8]
    const value: SharedSelectionValue = { mode: 'x', ranges: [{ scale, axis: 'x', range }] }
    selection.setSelection(value)
    const snapshot = selection.selection.get()!
    range[0] = 0
    expect(snapshot.ranges[0].range).toEqual([0.2, 0.8])
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(Object.isFrozen(snapshot.ranges)).toBe(true)
    expect(Object.isFrozen(snapshot.ranges[0])).toBe(true)
    expect(Object.isFrozen(snapshot.ranges[0].range)).toBe(true)
    expect(snapshot.ranges[0].scale).toBe(scale)
    const version = selection.selection.version
    selection.setSelection({ mode: 'x', ranges: [{ scale, axis: 'x', range: [0.2, 0.8] }] })
    expect(selection.selection.get()).toBe(snapshot)
    expect(selection.selection.version).toBe(version)
    selection.setSelection(undefined)
    expect(selection.selection.get()).toBeUndefined()
    const cleared = selection.selection.version
    selection.setSelection(undefined)
    expect(selection.selection.version).toBe(cleared)
  })

  test('maps two-way local names without echo and survives disconnect/reconnect', () => {
    const state = sharedSelection()
    const scale = timeScale({ domain: [0, 100] })
    const a = brush({ mode: 'x', persistent: true, selection: state })
    const b = brush({ mode: 'x', persistent: true, selection: state })
    const disconnect = connectBrushSelection(a, { scales: { t: scale }, direction: () => 'x' })
    const disconnectB = connectBrushSelection(b, { scales: { time: scale }, direction: () => 'x' })
    cleanups.push(disconnectB)
    const sharedNotifications = vi.fn()
    const localNotifications = vi.fn()
    cleanups.push(
      subscribe(state.selection, sharedNotifications),
      subscribe(b.selection, localNotifications),
    )
    flush()
    sharedNotifications.mockClear()
    localNotifications.mockClear()
    a.setSelection({ mode: 'x', scales: { t: [20, 40] } })
    flush()
    expect(b.selection.get()).toEqual({ mode: 'x', scales: { time: [20, 40] } })
    expect(sharedNotifications).toHaveBeenCalledTimes(1)
    expect(localNotifications).toHaveBeenCalledTimes(1)
    const version = state.selection.version
    b.setSelection({ mode: 'x', scales: { time: [20, 40] } })
    flush()
    expect(state.selection.version).toBe(version)
    b.setSelection({ mode: 'x', scales: { time: [30, 50] } })
    expect(a.selection.get()).toEqual({ mode: 'x', scales: { t: [30, 50] } })
    const snapshot = state.selection.get()
    disconnect()
    expect(state.selection.get()).toBe(snapshot)
    expect(a.selection.get()).toBeUndefined()
    const reconnect = connectBrushSelection(a, { scales: { t: scale }, direction: () => 'x' })
    cleanups.push(reconnect)
    expect(a.selection.get()?.scales.t).toEqual([30, 50])
    b.setSelection(undefined)
    expect(a.selection.get()).toBeUndefined()
  })

  test('allows preinstallation initialization, ignores unrelated identities and filters modes', () => {
    const shared = sharedSelection()
    const x = linearScale()
    const y = linearScale()
    shared.setSelection({
      mode: 'xy',
      ranges: [
        { scale: x, axis: 'x', range: [0.1, 0.9] },
        { scale: y, axis: 'y', range: [0.2, 0.8] },
      ],
    })
    const context = {
      scales: { t: x, q: y },
      direction: (name: string) => (name === 't' ? 'x' : 'y'),
    }
    expect(localSharedSelection(shared.selection.get(), 'auto', context)).toEqual({
      mode: 'xy',
      scales: { t: [0.1, 0.9], q: [0.2, 0.8] },
    })
    expect(localSharedSelection(shared.selection.get(), 'x', context)).toEqual({
      mode: 'x',
      scales: { t: [0.1, 0.9] },
    })
    expect(
      localSharedSelection(shared.selection.get(), 'xy', {
        scales: { t: linearScale() },
        direction: () => 'x',
      }),
    ).toBeUndefined()
    expect(
      localSharedSelection(shared.selection.get(), 'xy', {
        scales: { t: x },
        direction: () => 'y',
      }),
    ).toBeUndefined()
    const handle = brush({ mode: 'x', persistent: true, selection: shared })
    expect(() => handle.setSelection({ mode: 'x', scales: { t: [0, 1] } })).toThrow(/Install/)
    cleanups.push(connectBrushSelection(handle, context))
    expect(handle.selection.get()?.scales.t).toEqual([0.1, 0.9])
  })

  test('suppresses equivalent scale-identity ranges regardless of local binding order', () => {
    const selection = sharedSelection()
    const x = linearScale()
    const y = linearScale()
    const ranges = [
      { scale: x, axis: 'x' as const, range: [0, 10] },
      { scale: y, axis: 'y' as const, range: [20, 30] },
    ]
    selection.setSelection({ mode: 'xy', ranges })
    const snapshot = selection.selection.get()
    const version = selection.selection.version
    selection.setSelection({ mode: 'xy', ranges: [...ranges].reverse() })
    expect(selection.selection.get()).toBe(snapshot)
    expect(selection.selection.version).toBe(version)
  })

  test('reconciles membership and shared-handle changes without mutating either shared selection', () => {
    const first = sharedSelection()
    const second = sharedSelection()
    const x = linearScale()
    const other = linearScale()
    first.setSelection({ mode: 'x', ranges: [{ scale: x, axis: 'x', range: [0.1, 0.9] }] })
    second.setSelection({ mode: 'x', ranges: [{ scale: other, axis: 'x', range: [0.2, 0.7] }] })
    const handle = brush({ mode: 'x', persistent: true, selection: first })
    let scales = { t: x }
    cleanups.push(
      connectBrushSelection(handle, {
        get scales() {
          return scales
        },
        direction: () => 'x',
      }),
    )
    expect(handle.selection.get()?.scales.t).toEqual([0.1, 0.9])
    scales = { t: other }
    expect(handle.selection.get()).toBeUndefined()
    handle.update({ selection: second })
    expect(handle.selection.get()?.scales.t).toEqual([0.2, 0.7])
    expect(first.selection.get()?.ranges[0].scale).toBe(x)
    handle.update({ selection: undefined })
    expect(handle.selection.get()).toBeUndefined()
    expect(second.selection.get()?.ranges[0].range).toEqual([0.2, 0.7])
  })

  test('keeps local selection versions monotonic when switching shared handles', () => {
    const first = sharedSelection()
    const second = sharedSelection()
    const x = linearScale()
    const handle = brush({ mode: 'x', persistent: true, selection: first })
    cleanups.push(connectBrushSelection(handle, { scales: { x }, direction: () => 'x' }))
    for (let index = 1; index <= 4; index += 1) {
      first.setSelection({ mode: 'x', ranges: [{ scale: x, axis: 'x', range: [0, index] }] })
      handle.selection.get()
    }
    const version = handle.selection.version
    second.setSelection({ mode: 'x', ranges: [{ scale: x, axis: 'x', range: [10, 20] }] })
    handle.update({ selection: second })
    expect(handle.selection.version).toBeGreaterThan(version)
    const nextVersion = handle.selection.version
    expect(handle.selection.version).toBe(nextVersion)
    expect(handle.selection.get()?.scales.x).toEqual([10, 20])
  })

  test('preserves local brush behavior and clears local snapshots when entering/leaving shared mode', () => {
    const handle = brush({ mode: 'x', persistent: true })
    const input = { mode: 'x' as const, scales: { t: [0, 10] } }
    handle.setSelection(input)
    input.scales.t[0] = 5
    expect(handle.selection.get()?.scales.t).toEqual([0, 10])
    const snapshot = handle.selection.get()
    handle.setSelection({ mode: 'x', scales: { t: [0, 10] } })
    expect(handle.selection.get()).toBe(snapshot)
    const shared = sharedSelection()
    handle.update({ selection: shared })
    expect(handle.selection.get()).toBeUndefined()
    handle.update({ selection: undefined })
    expect(handle.selection.get()).toBeUndefined()
    handle.setSelection({ mode: 'x', scales: { t: [0, 10] } })
    handle.update({ mode: 'y' })
    expect(handle.selection.get()).toBeUndefined()
  })

  test('normalizes auto/xy brushes with one available axis and coalesces identical aliases', () => {
    const shared = sharedSelection()
    const x = linearScale()
    const handle = brush({ mode: 'auto', persistent: true, selection: shared })
    cleanups.push(connectBrushSelection(handle, { scales: { x, alias: x }, direction: () => 'x' }))
    handle.setSelection({ mode: 'xy', scales: { x: [0, 1], alias: [0, 1] } })
    expect(shared.selection.get()).toEqual({
      mode: 'x',
      ranges: [{ scale: x, axis: 'x', range: [0, 1] }],
    })
    expect(handle.selection.get()).toEqual({ mode: 'x', scales: { x: [0, 1], alias: [0, 1] } })
    expect(() => handle.setSelection({ mode: 'x', scales: { x: [0, 1], alias: [0, 2] } })).toThrow(
      /aliases/,
    )
    expect(shared.selection.get()?.ranges[0].range).toEqual([0, 1])
  })

  test('rejects enabling shared mode on an already installed handle with incompatible mappings', () => {
    const x = linearScale()
    const handle = brush({ mode: 'x', persistent: true })
    cleanups.push(connectBrushSelection(handle, { scales: { x }, direction: () => 'x' }))
    cleanups.push(connectBrushSelection(handle, { scales: { t: x }, direction: () => 'x' }))
    expect(() => handle.update({ selection: sharedSelection() })).toThrow(/separate brush handles/)
    expect(handle.options.get().resolved.selection).toBeUndefined()
  })

  test('distinguishes an owning plot update from a new peer during atomic validation', () => {
    const selection = sharedSelection()
    const x = linearScale()
    const handle = brush({ mode: 'x', persistent: true, selection })
    const owner = Symbol()
    cleanups.push(connectBrushSelection(handle, { owner, scales: { x }, direction: () => 'x' }))
    expect(() =>
      validateSharedBrushContext(handle, {
        owner,
        scales: { time: x },
        direction: () => 'x',
      }),
    ).not.toThrow()
    expect(() =>
      validateSharedBrushContext(handle, {
        owner: Symbol(),
        scales: { time: x },
        direction: () => 'x',
      }),
    ).toThrow(/separate brush handles/)
    expect(handle.options.get().resolved.selection).toBe(selection)
  })

  test('rejects invalid shapes, ranges, axes and incompatible scale values atomically', () => {
    const shared = sharedSelection()
    const scale = linearScale()
    const valid: SharedSelectionValue = { mode: 'x', ranges: [{ scale, axis: 'x', range: [0, 1] }] }
    shared.setSelection(valid)
    const previous = shared.selection.get()
    const bad: SharedSelectionValue[] = [
      { ...valid, ranges: [] },
      { ...valid, mode: 'xy' },
      { ...valid, ranges: [...valid.ranges, ...valid.ranges] },
      { ...valid, ranges: [{ scale, axis: 'y', range: [0, 1] }] },
      { ...valid, ranges: [{ scale, axis: 'x', range: [1, 0] }] },
      { ...valid, ranges: [{ scale, axis: 'x', range: [0, Infinity] }] },
      { ...valid, ranges: [{ scale: logScale(), axis: 'x', range: [0, 1] }] },
      { ...valid, ranges: [{ scale: timeScale(), axis: 'x', range: [0, 9e15] }] },
      {
        ...valid,
        ranges: [{ scale: bandScale({ domain: ['a'] }), axis: 'x', range: ['missing'] }],
      },
      { ...valid, ranges: [{ scale: bandScale({ domain: ['a'] }), axis: 'x', range: ['a', 'a'] }] },
    ]
    for (const value of bad) {
      expect(() => shared.setSelection(value)).toThrow()
      expect(shared.selection.get()).toBe(previous)
    }
    expect(() => brush({ selection: shared })).toThrow(/persistent/)
    const handle = brush({ persistent: true, selection: shared })
    expect(handle.options.get().resolved.selection).toBe(shared)
    expect(() => handle.update({ persistent: false })).toThrow(/persistent/)
    expect(() => handle.update({ selection: {} })).toThrow(/sharedSelection/)
    expect(handle.options.get().resolved.selection).toBe(shared)
  })

  test('permits one shared brush handle only for identical local mappings', () => {
    const state = sharedSelection()
    const x = linearScale()
    const handle = brush({ mode: 'x', persistent: true, selection: state })
    const context = { scales: { t: x }, direction: () => 'x' }
    cleanups.push(connectBrushSelection(handle, context))
    cleanups.push(connectBrushSelection(handle, { ...context }))
    expect(() =>
      validateSharedBrushContext(handle, {
        scales: { time: x },
        direction: () => 'x',
      }),
    ).toThrow(/separate brush handles/)
    expect(() =>
      connectBrushSelection(handle, {
        scales: { t: x },
        direction: () => 'y',
      }),
    ).toThrow(/separate brush handles/)
  })

  test('keeps retained categorical selections when categories disappear and supports independent clear', () => {
    const shared = sharedSelection()
    const x = bandScale({ domain: ['a', 'b', 'c'] })
    shared.setSelection({ mode: 'x', ranges: [{ scale: x, axis: 'x', range: ['b', 'c'] }] })
    const handle = brush({ mode: 'x', persistent: true, selection: shared })
    cleanups.push(connectBrushSelection(handle, { scales: { x }, direction: () => 'x' }))
    x.domain.set(['a'])
    expect(handle.selection.get()?.scales.x).toEqual(['b', 'c'])
    expect(reactive.isSignal(handle.selection)).toBe(true)
    handle.setSelection(undefined)
    expect(shared.selection.get()).toBeUndefined()
  })
})

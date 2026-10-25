import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { effect, reactive, subscribe } from '../../src/core/runtime.js'

let pendingFrames: FrameRequestCallback[] = []

function flushFrame() {
  const callbacks = pendingFrames
  pendingFrames = []
  for (const callback of callbacks) callback(0)
}

describe('public reactive runtime', () => {
  beforeEach(() => {
    pendingFrames = []
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      pendingFrames.push(callback)
      return pendingFrames.length
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  test('subscribes once per frame with the latest and previous delivered values', () => {
    const value = reactive.signal(0)
    const other = reactive.signal('initial')
    const deliveries: [number, number | undefined][] = []

    subscribe(value, (next, previous) => {
      other.get()
      deliveries.push([next, previous])
    })
    expect(deliveries).toEqual([])

    reactive.batch(() => {
      value.set(1)
      value.set(2)
      value.set(3)
    })
    flushFrame()
    expect(deliveries).toEqual([[3, undefined]])

    other.set('changed')
    value.set(4)
    value.set(5)
    flushFrame()
    expect(deliveries).toEqual([
      [3, undefined],
      [5, 3],
    ])
  })

  test('supports immediate delivery, equality, abort, and idempotent unsubscribe', () => {
    const value = reactive.signal({ current: 1 })
    const deliveries: number[] = []
    const controller = new AbortController()
    const unsubscribe = subscribe(value, (next) => deliveries.push(next.current), {
      immediate: true,
      equals: (next, previous) => next.current === previous.current,
      signal: controller.signal,
    })

    expect(deliveries).toEqual([1])
    flushFrame()
    expect(deliveries).toEqual([1])

    value.set({ current: 1 })
    flushFrame()
    expect(deliveries).toEqual([1])

    controller.abort()
    unsubscribe()
    unsubscribe()
    value.set({ current: 2 })
    flushFrame()
    expect(deliveries).toEqual([1])
  })

  test('ties subscriptions to the active scope and validates their source', () => {
    const value = reactive.signal(1)
    const deliveries: number[] = []
    const scope = reactive.createScope()

    scope.run(() => subscribe(value, (next) => deliveries.push(next)))
    flushFrame()
    expect(deliveries).toEqual([1])

    scope.dispose()
    value.set(2)
    flushFrame()
    expect(deliveries).toEqual([1])
    expect(() => subscribe({ get: () => 1, version: 0 }, () => {})).toThrow(TypeError)
  })

  test('stops subscription if its abort signal fires during immediate delivery', () => {
    const value = reactive.signal(1)
    const controller = new AbortController()
    const deliveries: number[] = []

    subscribe(
      value,
      (next) => {
        deliveries.push(next)
        controller.abort()
      },
      { immediate: true, signal: controller.signal },
    )
    flushFrame()
    value.set(2)
    flushFrame()
    expect(deliveries).toEqual([1])
  })

  test('isolates throwing listeners and reports errors through the frame scheduler', () => {
    const value = reactive.signal(0)
    const deliveries: number[] = []
    const report = vi.spyOn(console, 'error').mockImplementation(() => {})
    subscribe(value, () => {
      throw new Error('listener failed')
    })
    subscribe(value, (next) => deliveries.push(next))

    flushFrame()
    expect(deliveries).toEqual([0])
    flushFrame()
    expect(report).toHaveBeenCalledWith('Frame scheduler error:', expect.any(Error))
  })

  test('exports the existing auto-tracked effect handle', () => {
    const value = reactive.signal(1)
    const runs: number[] = []
    const handle = effect(() => {
      runs.push(value.get())
    })

    expect(handle.runCount).toBe(0)
    flushFrame()
    value.set(2)
    flushFrame()
    expect(runs).toEqual([1, 2])
    expect(handle.runCount).toBe(2)
    handle.dispose()
  })
})

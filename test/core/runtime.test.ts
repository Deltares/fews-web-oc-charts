import { afterEach, beforeEach, describe, expect, test, vi } from 'vite-plus/test'
import { effect, reactive, sourceOf, subscribe, withSource } from '../../src/core/runtime.js'
import { linearScale, registerScaleExtents, timeScale } from '../../src/scales/scale.js'
import { colorScale } from '../../src/scales/color.js'
import { zoom } from '../../src/plot/plugins/zoom/zoom.js'

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

  test('subscribes to a scale domain shared by several consumers', () => {
    const scale = linearScale({ domain: [0, 100] })
    const deliveries: [readonly unknown[], readonly unknown[] | undefined][] = []

    expect(reactive.isSignal(scale.domain)).toBe(true)
    subscribe(scale.domain, (next, previous) => deliveries.push([next, previous]), {
      immediate: true,
    })
    expect(deliveries).toEqual([[[0, 100], undefined]])

    scale.domain.set([10, 110])
    scale.domain.set([20, 120])
    flushFrame()
    scale.update({ domain: [20, 120] })
    flushFrame()
    expect(deliveries).toEqual([
      [[0, 100], undefined],
      [
        [20, 120],
        [0, 100],
      ],
    ])
  })

  test('subscribes to option snapshots with previous delivered values and cleanup', () => {
    const scale = timeScale({ domain: [0, 10] })
    const deliveries: Array<
      [readonly [number, number] | undefined, readonly [number, number] | undefined]
    > = []
    const controller = new AbortController()
    const aborted = vi.fn()
    const unsubscribe = subscribe(
      scale.options,
      (next, previous) => deliveries.push([next.explicit.domain, previous?.explicit.domain]),
      { immediate: true },
    )
    subscribe(scale.options, aborted, { signal: controller.signal })

    expect(deliveries).toEqual([[[0, 10], undefined]])
    flushFrame()
    expect(deliveries).toHaveLength(1)
    expect(aborted).toHaveBeenCalledTimes(1)

    scale.update({ domain: [1, 9] })
    scale.update({ domain: [2, 8] })
    flushFrame()
    expect(deliveries).toEqual([
      [[0, 10], undefined],
      [
        [2, 8],
        [0, 10],
      ],
    ])
    expect(aborted).toHaveBeenCalledTimes(2)

    unsubscribe()
    controller.abort()
    scale.update({ domain: undefined })
    flushFrame()
    expect(deliveries).toHaveLength(2)
    expect(aborted).toHaveBeenCalledTimes(2)
  })

  test('subscribes to option snapshots on other handle types', () => {
    const colors = colorScale()
    const interaction = zoom()
    const colorValues = vi.fn()
    const zoomValues = vi.fn()
    const stopColors = subscribe(colors.options, colorValues, { immediate: true })
    const stopZoom = subscribe(interaction.options, zoomValues, { immediate: true })

    flushFrame()
    expect(colorValues).toHaveBeenCalledTimes(1)
    expect(zoomValues).toHaveBeenCalledTimes(1)
    colors.update({ clamp: false })
    interaction.update({ wheel: 'x' })
    flushFrame()
    expect(colorValues).toHaveBeenCalledTimes(2)
    expect(colorValues.mock.calls[1][0].resolved.clamp).toBe(false)
    expect(colorValues.mock.calls[1][1].resolved.clamp).toBe(true)
    expect(zoomValues).toHaveBeenCalledTimes(2)
    expect(zoomValues.mock.calls[1][0].resolved.wheel).toBe('x')
    expect(zoomValues.mock.calls[1][1].resolved.wheel).toBe('none')

    stopColors()
    stopZoom()
  })

  test('notifies when a reset clears an explicit domain without changing the visible domain', () => {
    const scale = timeScale({ domain: [0, 10], defaultDomain: [0, 10] })
    const optionValues = vi.fn()
    const domainValues = vi.fn()
    const stopOptions = subscribe(scale.options, optionValues, { immediate: true })
    const stopDomain = subscribe(scale.domain, domainValues, { immediate: true })
    flushFrame()

    withSource('reset', () => scale.update({ domain: undefined }))
    flushFrame()
    expect(scale.domain.get()).toEqual([0, 10])
    expect(optionValues).toHaveBeenCalledTimes(2)
    expect(optionValues.mock.calls[1][0].explicit.domain).toBeUndefined()
    expect(optionValues.mock.calls[1][1].explicit.domain).toEqual([0, 10])
    expect(domainValues).toHaveBeenCalledTimes(1)

    stopOptions()
    stopDomain()
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

  test('attributes scale writes to their source and falls back to api', () => {
    const scale = linearScale({ domain: [0, 10] })

    withSource('wheel', () => scale.update({ domain: [1, 9] }))
    expect(sourceOf(scale)).toBe('wheel')

    scale.update({ domain: [2, 8] })
    expect(sourceOf(scale)).toBe('api')
  })

  test('restores source context and expires attribution after an autoscale change', () => {
    const scale = linearScale()
    const extent = reactive.signal<readonly [number, number]>([0, 1])
    const unregister = registerScaleExtents(scale, () => extent.get())

    withSource('wheel', () => {
      scale.update({ domain: [2, 8] })
      withSource('pan', () => scale.update({ domain: [3, 7] }))
      scale.update({ domain: [4, 6] })
    })
    expect(sourceOf(scale)).toBe('wheel')

    scale.update({ domain: undefined })
    expect(sourceOf(scale)).toBe('api')
    extent.set([10, 20])
    expect(scale.domain.get()).toEqual([10, 20])
    expect(sourceOf(scale)).toBeUndefined()
    unregister()
  })
})

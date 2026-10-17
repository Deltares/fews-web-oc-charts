import { describe, expect, test } from 'vitest'
import { createFrameScheduler, DirtyLayer } from '../../src/spike/core/frame-scheduler.js'
import { createReactiveCore } from '../../src/spike/core/reactive.js'

function queuedFrames() {
  const callbacks: FrameRequestCallback[] = []
  return {
    requestFrame(callback: FrameRequestCallback) {
      callbacks.push(callback)
      return callbacks.length
    },
    flush() {
      const callback = callbacks.shift()
      if (!callback) throw new Error('No animation frame was queued.')
      callback(0)
    },
    get length() {
      return callbacks.length
    },
  }
}

describe('phase 0 reactive core and frame scheduler', () => {
  test('coalesces dirty layers and effects into one frame', () => {
    const frames = queuedFrames()
    const draws: number[] = []
    const scheduler = createFrameScheduler((layers) => draws.push(layers), frames.requestFrame)
    const core = createReactiveCore(scheduler)
    const left = core.signal(1)
    const right = core.signal(2)
    const sum = core.computed(() => left.get() + right.get())
    const observed: number[] = []

    core.effect(() => {
      observed.push(sum.get())
    })
    expect(observed).toEqual([])
    expect(frames.length).toBe(1)
    frames.flush()
    expect(observed).toEqual([3])

    core.batch(() => {
      left.set(4)
      right.set(3)
      scheduler.invalidate(DirtyLayer.marks)
      scheduler.invalidate(DirtyLayer.overlay)
    })
    expect(frames.length).toBe(1)
    frames.flush()
    expect(observed).toEqual([3, 7])
    expect(draws).toEqual([DirtyLayer.marks | DirtyLayer.overlay])
    scheduler.dispose()
  })

  test('releases effect dependencies and cleanup on disposal', () => {
    const frames = queuedFrames()
    const scheduler = createFrameScheduler(() => {}, frames.requestFrame)
    const core = createReactiveCore(scheduler)
    const value = core.signal(0)
    let cleanupCount = 0
    const handle = core.effect(() => {
      value.get()
      return () => {
        cleanupCount += 1
      }
    })
    frames.flush()
    handle.dispose()
    expect(cleanupCount).toBe(1)

    value.set(1)
    expect(frames.length).toBe(0)
    scheduler.dispose()
  })

  test('detects cycles while evaluating a computed value', () => {
    const frames = queuedFrames()
    const scheduler = createFrameScheduler(() => {}, frames.requestFrame)
    const core = createReactiveCore(scheduler)
    let value: ReturnType<typeof core.computed<number>>
    value = core.computed(() => value.get() + 1)

    expect(() => value.get()).toThrow(/Reactive cycle detected/)
    scheduler.dispose()
  })
})

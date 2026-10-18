import { describe, expect, test } from 'vitest'
import { createFrameScheduler, DirtyLayer } from '../../src/spike/core/frame-scheduler.js'
import { createReactiveCore } from '../../src/spike/core/reactive.js'

function queuedFrames() {
  const callbacks: FrameRequestCallback[] = []
  return {
    requestFrame: (callback: FrameRequestCallback) => {
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
    const value: { current?: ReturnType<typeof core.computed<number>> } = {}
    value.current = core.computed(() => value.current!.get() + 1)

    expect(() => value.current!.get()).toThrow(/Reactive cycle detected/)
    scheduler.dispose()
  })

  test('disposes effects and computeds owned by nested scopes', () => {
    const frames = queuedFrames()
    const scheduler = createFrameScheduler(() => {}, frames.requestFrame)
    const core = createReactiveCore(scheduler, {
      onError: (error) => {
        throw error
      },
    })
    const source = core.signal(1)
    const events: string[] = []
    const parent = core.createScope()
    let derived!: ReturnType<typeof core.computed<number>>

    parent.run(() => {
      derived = core.computed(() => source.get() * 2)
      core.effect(() => {
        derived.get()
        return () => events.push('parent-cleanup')
      })

      const child = parent.createScope()
      child.run(() => {
        core.effect(() => {
          source.get()
          return () => events.push('child-cleanup')
        })
      })
    })
    frames.flush()
    expect(core.getDiagnostics()).toEqual({
      effectRuns: 2,
      activeEffects: 2,
      activeComputeds: 1,
      activeScopes: 2,
    })

    parent.dispose()
    parent.dispose()
    expect(events).toEqual(['child-cleanup', 'parent-cleanup'])
    expect(parent.disposed).toBe(true)
    expect(core.getDiagnostics()).toEqual({
      effectRuns: 2,
      activeEffects: 0,
      activeComputeds: 0,
      activeScopes: 0,
    })
    source.set(2)
    expect(frames.length).toBe(0)
    expect(() => derived.get()).toThrow(/disposed computed/)
    scheduler.dispose()
  })

  test('evaluates computed dependencies before effects and recovers after errors', () => {
    const frames = queuedFrames()
    const errors: unknown[] = []
    const scheduler = createFrameScheduler(
      () => {},
      frames.requestFrame,
      (error) => errors.push(error),
    )
    const core = createReactiveCore(scheduler, { onError: (error) => errors.push(error) })
    const source = core.signal(1)
    let leftRuns = 0
    let rightRuns = 0
    const left = core.computed(() => {
      leftRuns += 1
      return source.get() * 2
    })
    const right = core.computed(() => {
      rightRuns += 1
      return source.get() + 1
    })
    const total = core.computed(() => left.get() + right.get())
    const observed: number[] = []
    let shouldThrow = true
    const failing = core.effect(() => {
      source.get()
      if (shouldThrow) throw new Error('effect failed')
    })
    const observer = core.effect(() => {
      observed.push(total.get())
    })

    frames.flush()
    expect(errors).toHaveLength(1)
    expect(failing.runCount).toBe(1)
    expect(observed).toEqual([4])

    shouldThrow = false
    source.set(2)
    frames.flush()
    expect(failing.runCount).toBe(2)
    expect(observed).toEqual([4, 7])
    expect(leftRuns).toBe(2)
    expect(rightRuns).toBe(2)
    expect(core.getDiagnostics().effectRuns).toBe(4)
    failing.dispose()
    observer.dispose()
    scheduler.dispose()
  })

  test('continues running scheduled effects after one effect fails', () => {
    const frames = queuedFrames()
    const errors: unknown[] = []
    const scheduler = createFrameScheduler(
      () => {},
      frames.requestFrame,
      (error) => errors.push(error),
    )
    const events: string[] = []
    scheduler.enqueueEffect(() => {
      events.push('first')
      throw new Error('scheduled effect failed')
    })
    scheduler.enqueueEffect(() => events.push('second'))

    frames.flush()
    expect(events).toEqual(['first', 'second'])
    expect(errors).toHaveLength(1)
    scheduler.dispose()
  })
})

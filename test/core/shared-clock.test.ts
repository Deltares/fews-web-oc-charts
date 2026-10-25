import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { subscribe } from '../../src/core/runtime.js'
import { sharedClock, type SharedClock } from '../../src/sync/shared-clock.js'

let frames: FrameRequestCallback[] = []
const clocks: SharedClock[] = []
const stops: (() => void)[] = []
function clock(...args: Parameters<typeof sharedClock>) {
  const result = sharedClock(...args)
  clocks.push(result)
  return result
}
function flush() {
  const current = frames
  frames = []
  for (const callback of current) callback(0)
}
beforeEach(() => {
  vi.useFakeTimers()
  frames = []
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback)
    return frames.length
  })
})
afterEach(() => {
  for (const stop of stops.splice(0)) stop()
  for (const current of clocks.splice(0)) current.destroy()
  flush()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('shared clock', () => {
  test('is stopped initially, owns dates and publishes one consistent value to multiple consumers', () => {
    const date = new Date(1000)
    const current = clock({ initial: date })
    date.setTime(2000)
    expect(current.time.get()).toBe(1000)
    expect(current.running.get()).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
    const first = vi.fn()
    const second = vi.fn()
    stops.push(subscribe(current.time, first), subscribe(current.time, second))
    flush()
    first.mockClear()
    second.mockClear()
    current.set(3000)
    current.set(new Date(4000))
    flush()
    expect(first).toHaveBeenCalledTimes(1)
    expect(first).toHaveBeenCalledWith(4000, 1000)
    expect(second).toHaveBeenCalledWith(4000, 1000)
    const version = current.time.version
    current.set(4000)
    flush()
    expect(current.time.version).toBe(version)
    expect(first).toHaveBeenCalledTimes(1)
    stops[0]()
    current.set(5000)
    flush()
    expect(second).toHaveBeenLastCalledWith(5000, 4000)
    expect(first).toHaveBeenCalledTimes(1)
  })

  test('ticks from one deterministic source and owns exactly one explicitly started timer', () => {
    let now = 100
    const source = vi.fn(() => now)
    const current = clock({ now: source, interval: 50 })
    expect(source).toHaveBeenCalledTimes(1)
    now = 200
    current.tick()
    expect(current.time.get()).toBe(200)
    current.start()
    current.start()
    expect(vi.getTimerCount()).toBe(1)
    expect(current.running.get()).toBe(true)
    now = 300
    vi.advanceTimersByTime(50)
    expect(current.time.get()).toBe(300)
    expect(source).toHaveBeenCalledTimes(3)
    current.stop()
    current.stop()
    expect(vi.getTimerCount()).toBe(0)
    now = 400
    vi.advanceTimersByTime(1000)
    expect(current.time.get()).toBe(300)
    current.start()
    vi.advanceTimersByTime(50)
    expect(current.time.get()).toBe(400)
    current.destroy()
    current.destroy()
    expect(current.destroyed).toBe(true)
    expect(current.running.get()).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
    expect(() => current.start()).toThrow(/destroyed/)
    expect(() => current.tick()).toThrow(/destroyed/)
    expect(() => current.set(500)).toThrow(/destroyed/)
    expect(current.time.get()).toBe(400)
  })

  test('validates initial values, interval and updates without partial mutation', () => {
    expect(() => sharedClock({ initial: new Date(NaN) })).toThrow(/Date range/)
    expect(() => sharedClock({ initial: Infinity })).toThrow(/Date range/)
    for (const interval of [0, -1, 0.5, NaN, Infinity, 2_147_483_648]) {
      expect(() => sharedClock({ interval })).toThrow(/interval/)
    }
    const current = clock({ initial: -8.64e15 })
    current.set(8.64e15)
    for (const time of [9e15, NaN, Infinity]) {
      expect(() => current.set(time)).toThrow(/Date range/)
      expect(current.time.get()).toBe(8.64e15)
    }
    // @ts-expect-error Invalid runtime time source.
    expect(() => sharedClock({ now: 5 })).toThrow(/function/)
    // @ts-expect-error Unknown runtime option.
    expect(() => sharedClock({ autoStart: true })).toThrow(/Unknown option/)
  })

  test('reports a failed timer source and stops instead of silently keeping a running clock', () => {
    const source = vi.fn(() => 100)
    const current = clock({ now: source, interval: 10 })
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    current.start()
    source.mockReturnValue(NaN)
    vi.advanceTimersByTime(10)
    expect(log).toHaveBeenCalledWith(
      'Shared clock tick failed; clock stopped:',
      expect.any(RangeError),
    )
    expect(current.running.get()).toBe(false)
    expect(current.time.get()).toBe(100)
    expect(vi.getTimerCount()).toBe(0)
    expect(() => current.tick()).toThrow(/Date range/)
  })
})

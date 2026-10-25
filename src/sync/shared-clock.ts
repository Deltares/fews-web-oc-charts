import { reactive } from '../core/runtime.js'
import type { ReadonlySignal } from '../core/reactive.js'
import { validateKeys } from '../core/validation.js'

export interface SharedClockOptions {
  initial?: number | Date
  now?: () => number
  interval?: number
}

export interface SharedClock {
  readonly time: ReadonlySignal<number>
  readonly running: ReadonlySignal<boolean>
  readonly destroyed: boolean
  set(value: number | Date): void
  tick(): void
  start(): void
  stop(): void
  destroy(): void
}

function epoch(value: number | Date): number {
  const result = value instanceof Date ? value.getTime() : value
  if (typeof result !== 'number' || !Number.isFinite(result) || Math.abs(result) > 8.64e15) {
    throw new RangeError('sharedClock time must be finite and within the JavaScript Date range.')
  }
  return result
}

export function sharedClock(options: SharedClockOptions = {}): SharedClock {
  validateKeys(options, ['initial', 'now', 'interval'], 'sharedClock')
  const now = options.now === undefined ? Date.now : options.now
  if (typeof now !== 'function') throw new TypeError('sharedClock.now must be a function.')
  const interval = options.interval === undefined ? 1000 : options.interval
  if (!Number.isSafeInteger(interval) || interval < 1 || interval > 2_147_483_647) {
    throw new RangeError(
      'sharedClock.interval must be an integer from 1 to 2147483647 milliseconds.',
    )
  }
  const time = reactive.signal(epoch(options.initial === undefined ? now() : options.initial))
  const running = reactive.signal(false)
  let timer: ReturnType<typeof setInterval> | undefined
  let destroyed = false
  function assertActive() {
    if (destroyed) throw new Error('Cannot update a destroyed shared clock.')
  }
  function stop() {
    if (timer !== undefined) clearInterval(timer)
    timer = undefined
    running.set(false)
  }
  function tick() {
    assertActive()
    time.set(epoch(now()))
  }
  return Object.freeze({
    time: reactive.register({
      get: () => time.get(),
      get version() {
        return time.version
      },
    }),
    running: reactive.register({
      get: () => running.get(),
      get version() {
        return running.version
      },
    }),
    get destroyed() {
      return destroyed
    },
    set(value: number | Date) {
      assertActive()
      time.set(epoch(value))
    },
    tick,
    start() {
      assertActive()
      if (timer !== undefined) return
      timer = setInterval(() => {
        try {
          tick()
        } catch (error) {
          stop()
          console.error('Shared clock tick failed; clock stopped:', error)
        }
      }, interval)
      running.set(true)
    },
    stop,
    destroy() {
      if (destroyed) return
      stop()
      destroyed = true
    },
  })
}

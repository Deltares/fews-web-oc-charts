import { createFrameScheduler, type DirtyLayers } from './frame-scheduler.js'
import { createReactiveCore } from './reactive.js'
import type { OptionState, OptionStateSnapshot } from './options.js'
import type { EffectHandle, ReadonlySignal } from './reactive.js'
import type { ScaleHandle } from '../scales/scale.js'

export type { EffectHandle } from './reactive.js'

export interface SubscribeOptions<T = unknown> {
  /** Call the listener once immediately with the current value (previous = undefined). Default false. */
  immediate?: boolean
  /** Removes the subscription when aborted. */
  signal?: AbortSignal
  /** Custom equality; defaults to the signal's own equality. */
  equals?: (next: T, previous: T) => boolean
}

export type Unsubscribe = () => void

export type DomainChangeSource = 'zoom' | 'wheel' | 'pan' | 'brush' | 'reset' | 'autoscale' | 'api'

interface ScaleSource {
  source: DomainChangeSource
  version: number
}

let currentSource: DomainChangeSource | undefined
const scaleSources = new WeakMap<ScaleHandle, ScaleSource>()

export function withSource<T>(source: DomainChangeSource, run: () => T): T {
  const previousSource = currentSource
  currentSource = source
  try {
    return run()
  } finally {
    currentSource = previousSource
  }
}

export function recordScaleSource(scale: ScaleHandle, version: number) {
  scaleSources.set(scale, { source: currentSource ?? 'api', version })
}

export function sourceOf(scale: ScaleHandle): DomainChangeSource | undefined {
  const attribution = scaleSources.get(scale)
  return attribution?.version === scale.domain.version ? attribution.source : undefined
}

const pending = new Map<(dirty: DirtyLayers) => void, DirtyLayers>()
export const scheduler = createFrameScheduler(() => {
  const work = [...pending]
  pending.clear()
  for (const [render, dirty] of work) {
    try {
      render(dirty)
    } catch (error) {
      console.error('Plot render failed:', error)
    }
  }
})

export const reactive = createReactiveCore(scheduler, {
  onError(error) {
    scheduler.enqueueEffect(() => {
      throw error
    })
  },
})
export const batch = <T>(run: () => T): T => reactive.batch(run)
export const untracked = <T>(run: () => T): T => reactive.untracked(run)
export const effect = (run: () => void | (() => void)): EffectHandle => reactive.effect(run)

export function subscribe<T>(
  source: ReadonlySignal<T>,
  listener: (value: T, previous: T | undefined) => void,
  options: SubscribeOptions<T> = {},
): Unsubscribe {
  if (!reactive.isSignal(source)) throw new TypeError('Expected a library signal.')
  if (options.signal?.aborted) return () => {}

  const equals =
    options.equals ?? ((next: T, previous: T) => reactive.equals(source, next, previous))
  let hasDelivered = false
  let lastDelivered: T | undefined
  let active = true
  let releaseOwnership = () => {}

  const deliver = (value: T, previous: T | undefined) => {
    try {
      untracked(() => listener(value, previous))
    } catch (error) {
      scheduler.enqueueEffect(() => {
        throw error
      })
    }
  }

  const subscription = effect(() => {
    const value = source.get()
    if (!hasDelivered || !equals(value, lastDelivered!)) {
      const previous = hasDelivered ? lastDelivered : undefined
      lastDelivered = value
      hasDelivered = true
      deliver(value, previous)
    }
  })

  const unsubscribe = () => {
    if (!active) return
    active = false
    options.signal?.removeEventListener('abort', unsubscribe)
    releaseOwnership()
    subscription.dispose()
  }

  options.signal?.addEventListener('abort', unsubscribe, { once: true })
  releaseOwnership = reactive.onDispose(unsubscribe)

  if (options.immediate && active) {
    try {
      const value = source.get()
      lastDelivered = value
      hasDelivered = true
      deliver(value, undefined)
    } catch (error) {
      unsubscribe()
      throw error
    }
  }

  return unsubscribe
}

export function optionSignal<T extends object>(
  state: OptionState<T>,
): {
  snapshot: ReadonlySignal<OptionStateSnapshot<T>>
  publish(): void
} {
  const version = reactive.signal(0)
  return {
    snapshot: {
      get() {
        version.get()
        return state.getSnapshot()
      },
      get version() {
        return version.get()
      },
    },
    publish() {
      version.update((value) => value + 1)
    },
  }
}

export function invalidate(render: (dirty: DirtyLayers) => void, dirty: DirtyLayers) {
  pending.set(render, (pending.get(render) ?? 0) | dirty)
  scheduler.invalidate(dirty)
}

export function cancelRender(render: (dirty: DirtyLayers) => void) {
  pending.delete(render)
}

import { createFrameScheduler, type DirtyLayers } from './frame-scheduler.js'
import { createReactiveCore } from './reactive.js'
import type { OptionState, OptionStateSnapshot } from './options.js'
import type { ReadonlySignal } from './reactive.js'

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

export const reactive = createReactiveCore(scheduler)
export const batch = <T>(run: () => T): T => reactive.batch(run)
export const untracked = <T>(run: () => T): T => reactive.untracked(run)

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

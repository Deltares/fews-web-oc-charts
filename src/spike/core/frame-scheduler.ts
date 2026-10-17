export const DirtyLayer = {
  layout: 1 << 0,
  axes: 1 << 1,
  grid: 1 << 2,
  marks: 1 << 3,
  overlay: 1 << 4,
  interaction: 1 << 5,
} as const

export type DirtyLayers = number
export type FrameCallback = (callback: FrameRequestCallback) => number

export interface FrameScheduler {
  invalidate(layers: DirtyLayers): void
  enqueueEffect(effect: () => void): void
  dispose(): void
}

export function createFrameScheduler(
  draw: (layers: DirtyLayers) => void,
  requestFrame: FrameCallback = (callback) => requestAnimationFrame(callback),
): FrameScheduler {
  let dirtyLayers = 0
  let framePending = false
  let flushing = false
  let disposed = false
  const effects = new Set<() => void>()

  function schedule() {
    if (framePending || flushing || disposed) return
    framePending = true
    requestFrame(() => {
      framePending = false
      if (disposed) return

      flushing = true
      const currentEffects = [...effects]
      effects.clear()
      let nextEffect = 0
      try {
        while (nextEffect < currentEffects.length) {
          const effect = currentEffects[nextEffect]
          nextEffect += 1
          effect()
        }

        const layers = dirtyLayers
        dirtyLayers = 0
        if (layers !== 0) draw(layers)
      } finally {
        for (; nextEffect < currentEffects.length; nextEffect += 1) {
          effects.add(currentEffects[nextEffect])
        }
        flushing = false
        if (effects.size > 0 || dirtyLayers !== 0) schedule()
      }
    })
  }

  return {
    invalidate(layers) {
      if (disposed) return
      dirtyLayers |= layers
      schedule()
    },
    enqueueEffect(effect) {
      if (disposed) return
      effects.add(effect)
      schedule()
    },
    dispose() {
      disposed = true
      dirtyLayers = 0
      effects.clear()
    },
  }
}

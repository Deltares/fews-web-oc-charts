/**
 * Installed handles validate their updates against the plot that holds them, for example that
 * `highlight.marks` are in `plot.marks`. A declarative rebuild (`handleCache.collect()`) updates
 * those handles before the plot receives the new configuration, so these checks are deferred
 * during it: `setConfig` validates the complete configuration, and the deferred checks run again
 * in a microtask to report a handle that was left inconsistent with its plot.
 */
let pending: Set<() => void> | undefined

function report(error: unknown) {
  if (typeof globalThis.reportError === 'function') globalThis.reportError(error)
  else
    setTimeout(() => {
      throw error
    })
}

/** Runs `run` with plot-relative update checks deferred until its end. */
export function deferPlotChecks<T>(run: () => T): T {
  if (pending) return run()
  const checks = new Set<() => void>()
  pending = checks
  try {
    return run()
  } finally {
    pending = undefined
    if (checks.size) {
      queueMicrotask(() => {
        for (const check of checks) {
          try {
            check()
          } catch (error) {
            report(error)
          }
        }
      })
    }
  }
}

/**
 * Registers `check` for the updates of `handle` through `register`. During `deferPlotChecks` the
 * check is skipped and `recheck`, which validates the handle's current options against the
 * plot, runs afterwards unless the returned disposer was called first.
 */
export function validatePlotUpdates<H, A extends unknown[]>(
  register: (handle: H, check: (...args: A) => void) => () => void,
  handle: H,
  check: NoInfer<(...args: A) => void>,
  recheck: () => void,
): () => void {
  let active = true
  const deferred = () => {
    if (active) recheck()
  }
  const stop = register(handle, (...args) => {
    if (pending) pending.add(deferred)
    else check(...args)
  })
  return () => {
    active = false
    stop()
  }
}

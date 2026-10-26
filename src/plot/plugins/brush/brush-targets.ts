import { reactive } from '../../../core/runtime.js'
import type { SelectionScaleContext } from '../../../sync/shared-selection.js'
import { onBrushSelectionSet, type BrushHandle } from './brush.js'

/** Called in the plugin scope; synchronization and echo tracking share its lifetime. */
export function connectBrushTargets(handle: BrushHandle, context: SelectionScaleContext) {
  let previous: readonly unknown[] = []
  function snapshot() {
    const config = handle.options.get().resolved
    return [
      config.mode,
      ...Object.entries(config.targets ?? {}).flatMap(([name, target]) => [
        name,
        target,
        target.domain.get(),
        context.scales[name],
        context.direction(name),
      ]),
    ]
  }
  function synchronize() {
    const config = handle.options.get().resolved
    const targets = Object.entries(config.targets ?? {})
    const next = snapshot()
    if (next.length === previous.length && next.every((value, index) => value === previous[index]))
      return
    previous = next
    if (!targets.length) return
    const directions = new Set(targets.map(([name]) => context.direction(name)))
    const mode =
      config.mode === 'auto'
        ? directions.size === 2
          ? 'xy'
          : directions.has('x')
            ? 'x'
            : 'y'
        : config.mode
    reactive.untracked(() =>
      handle.setSelection({
        mode,
        scales: Object.fromEntries(targets.map(([name, target]) => [name, target.domain.get()])),
      }),
    )
  }
  synchronize()
  const stopWrites = onBrushSelectionSet(handle, () => {
    previous = snapshot()
  })
  const effect = reactive.effect(synchronize)
  const release = reactive.onDispose(stopWrites)
  return () => {
    release()
    stopWrites()
    effect.dispose()
  }
}

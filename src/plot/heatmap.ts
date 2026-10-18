import { createOptionState, type OptionPatch, type OptionStateSnapshot } from '../core/options.js'
import type { ReadonlySignal } from '../core/reactive.js'
import { optionSignal } from '../core/runtime.js'
import { validateKeys } from '../core/validation.js'
import { isGridStore, type GridStore } from '../data-store/grid.js'
import { isColorScale, type ColorScale } from '../scales/color.js'

export interface HeatmapOptions {
  id?: string
  scales: { x: string; y: string }
  color: ColorScale
  renderer: 'svg' | 'canvas'
  visible: boolean
  opacity: number
}

export interface HeatmapMark {
  readonly id: string | undefined
  readonly x: string
  readonly y: string
  readonly data: GridStore
  readonly options: ReadonlySignal<OptionStateSnapshot<HeatmapOptions>>
  update(patch: OptionPatch<HeatmapOptions>): void
}

const handles = new WeakSet<object>()
export const isHeatmapMark = (value: object): value is HeatmapMark => handles.has(value)

export function heatmap(
  data: GridStore,
  initial: Pick<HeatmapOptions, 'scales' | 'color'> & OptionPatch<HeatmapOptions>,
): HeatmapMark {
  if (!data || !isGridStore(data)) throw new TypeError('heatmap requires a createGrid store.')
  const keys = ['id', 'scales', 'color', 'renderer', 'visible', 'opacity']
  validateKeys(initial, keys, 'heatmap')
  const defaultScales = { ...initial.scales }
  const defaultColor = initial.color
  const state = createOptionState<HeatmapOptions>(initial, {
    defaults: () => ({
      scales: defaultScales,
      color: defaultColor,
      renderer: 'svg',
      visible: true,
      opacity: 1,
    }),
    isAtomicReference: isColorScale,
    validate(options) {
      if (options.id !== undefined && (typeof options.id !== 'string' || !options.id))
        throw new Error('heatmap.id must be a non-empty string.')
      validateKeys(options.scales, ['x', 'y'], 'heatmap.scales')
      const { x, y } = options.scales
      if (typeof x !== 'string' || !x || typeof y !== 'string' || !y || x === y)
        throw new Error('heatmap.scales must name distinct x and y scales.')
      if (!options.color || !isColorScale(options.color))
        throw new Error('heatmap.color requires a colorScale handle.')
      if (options.renderer !== 'svg' && options.renderer !== 'canvas')
        throw new Error('heatmap.renderer must be svg or canvas.')
      if (typeof options.visible !== 'boolean') throw new Error('heatmap.visible must be boolean.')
      if (!Number.isFinite(options.opacity) || options.opacity < 0 || options.opacity > 1)
        throw new Error('heatmap.opacity must be between 0 and 1.')
    },
  })
  const signals = optionSignal(state)
  const mark: HeatmapMark = Object.freeze({
    data,
    options: signals.snapshot,
    get id() {
      return signals.snapshot.get().resolved.id
    },
    get x() {
      return signals.snapshot.get().resolved.scales.x
    },
    get y() {
      return signals.snapshot.get().resolved.scales.y
    },
    update(patch: OptionPatch<HeatmapOptions>) {
      validateKeys(patch, keys, 'heatmap')
      if (patch.id !== undefined && patch.id !== mark.id)
        throw new Error('heatmap.id cannot be changed.')
      if (Object.hasOwn(patch, 'id') && patch.id === undefined && mark.id !== undefined)
        throw new Error('heatmap.id cannot be changed.')
      if (Object.hasOwn(patch, 'scales')) throw new Error('heatmap.scales cannot be changed.')
      if (state.update(patch)) signals.publish()
    },
  })
  handles.add(mark)
  return mark
}

import { validateKeys } from '../core/validation.js'
import type { ScaleHandle } from '../scales/scale.js'
import type { BrushMode, BrushSelection } from '../plot/plugins/brush/brush.js'

export function validateSelection(value: BrushSelection, mode: BrushMode) {
  if (!value || typeof value !== 'object') throw new TypeError('brush.selection must be an object.')
  validateKeys(value, ['mode', 'scales'], 'brush.selection')
  if (!['x', 'y', 'xy'].includes(value.mode) || (mode !== 'auto' && mode !== value.mode)) {
    throw new Error('brush.selection.mode must match the configured brush mode.')
  }
  if (!value.scales || typeof value.scales !== 'object' || Array.isArray(value.scales)) {
    throw new Error('brush.selection.scales must be a named map.')
  }
  const ranges = Object.entries(value.scales)
  if (!ranges.length) throw new Error('brush.selection.scales must not be empty.')
  for (const [name, range] of ranges) {
    if (
      !name ||
      !Array.isArray(range) ||
      !range.length ||
      range.some((entry) => typeof entry !== 'string' && !Number.isFinite(entry)) ||
      new Set(range.map((entry) => typeof entry)).size !== 1 ||
      (typeof range[0] === 'string' && new Set(range).size !== range.length) ||
      (typeof range[0] === 'number' && (range.length !== 2 || Number(range[0]) >= Number(range[1])))
    ) {
      throw new Error(
        `brush.selection.${name} must contain categories or an increasing numeric pair.`,
      )
    }
  }
}

export function validateBrushScaleSelection(
  selection: BrushSelection,
  scales: Readonly<Record<string, ScaleHandle>>,
  direction: (name: string) => string,
) {
  for (const [name, range] of Object.entries(selection.scales)) {
    const scale = Object.hasOwn(scales, name) ? scales[name] : undefined
    if (!scale) throw new Error(`brush.selection references missing scale "${name}".`)
    if (!selection.mode.includes(direction(name))) {
      throw new Error(`brush.selection scale "${name}" does not match mode ${selection.mode}.`)
    }
    if (scale.kind === 'band') {
      if (range.some((value) => !scale.domain.get().includes(value))) {
        throw new Error(`brush.selection.${name} must contain categories from the scale domain.`)
      }
    } else if (
      range.length !== 2 ||
      range.some((value) => typeof value !== 'number') ||
      (scale.kind === 'log' && range.some((value) => Number(value) <= 0)) ||
      (scale.kind === 'time' && range.some((value) => Math.abs(Number(value)) > 8.64e15))
    ) {
      throw new Error(`brush.selection.${name} requires a valid continuous domain pair.`)
    }
  }
}

import { reactive } from '../core/runtime.js'
import type { ReadonlySignal } from '../core/reactive.js'
import { validateKeys } from '../core/validation.js'
import { isScaleHandle, type ScaleHandle, type ScaleValue } from '../scales/scale.js'
import type { BrushMode, BrushSelection, BrushSelectionMode } from '../plot/plugins/brush/brush.js'
import { validateBrushScaleSelection, validateSelection } from './selection-validation.js'

export interface SharedSelectionRange {
  readonly scale: ScaleHandle
  readonly axis: 'x' | 'y'
  readonly range: readonly ScaleValue[]
}

export interface SharedSelectionValue {
  readonly mode: BrushSelectionMode
  readonly ranges: readonly SharedSelectionRange[]
}

export interface SharedSelection {
  readonly selection: ReadonlySignal<SharedSelectionValue | undefined>
  setSelection(value: SharedSelectionValue | undefined): void
}

const handles = new WeakSet<object>()
export const isSharedSelection = (value: object): value is SharedSelection => handles.has(value)

export function sharedSelection(): SharedSelection {
  const state = reactive.signal<SharedSelectionValue | undefined>(
    undefined,
    (a, b) =>
      a === b ||
      (!!a &&
        !!b &&
        a.mode === b.mode &&
        a.ranges.length === b.ranges.length &&
        a.ranges.every((entry) => {
          const other = b.ranges.find((other) => other.scale === entry.scale)
          return (
            !!other &&
            entry.axis === other.axis &&
            entry.range.length === other.range.length &&
            entry.range.every((value, i) => value === other.range[i])
          )
        })),
  )
  const handle: SharedSelection = Object.freeze({
    selection: reactive.register({
      get: () => state.get(),
      get version() {
        return state.version
      },
    }),
    setSelection(value: SharedSelectionValue | undefined) {
      if (value === undefined) {
        state.set(undefined)
        return
      }
      if (!value || typeof value !== 'object')
        throw new TypeError('sharedSelection requires a selection object.')
      validateKeys(value, ['mode', 'ranges'], 'sharedSelection')
      if (
        !['x', 'y', 'xy'].includes(value.mode) ||
        !Array.isArray(value.ranges) ||
        !value.ranges.length
      ) {
        throw new Error('sharedSelection requires a mode and non-empty ranges.')
      }
      const seen = new Set<ScaleHandle>()
      const axes = new Set<string>()
      for (const entry of value.ranges) {
        if (!entry || typeof entry !== 'object')
          throw new TypeError('sharedSelection range must be an object.')
        validateKeys(entry, ['scale', 'axis', 'range'], 'sharedSelection.range')
        if (!entry.scale || !isScaleHandle(entry.scale) || seen.has(entry.scale)) {
          throw new Error('sharedSelection ranges require unique scale handles.')
        }
        if (entry.scale.kind === 'angular' || entry.scale.kind === 'radial') {
          throw new Error('Shared selections require Cartesian scale handles.')
        }
        if (!['x', 'y'].includes(entry.axis) || !value.mode.includes(entry.axis)) {
          throw new Error('sharedSelection range axis must match its mode.')
        }
        const selection: BrushSelection = { mode: entry.axis, scales: { value: entry.range } }
        validateSelection(selection, entry.axis)
        validateBrushScaleSelection(selection, { value: entry.scale }, () => entry.axis)
        seen.add(entry.scale)
        axes.add(entry.axis)
      }
      if ([...value.mode].some((axis) => !axes.has(axis))) {
        throw new Error('sharedSelection must provide ranges for every selected axis.')
      }
      state.set(
        Object.freeze({
          mode: value.mode,
          ranges: Object.freeze(
            value.ranges.map((entry) =>
              Object.freeze({
                scale: entry.scale,
                axis: entry.axis,
                range: Object.freeze([...entry.range]),
              }),
            ),
          ),
        }),
      )
    },
  })
  handles.add(handle)
  return handle
}

export interface SelectionScaleContext {
  readonly owner?: symbol
  readonly scales: Readonly<Record<string, ScaleHandle>>
  direction(this: void, name: string): string
}

export function localSharedSelection(
  value: SharedSelectionValue | undefined,
  mode: BrushMode,
  context: SelectionScaleContext,
): BrushSelection | undefined {
  if (!value) return undefined
  const scales: Record<string, readonly ScaleValue[]> = {}
  const axes = new Set<string>()
  for (const [name, scale] of Object.entries(context.scales)) {
    const axis = context.direction(name)
    if (mode !== 'auto' && !mode.includes(axis)) continue
    const entry = value.ranges.find((entry) => entry.scale === scale && entry.axis === axis)
    if (!entry) continue
    scales[name] = entry.range
    axes.add(axis)
  }
  const selectedMode = axes.has('x')
    ? axes.has('y')
      ? 'xy'
      : 'x'
    : axes.has('y')
      ? 'y'
      : undefined
  if (!selectedMode) return undefined
  return Object.freeze({ mode: selectedMode, scales: Object.freeze(scales) })
}

export function shareLocalSelection(
  value: BrushSelection,
  context: SelectionScaleContext,
): SharedSelectionValue {
  validateSelection(value, value.mode)
  validateBrushScaleSelection(value, context.scales, context.direction)
  const ranges: SharedSelectionRange[] = []
  for (const [name, range] of Object.entries(value.scales)) {
    const axis = context.direction(name)
    if (axis !== 'x' && axis !== 'y') throw new Error('Shared brushes require Cartesian scales.')
    const scale = context.scales[name]
    const previous = ranges.find((entry) => entry.scale === scale)
    if (previous) {
      if (
        previous.axis !== axis ||
        previous.range.length !== range.length ||
        previous.range.some((entry, index) => entry !== range[index])
      ) {
        throw new Error('Shared brush aliases must select the same range and direction.')
      }
    } else ranges.push({ scale, axis, range })
  }
  const hasX = ranges.some((entry) => entry.axis === 'x')
  const hasY = ranges.some((entry) => entry.axis === 'y')
  return { mode: hasX ? (hasY ? 'xy' : 'x') : 'y', ranges }
}

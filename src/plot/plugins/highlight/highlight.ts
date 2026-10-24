import {
  createOptionState,
  type OptionPatch,
  type OptionStateSnapshot,
} from '../../../core/options.js'
import { optionSignal } from '../../../core/runtime.js'
import type { ReadonlySignal } from '../../../core/reactive.js'
import { validateKeys } from '../../../core/validation.js'
import { isCrosshairHandle, type CrosshairHandle } from '../crosshair/crosshair.js'
import { isHoverMark, type HoverMark } from '../hover-hits.js'

export type HighlightAxis = 'x' | 'y' | 'xy'
export type HighlightMark = HoverMark

export interface HighlightOptions {
  axis: HighlightAxis
  /** Highlighted marks; defaults to every line, series, bar, stacked-area, histogram and heatmap mark. */
  marks?: readonly HighlightMark[]
  /** Follows this installed crosshair, including its snapping, like tooltip.crosshair. */
  crosshair?: CrosshairHandle
}

export interface HighlightHandle {
  readonly options: ReadonlySignal<OptionStateSnapshot<HighlightOptions>>
  update(patch: OptionPatch<HighlightOptions>): void
}

const handles = new WeakSet<object>()
const validators = new WeakMap<
  HighlightHandle,
  Set<(options: Readonly<HighlightOptions>) => void>
>()
const optionKeys = ['axis', 'marks', 'crosshair']

function validateMarks(marks: readonly HighlightMark[] | undefined) {
  if (marks === undefined) return
  if (!Array.isArray(marks)) throw new TypeError('highlight.marks must be an array.')
  if (marks.some((mark) => !mark || !isHoverMark(mark))) {
    throw new TypeError(
      'highlight.marks must contain line(), series(), bar(), stackedArea(), histogram() or heatmap() marks.',
    )
  }
  if (new Set(marks).size !== marks.length) {
    throw new Error('highlight.marks must not contain duplicate marks.')
  }
}

export function validateHighlightUpdates(
  handle: HighlightHandle,
  validate: (options: Readonly<HighlightOptions>) => void,
) {
  const consumers = validators.get(handle)
  if (!consumers) throw new Error('Expected a highlight handle.')
  consumers.add(validate)
  return () => consumers.delete(validate)
}

export function isHighlightHandle(value: object): value is HighlightHandle {
  return handles.has(value)
}

/** Draws a marker over the hovered datum of each inspected mark. */
export function highlight(initial: OptionPatch<HighlightOptions> = {}): HighlightHandle {
  validateKeys(initial, optionKeys, 'highlight')
  const consumers = new Set<(options: Readonly<HighlightOptions>) => void>()
  const state = createOptionState<HighlightOptions>(initial, {
    isAtomicReference: (value) => isHoverMark(value) || isCrosshairHandle(value),
    defaults: () => ({ axis: 'x', marks: undefined, crosshair: undefined }),
    validate(options) {
      if (!['x', 'y', 'xy'].includes(options.axis)) {
        throw new Error('highlight.axis must be x, y or xy.')
      }
      if (
        options.crosshair !== undefined &&
        (!options.crosshair || !isCrosshairHandle(options.crosshair))
      ) {
        throw new TypeError('highlight.crosshair must be a crosshair handle.')
      }
      validateMarks(options.marks)
      for (const validate of consumers) validate(options)
    },
  })
  const optionState = optionSignal(state)
  const handle: HighlightHandle = Object.freeze({
    options: optionState.snapshot,
    update(patch: OptionPatch<HighlightOptions>) {
      validateKeys(patch, optionKeys, 'highlight')
      if (state.update(patch)) optionState.publish()
    },
  })
  handles.add(handle)
  validators.set(handle, consumers)
  return handle
}

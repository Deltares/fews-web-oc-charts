import type { EnsembleStore } from '../../../data-store/ensemble.js'

export type EnsembleCurve = 'linear' | 'step-before' | 'step-after' | 'step'

export const ensembleCurves: readonly EnsembleCurve[] = [
  'linear',
  'step-before',
  'step-after',
  'step',
]

type Store = Pick<EnsembleStore, 'length' | 'xAt'>

/**
 * The x interval over which sample `index` holds its value: `(x[i-1], x[i]]` for
 * `step-before`, `[x[i], x[i+1])` for `step-after`, and between the midpoints to its
 * neighbours for `step`. A sample without a neighbour on one side borrows the width of
 * the interval on its other side, so the first `step-before` and last `step-after`
 * samples are as wide as their neighbour; a lone sample has zero width. Linear samples
 * have zero width.
 */
export function stepInterval(store: Store, curve: EnsembleCurve, index: number) {
  const x = store.xAt(index)
  if (curve === 'linear') return [x, x] as const
  const last = store.length - 1
  const previous = index > 0 ? store.xAt(index - 1) : undefined
  const next = index < last ? store.xAt(index + 1) : undefined
  const before = previous ?? (next === undefined ? x : 2 * x - next)
  const after = next ?? (previous === undefined ? x : 2 * x - previous)
  if (curve === 'step-before') return [before, x] as const
  if (curve === 'step-after') return [x, after] as const
  return [(before + x) / 2, (x + after) / 2] as const
}

/** x extent of the drawn curve, widened by the outer half steps of step curves. */
export function curveXExtent(store: Store, curve: EnsembleCurve) {
  if (!store.length) return undefined
  return [
    stepInterval(store, curve, 0)[0],
    stepInterval(store, curve, store.length - 1)[1],
  ] as const
}

/**
 * Index of the step sample whose interval contains `x` (clamped to the first and last
 * samples); intervals are closed on the side of the sample's own x. Assumes ascending x.
 */
export function stepIndexAt(store: Store, curve: Exclude<EnsembleCurve, 'linear'>, x: number) {
  const length = store.length
  // First index whose upper boundary reaches x.
  let low = 0
  let high = length
  while (low < high) {
    const middle = (low + high) >>> 1
    const upper = stepInterval(store, curve, middle)[1]
    const inside = curve === 'step-after' && middle < length - 1 ? upper > x : upper >= x
    if (inside) high = middle
    else low = middle + 1
  }
  return Math.min(low, length - 1)
}

/** Receives path commands; `Path2D` satisfies it directly. */
export interface PathSink {
  moveTo(x: number, y: number): void
  lineTo(x: number, y: number): void
}

type Project = (value: number) => number

/**
 * Traces one line through `indices` (every sample when omitted), breaking it at
 * non-finite values. Step curves draw each finite sample as a horizontal segment over
 * its interval, joined to the next by a vertical edge.
 */
export function traceCurve(
  sink: PathSink,
  store: Store,
  curve: EnsembleCurve,
  yAt: (index: number) => number,
  px: Project,
  py: Project,
  indices?: Iterable<number>,
) {
  let drawing = false
  const add = (index: number) => {
    const value = yAt(index)
    if (!Number.isFinite(value)) {
      drawing = false
      return
    }
    const y = py(value)
    if (curve === 'linear') {
      const x = px(store.xAt(index))
      if (drawing) sink.lineTo(x, y)
      else sink.moveTo(x, y)
    } else {
      const [from, to] = stepInterval(store, curve, index)
      if (drawing) sink.lineTo(px(from), y)
      else sink.moveTo(px(from), y)
      sink.lineTo(px(to), y)
    }
    drawing = true
  }
  if (indices) for (const index of indices) add(index)
  else for (let index = 0; index < store.length; index += 1) add(index)
}

/** SVG path data for the area between `low` and `high`, one closed run per finite stretch. */
export function bandPathData(
  store: Store,
  curve: EnsembleCurve,
  low: (index: number) => number,
  high: (index: number) => number,
  px: Project,
  py: Project,
) {
  let data = ''
  let runStart = 0
  const flush = (end: number) => {
    if (end > runStart) {
      let first = true
      const to = (x: number, y: number) => {
        data += `${first ? 'M' : 'L'}${x},${y}`
        first = false
      }
      for (let index = runStart; index < end; index += 1) {
        const y = py(high(index))
        if (curve === 'linear') to(px(store.xAt(index)), y)
        else {
          const [from, until] = stepInterval(store, curve, index)
          to(px(from), y)
          to(px(until), y)
        }
      }
      for (let index = end - 1; index >= runStart; index -= 1) {
        const y = py(low(index))
        if (curve === 'linear') to(px(store.xAt(index)), y)
        else {
          const [from, until] = stepInterval(store, curve, index)
          to(px(until), y)
          to(px(from), y)
        }
      }
      data += 'Z'
    }
    runStart = end + 1
  }
  for (let index = 0; index < store.length; index += 1) {
    if (!Number.isFinite(low(index)) || !Number.isFinite(high(index))) flush(index)
  }
  flush(store.length)
  return data
}

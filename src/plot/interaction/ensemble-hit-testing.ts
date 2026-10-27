import type { EnsembleMember } from '../../data-store/ensemble.js'
import type { Region } from '../../layout/layout.js'
import type { ScaleBinding } from '../../scales/scale.js'
import { controlMemberIndex, type EnsembleMark } from '../marks/ensemble/ensemble.js'
import { drawnMemberCount, ensembleStatistics } from '../marks/ensemble/ensemble-parts.js'

export interface EnsembleHitStatistic {
  /** `p5`, `median`, `mean`, … */
  readonly label: string
  /** Quantile probability in [0, 1]; undefined for the mean. */
  readonly probability: number | undefined
  readonly value: number
}

/** Inspection of one ensemble time step. */
export interface EnsembleHit {
  readonly index: number
  readonly x: number
  /** Value of the nearest drawn member or statistic line at this step. */
  readonly y: number
  readonly px: number
  readonly py: number
  readonly distance: number
  /** Nearest drawn member (or the control member) when that line is nearest. */
  readonly member: EnsembleMember | undefined
  /** Finite drawn statistics at this step: quantiles ascending, then the mean. */
  readonly statistics: readonly EnsembleHitStatistic[]
  readonly exceedance: Readonly<{ threshold: number; probability: number }> | undefined
}

export function isEnsembleHit(hit: object): hit is EnsembleHit {
  return 'statistics' in hit
}

/** Index of the step whose x pixel is nearest to `px`; ties go to the earlier step. */
function nearestStep(mark: EnsembleMark, xScale: ScaleBinding, px: number) {
  const store = mark.data
  const target = xScale.invert(px)
  let low = 0
  let high = store.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (store.xAt(middle) < target) low = middle + 1
    else high = middle
  }
  const candidates = [low - 1, low].filter((index) => index >= 0 && index < store.length)
  let best: number | undefined
  let bestDistance = Infinity
  for (const index of candidates) {
    const distance = Math.abs(xScale.project(store.xAt(index)) - px)
    if (distance < bestDistance) {
      best = index
      bestDistance = distance
    }
  }
  return best
}

function percentileLabel(probability: number) {
  return probability === 0.5 ? 'median' : `p${Math.round(probability * 1e6) / 1e4}`
}

export function ensembleHits(
  mark: EnsembleMark,
  scales: Readonly<Record<string, ScaleBinding>>,
  point: { readonly x: number; readonly y: number },
  axis: 'x' | 'y' | 'xy',
  plot: Readonly<Region>,
): readonly EnsembleHit[] {
  const options = mark.options.get().resolved
  const store = mark.data
  const _version = store.version
  const xScale = scales[mark.x]
  const yScale = scales[mark.y]
  if (!options.visible || !xScale || !yScale || !store.length) return []
  const index = nearestStep(mark, xScale, point.x)
  if (index === undefined) return []
  const x = store.xAt(index)
  const px = xScale.project(x)
  if (px < plot.x || px > plot.x + plot.width) return []

  const statistics = ensembleStatistics(options, store)
  const quantiles = new Map<number, number>()
  for (const [low, high, lowStatistic, highStatistic] of statistics.bands) {
    quantiles.set(low / 100, lowStatistic.at(index))
    quantiles.set(high / 100, highStatistic.at(index))
  }
  if (statistics.median) quantiles.set(0.5, statistics.median.at(index))
  const reported: EnsembleHitStatistic[] = [...quantiles]
    .sort(([left], [right]) => left - right)
    .map(([probability, value]) => ({ label: percentileLabel(probability), probability, value }))
  if (statistics.mean) {
    reported.push({ label: 'mean', probability: undefined, value: statistics.mean.at(index) })
  }

  // The hit's y is the drawn line nearest the pointer: a member, the control or a statistic.
  const lines: { value: number; member: number | undefined }[] = []
  for (let member = 0; member < drawnMemberCount(options, store); member += 1) {
    lines.push({ value: store.valueAt(member, index), member })
  }
  if (options.control) {
    const member = controlMemberIndex(store, options.control.member)
    lines.push({ value: store.valueAt(member, index), member })
  }
  if (statistics.median) lines.push({ value: statistics.median.at(index), member: undefined })
  if (statistics.mean) lines.push({ value: statistics.mean.at(index), member: undefined })
  for (const [, , low, high] of statistics.bands) {
    lines.push({ value: low.at(index), member: undefined })
    lines.push({ value: high.at(index), member: undefined })
  }
  let nearest: { value: number; member: number | undefined; py: number } | undefined
  for (const line of lines) {
    if (!Number.isFinite(line.value)) continue
    const py = yScale.project(line.value)
    if (!nearest || Math.abs(py - point.y) < Math.abs(nearest.py - point.y))
      nearest = { ...line, py }
  }
  if (!nearest) return []
  const dx = px - point.x
  const dy = nearest.py - point.y
  const threshold = options.exceedance ? options.exceedance.threshold : undefined
  return [
    Object.freeze({
      index,
      x,
      y: nearest.value,
      px,
      py: nearest.py,
      distance: axis === 'x' ? Math.abs(dx) : axis === 'y' ? Math.abs(dy) : Math.hypot(dx, dy),
      member: nearest.member === undefined ? undefined : store.members[nearest.member],
      statistics: Object.freeze(reported.filter(({ value }) => Number.isFinite(value))),
      exceedance:
        threshold === undefined
          ? undefined
          : Object.freeze({ threshold, probability: store.exceedance(threshold).at(index) }),
    }),
  ]
}

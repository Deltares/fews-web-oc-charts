import type { EnsembleStore } from '../../../data-store/ensemble.js'
import { defaultSpreadBands, type EnsembleOptions } from './ensemble.js'

export const ensembleParts = ['members', 'spread', 'median', 'mean', 'control'] as const
export type EnsemblePart = (typeof ensembleParts)[number]

export function isPartVisible(options: Readonly<EnsembleOptions>, part: EnsemblePart) {
  const current = options[part]
  return current !== false && current.visible !== false
}

const shown = new WeakMap<Readonly<EnsembleOptions>, Readonly<EnsembleOptions>>()

/** Options with hidden parts replaced by `false`, for rendering, autoscale and inspection. */
export function visibleParts(options: Readonly<EnsembleOptions>): Readonly<EnsembleOptions> {
  let result = shown.get(options)
  if (!result) {
    result = { ...options }
    for (const part of ensembleParts) {
      if (!isPartVisible(options, part)) result = { ...result, [part]: false }
    }
    shown.set(options, result)
  }
  return result
}

/** Members drawn by the mark, honouring `members.max`. */
export function drawnMemberCount(options: Readonly<EnsembleOptions>, store: EnsembleStore) {
  if (!options.members) return 0
  return Math.min(store.memberCount, options.members.max ?? store.memberCount)
}

export function spreadBands(options: Readonly<EnsembleOptions>) {
  return options.spread ? (options.spread.bands ?? defaultSpreadBands) : []
}

/**
 * Requests every quantile the mark draws in one call: the store refreshes all cached
 * quantiles in one sort pass, but only those registered before the first read.
 */
export function ensembleStatistics(options: Readonly<EnsembleOptions>, store: EnsembleStore) {
  const bands = spreadBands(options)
  const quantiles = store.quantiles([
    ...bands.flatMap(([low, high]) => [low / 100, high / 100]),
    ...(options.median ? [0.5] : []),
  ])
  return {
    bands: bands.map(
      ([low, high], position) =>
        [low, high, quantiles[position * 2], quantiles[position * 2 + 1]] as const,
    ),
    median: options.median ? quantiles.at(-1) : undefined,
    mean: options.mean ? store.mean() : undefined,
  }
}

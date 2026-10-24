import {
  createOptionState,
  type OptionPatch,
  type OptionStateSnapshot,
} from '../../../core/options.js'
import type { ReadonlySignal } from '../../../core/reactive.js'
import { optionSignal, untracked } from '../../../core/runtime.js'
import { validateKeys } from '../../../core/validation.js'
import {
  createTable,
  isTableStore,
  validateTableUpdates,
  type TableStore,
  type TableView,
} from '../../../data-store/table.js'
import { bar, type BarMark, type BarOptions } from '../bar/bar.js'

export interface HistogramOptions extends Pick<
  BarOptions,
  | 'renderer'
  | 'id'
  | 'x'
  | 'scales'
  | 'orientation'
  | 'visible'
  | 'label'
  | 'fill'
  | 'opacity'
  | 'stroke'
  | 'strokeWidth'
> {
  /** Exact equal-width bin count, or complete, strictly increasing bin edges. */
  bins: number | readonly number[]
  /** Sample domain for a bin count; explicit bin edges define their own domain. */
  domain?: readonly [number, number]
  normalization: 'count' | 'probability' | 'density'
}

export interface HistogramBin {
  readonly start: number
  readonly end: number
  readonly count: number
  readonly value: number
}

export interface HistogramMark {
  readonly id: string | undefined
  readonly x: string
  readonly y: string
  readonly data: TableStore
  readonly bins: readonly HistogramBin[]
  readonly options: ReadonlySignal<OptionStateSnapshot<HistogramOptions>>
  update(patch: OptionPatch<HistogramOptions>): void
}

const handles = new WeakSet<object>()
const validators = new WeakMap<HistogramMark, Set<(candidate: BarMark) => void>>()
const tableChecks = new WeakMap<HistogramMark, (candidate: TableView) => void>()
const bars = new WeakMap<
  HistogramMark,
  { bins: readonly HistogramBin[]; version: number; mark: BarMark }
>()
export const isHistogramMark = (value: object): value is HistogramMark => handles.has(value)

function validateBinning(data: TableView, options: Readonly<HistogramOptions>) {
  if (data.kind(options.x) !== 'number')
    throw new Error('histogram.x requires a numeric/time table column.')
  if (typeof options.bins === 'number') {
    if (!Number.isSafeInteger(options.bins) || options.bins < 1)
      throw new RangeError('histogram.bins must be a positive safe integer.')
  } else if (!Array.isArray(options.bins) || options.bins.length < 2) {
    throw new RangeError('histogram.bins requires at least two explicit edges.')
  }
  const edges = typeof options.bins === 'number' ? options.domain : options.bins
  if (options.domain !== undefined) {
    if (typeof options.bins !== 'number')
      throw new Error('histogram.domain and explicit bin edges are mutually exclusive.')
    if (!Array.isArray(options.domain) || options.domain.length !== 2)
      throw new RangeError('histogram.domain requires two ascending finite values.')
  }
  if (
    edges &&
    edges.some((edge, index) => !Number.isFinite(edge) || (index > 0 && edge <= edges[index - 1]))
  )
    throw new RangeError('Histogram edges must be finite and strictly increasing.')
  if (!['count', 'probability', 'density'].includes(options.normalization))
    throw new Error('histogram.normalization must be count, probability or density.')
}

function computeBins(
  data: TableView,
  options: Readonly<HistogramOptions>,
): readonly HistogramBin[] {
  validateBinning(data, options)
  let edges: readonly number[]
  if (typeof options.bins !== 'number') edges = options.bins
  else {
    const count = options.bins
    let low = options.domain?.[0] ?? Infinity
    let high = options.domain?.[1] ?? -Infinity
    if (!options.domain) {
      for (let row = 0; row < data.length; row += 1) {
        const value = Number(data.valueAt(options.x, row))
        if (!Number.isFinite(value)) continue
        low = Math.min(low, value)
        high = Math.max(high, value)
      }
      if (low > high) return Object.freeze([])
      if (low === high) {
        const padding = Math.max(0.5, Math.abs(low) * 0.01)
        low -= padding
        high += padding
      }
    }
    edges = Array.from({ length: count + 1 }, (_, index) => {
      const ratio = index / count
      return index === 0 ? low : index === count ? high : low * (1 - ratio) + high * ratio
    })
  }
  for (let index = 1; index < edges.length; index += 1) {
    const width = edges[index] - edges[index - 1]
    if (!Number.isFinite(edges[index - 1]) || !Number.isFinite(width) || width <= 0)
      throw new RangeError('Histogram bin widths must be positive, finite and representable.')
  }
  const counts = new Float64Array(edges.length - 1)
  let total = 0
  for (let row = 0; row < data.length; row += 1) {
    const value = Number(data.valueAt(options.x, row))
    if (!Number.isFinite(value) || value < edges[0] || value > edges.at(-1)!) continue
    // Right bisect puts an interior edge in the following bin; the final edge stays in the last.
    let low = 1
    let high = edges.length - 1
    while (low < high) {
      const middle = Math.floor((low + high) / 2)
      if (value < edges[middle]) high = middle
      else low = middle + 1
    }
    counts[low - 1] += 1
    total += 1
  }
  return Object.freeze(
    Array.from(counts, (count, index) => {
      const start = edges[index]
      const end = edges[index + 1]
      const probability = total ? count / total : 0
      const value =
        options.normalization === 'count'
          ? count
          : options.normalization === 'probability'
            ? probability
            : probability / (end - start)
      if (!Number.isFinite(value)) throw new RangeError('Histogram density must be finite.')
      return Object.freeze({ start, end, count, value })
    }),
  )
}

function binTable(bins: readonly HistogramBin[]) {
  return createTable({
    row: bins.map((_, index) => index),
    start: bins.map((bin) => bin.start),
    end: bins.map((bin) => bin.end),
    value: bins.map((bin) => bin.value),
  })
}

function barOptions(options: Readonly<HistogramOptions>): OptionPatch<BarOptions> {
  const { bins: _bins, domain: _domain, normalization: _normalization, ...style } = options
  return {
    ...style,
    x: 'start',
    y: 'value',
    interval: { start: 'start', end: 'end' },
    groupPadding: 0,
    layerPadding: 0,
  }
}

export function histogram(data: TableStore, initial: OptionPatch<HistogramOptions>): HistogramMark {
  if (!data || !isTableStore(data)) throw new TypeError('histogram requires a createTable store.')
  const keys = [
    'renderer',
    'id',
    'x',
    'scales',
    'orientation',
    'visible',
    'label',
    'fill',
    'opacity',
    'stroke',
    'strokeWidth',
    'bins',
    'domain',
    'normalization',
  ]
  const consumers = new Set<(candidate: BarMark) => void>()
  let cachedKey: string | undefined
  let cachedVersion: number | undefined
  let cachedBins: readonly HistogramBin[]
  function bins(options: Readonly<HistogramOptions>) {
    const key = JSON.stringify([options.x, options.bins, options.domain, options.normalization])
    if (key !== cachedKey || cachedVersion !== data.version) {
      const result = computeBins(data, options)
      cachedKey = key
      cachedVersion = data.version
      cachedBins = result
    }
    return cachedBins
  }
  validateKeys(initial, keys, 'histogram')
  const state = createOptionState<HistogramOptions>(initial, {
    defaults: () => ({
      renderer: 'svg',
      x: '',
      scales: { x: '', y: '' },
      orientation: 'vertical',
      visible: true,
      label: '',
      opacity: 1,
      strokeWidth: 0,
      bins: 10,
      normalization: 'count',
    }),
    validate(options) {
      validateBinning(data, options)
      const candidate = bar(binTable(bins(options)), barOptions(options))
      for (const consumer of consumers) consumer(candidate)
    },
  })
  const signals = optionSignal(state)
  const mark: HistogramMark = Object.freeze({
    data,
    options: signals.snapshot,
    get id() {
      return state.getSnapshot().resolved.id
    },
    get x() {
      const options = state.getSnapshot().resolved
      return options.orientation === 'vertical' ? options.scales.x : options.scales.y
    },
    get y() {
      const options = state.getSnapshot().resolved
      return options.orientation === 'vertical' ? options.scales.y : options.scales.x
    },
    get bins() {
      return bins(signals.snapshot.get().resolved)
    },
    update(patch: OptionPatch<HistogramOptions>) {
      validateKeys(patch, keys, 'histogram')
      if (Object.hasOwn(patch, 'id') && patch.id !== mark.id)
        throw new Error('histogram.id is immutable.')
      if (state.update(patch)) signals.publish()
    },
  })
  const check = (candidate: TableView) => {
    computeBins(candidate, state.getSnapshot().resolved)
  }
  tableChecks.set(mark, check)
  validateTableUpdates(data, check)
  handles.add(mark)
  validators.set(mark, consumers)
  return mark
}

export function histogramBar(mark: HistogramMark): BarMark {
  // Only the source table/options are reactive dependencies; the interval table is derived.
  const bins = mark.bins
  const options = mark.options.get().resolved
  const version = mark.options.version
  return untracked(() => {
    let cached = bars.get(mark)
    if (!cached || cached.bins !== bins) {
      cached = { bins, version, mark: bar(binTable(bins), barOptions(options)) }
      bars.set(mark, cached)
    } else if (cached.version !== version) {
      cached.mark.update(barOptions(options))
      cached.version = version
    }
    return cached.mark
  })
}

export function validateHistogramUpdates(
  mark: HistogramMark,
  validate: (candidate: BarMark) => void,
) {
  const entries = validators.get(mark)
  if (!entries) throw new TypeError('Expected a histogram mark.')
  entries.add(validate)
  return () => entries.delete(validate)
}

import { quantileSorted as quantileR7 } from 'd3'
import { reactive } from '../core/runtime.js'
import { validateKeys } from '../core/validation.js'
import type { SeriesChange, SeriesLod } from './series.js'

export interface EnsembleMatrix {
  readonly memberCount: number
  /** Row-major members × time: values[member * x.length + step]. */
  readonly values: ArrayLike<number | null>
}

export interface EnsembleInput {
  x: ArrayLike<number | Date>
  /** One column per member, or a row-major matrix. Use `null` or `NaN` for missing values. */
  members: readonly ArrayLike<number | null>[] | EnsembleMatrix
}

export interface EnsembleMemberMetadata {
  id: string
  label?: string
}

export interface EnsembleMember {
  readonly index: number
  readonly id: string
  readonly label: string
}

/**
 * Sample quantile definition, numbered as in Hyndman & Fan (1996), "Sample quantiles in
 * statistical packages", The American Statistician 50(4), 361–365.
 *
 * - `r6`: rank `p(n + 1)` (1-based), the Weibull plotting position recommended by the
 *   NIST/SEMATECH e-Handbook of Statistical Methods and used by Excel's `PERCENTILE.EXC`.
 *   Ranks outside `[1, n]` are clamped to the smallest and largest member.
 * - `r7`: rank `1 + (n - 1)p`, the default of d3, NumPy, R and Excel's `PERCENTILE.INC`.
 */
export type EnsembleQuantileMethod = 'r6' | 'r7'

/** R-6 quantile of ascending `sorted` values; `p` is in [0, 1]. */
function quantileR6(sorted: ArrayLike<number>, p: number) {
  const n = sorted.length
  if (!n) return undefined
  const rank = p * (n + 1)
  if (rank <= 1) return sorted[0]
  if (rank >= n) return sorted[n - 1]
  const lower = Math.floor(rank)
  return sorted[lower - 1] + (rank - lower) * (sorted[lower] - sorted[lower - 1])
}

export interface EnsembleStoreOptions {
  capacity?: number
  maxPoints?: number
  maxAge?: number
  /** Defaults to float32; x is always stored as float64. */
  precision?: 'float64' | 'float32'
  /** One entry per member; ids default to the member index. */
  metadata?: readonly EnsembleMemberMetadata[]
  /** Quantile definition (Hyndman & Fan numbering); defaults to `r6`. */
  quantileMethod?: EnsembleQuantileMethod
}

export type EnsembleChange = SeriesChange

/**
 * Live, store-owned statistic over the non-missing members at each time step;
 * `NaN` where no member is valid. Reads recompute lazily after mutations.
 */
export interface EnsembleStatistic {
  readonly kind: 'quantile' | 'mean' | 'exceedance'
  /** Probability in [0, 1] for quantiles, threshold for exceedance. */
  readonly parameter: number | undefined
  readonly length: number
  at(this: void, index: number): number
  extent(this: void, window?: readonly [number, number]): readonly [number, number] | undefined
}

export interface EnsembleStore {
  readonly quantileMethod: EnsembleQuantileMethod
  readonly length: number
  readonly capacity: number
  readonly memberCount: number
  readonly members: readonly EnsembleMember[]
  readonly version: number
  readonly change: EnsembleChange | undefined
  /** Index of the member with this id, or -1. */
  memberIndex(id: string): number
  /** Extent over all members; `window` filters on x. */
  extent(
    this: void,
    axis: 'x' | 'y',
    window?: readonly [number, number],
  ): readonly [number, number] | undefined
  xAt(this: void, index: number): number
  valueAt(member: number, index: number): number
  /** Probability in [0, 1]; 0 and 1 give the min/max envelope. */
  quantile(probability: number): EnsembleStatistic
  quantiles(probabilities: readonly number[]): readonly EnsembleStatistic[]
  /** M4 decimation of one member: logical row indices for `width` pixel columns. */
  memberLod(member: number, window: readonly [number, number], width: number): SeriesLod
  mean(): EnsembleStatistic
  /** Fraction of valid members strictly above `threshold`. */
  exceedance(threshold: number): EnsembleStatistic
  append(rows: EnsembleInput): void
  prepend(rows: EnsembleInput): void
  upsert(input: { from: number; to: number; rows: EnsembleInput }): void
  replace(rows: EnsembleInput): void
  clear(): void
}

/** Validated input copy; values are row-major members × length. */
interface EnsembleColumns {
  readonly x: Float64Array
  readonly values: Float64Array
  readonly length: number
  readonly memberCount: number
}

/** Derived column indexed by physical slot, sharing the store's ring layout. */
interface DerivedColumn {
  readonly kind: EnsembleStatistic['kind']
  readonly parameter: number | undefined
  data: Float64Array
  /** Layout generation and pushed-row serial the column is complete for. */
  generation: number
  serial: number
  evicted: boolean
}

const stores = new WeakSet<object>()
export const isEnsembleStore = (value: object): value is EnsembleStore => stores.has(value)

const diagnostics = new WeakMap<
  object,
  () => {
    canonicalBytes: number
    summaryBlocks: number
    summaryRows: number
    derivedColumns: number
    derivedBytes: number
    sortedSteps: number
  }
>()

export function ensembleStorageDiagnostics(store: EnsembleStore) {
  const read = diagnostics.get(store)
  if (!read) throw new TypeError('Expected an ensemble store.')
  return Object.freeze(read())
}

function epoch(value: unknown, path: string): number {
  const numeric = value instanceof Date ? value.getTime() : value
  if (typeof numeric !== 'number' || !Number.isFinite(numeric) || Math.abs(numeric) > 8.64e15) {
    throw new RangeError(`${path} must be a finite value within the JavaScript Date range.`)
  }
  return numeric
}

function normalize(
  input: EnsembleInput,
  precision: 'float64' | 'float32',
  expectedMembers?: number,
): EnsembleColumns {
  if (!input || typeof input !== 'object') throw new TypeError('ensemble input must be an object.')
  validateKeys(input, ['x', 'members'], 'ensemble')
  if (!input.x || !Number.isSafeInteger(input.x.length) || input.x.length < 0) {
    throw new TypeError('ensemble.x must be an array-like column.')
  }
  const length = input.x.length
  const members = input.members
  if (!members || typeof members !== 'object') {
    throw new TypeError('ensemble.members must be an array of columns or a matrix.')
  }
  let memberCount: number
  let read: (member: number, step: number) => unknown
  if (Array.isArray(members)) {
    memberCount = members.length
    members.forEach((column, member) => {
      if (!column || !Number.isSafeInteger(column.length) || column.length !== length) {
        throw new RangeError(`ensemble.members[${member}] must be a column as long as x.`)
      }
    })
    read = (member, step) => members[member][step]
  } else {
    const matrix = members as EnsembleMatrix
    validateKeys(matrix, ['memberCount', 'values'], 'ensemble.members')
    memberCount = matrix.memberCount
    if (!Number.isSafeInteger(memberCount)) {
      throw new RangeError('ensemble.members.memberCount must be a safe integer.')
    }
    if (!matrix.values || matrix.values.length !== memberCount * length) {
      throw new RangeError('ensemble.members.values length must equal memberCount * x.length.')
    }
    read = (member, step) => matrix.values[member * length + step]
  }
  if (memberCount < 1) throw new RangeError('ensemble requires at least one member.')
  if (expectedMembers !== undefined && memberCount !== expectedMembers) {
    throw new RangeError(`ensemble mutations require exactly ${expectedMembers} members.`)
  }
  const x = new Float64Array(length)
  let previous = -Infinity
  for (let step = 0; step < length; step += 1) {
    x[step] = epoch(input.x[step], `ensemble.x[${step}]`)
    if (x[step] < previous) throw new RangeError(`ensemble.x[${step}] is out of order.`)
    previous = x[step]
  }
  const values = new Float64Array(memberCount * length)
  for (let member = 0; member < memberCount; member += 1) {
    for (let step = 0; step < length; step += 1) {
      const value = read(member, step)
      if (value === null) {
        values[member * length + step] = NaN
        continue
      }
      if (
        typeof value !== 'number' ||
        (!Number.isFinite(value) && !Number.isNaN(value)) ||
        (precision === 'float32' && Number.isFinite(value) && !Number.isFinite(Math.fround(value)))
      ) {
        throw new RangeError(
          `ensemble member ${member} value ${step} must be finite at the requested precision, NaN or null.`,
        )
      }
      values[member * length + step] = value
    }
  }
  return { x, values, length, memberCount }
}

function resolveMembers(
  metadata: readonly EnsembleMemberMetadata[] | undefined,
  memberCount: number,
): readonly EnsembleMember[] {
  if (metadata !== undefined && (!Array.isArray(metadata) || metadata.length !== memberCount)) {
    throw new RangeError('ensemble.metadata must have one entry per member.')
  }
  const seen = new Set<string>()
  return Object.freeze(
    Array.from({ length: memberCount }, (_, index) => {
      const entry = metadata?.[index]
      if (entry !== undefined) validateKeys(entry, ['id', 'label'], `ensemble.metadata[${index}]`)
      const id = entry === undefined ? String(index) : entry.id
      if (typeof id !== 'string' || !id) {
        throw new TypeError(`ensemble.metadata[${index}].id must be a nonempty string.`)
      }
      if (seen.has(id)) throw new Error(`ensemble member id "${id}" is not unique.`)
      seen.add(id)
      const label = entry?.label ?? id
      if (typeof label !== 'string') {
        throw new TypeError(`ensemble.metadata[${index}].label must be a string.`)
      }
      return Object.freeze({ index, id, label })
    }),
  )
}

export function createEnsemble(
  input: EnsembleInput,
  options: EnsembleStoreOptions = {},
): EnsembleStore {
  validateKeys(
    options,
    ['capacity', 'maxPoints', 'maxAge', 'precision', 'metadata', 'quantileMethod'],
    'ensemble',
  )
  for (const key of ['capacity', 'maxPoints'] as const) {
    const value = options[key]
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 1)) {
      throw new RangeError(`ensemble.${key} must be a positive safe integer.`)
    }
  }
  if (options.maxAge !== undefined && (!Number.isFinite(options.maxAge) || options.maxAge < 0)) {
    throw new RangeError('ensemble.maxAge must be a nonnegative finite number.')
  }
  const quantileMethod = options.quantileMethod ?? 'r6'
  if (quantileMethod !== 'r6' && quantileMethod !== 'r7') {
    throw new Error('ensemble.quantileMethod must be r6 or r7.')
  }
  const quantileSorted = quantileMethod === 'r6' ? quantileR6 : quantileR7
  const precision = options.precision === undefined ? 'float32' : options.precision
  if (precision !== 'float32' && precision !== 'float64') {
    throw new Error('ensemble.precision must be float32 or float64.')
  }
  const maxPoints = options.maxPoints ?? Infinity
  const maxAge = options.maxAge
  const initial = normalize(input, precision)
  const memberCount = initial.memberCount
  const members = resolveMembers(options.metadata, memberCount)
  const memberIds = new Map(members.map((member) => [member.id, member.index]))
  const allocate = (length: number) =>
    precision === 'float32' ? new Float32Array(length) : new Float64Array(length)
  let x = new Float64Array(
    Math.max(1, Math.min(maxPoints, Math.max(options.capacity ?? 1, initial.length))),
  )
  // Row-major members × capacity; each member's row is its own ring.
  let values = allocate(x.length * memberCount)
  let head = 0
  let count = 0
  const version = reactive.signal(0)
  let change: EnsembleChange | undefined
  const extentBlockSize = 128
  let extentBlocks: Array<
    Readonly<{ xMin: number; xMax: number; yMin: number; yMax: number }> | undefined
  > = []
  let extentIndexDirty = true
  let summaryRows = 0
  // Appends advance `serial`; reallocation and rebuilds advance `generation`.
  let generation = 0
  let serial = 0
  const derivedLimitBytes = 16 * 1024 * 1024
  const derivedLimitEntries = 32
  const derived = new Map<string, DerivedColumn>()
  let sortedSteps = 0
  const lodCacheLimitBytes = 4 * 1024 * 1024
  const lodCacheLimitEntries = 256
  const lodCache = new Map<string, Uint32Array>()
  let lodCacheByteLength = 0
  const scratch = new Float64Array(memberCount)

  function slot(index: number) {
    if (!Number.isInteger(index) || index < 0 || index >= count) {
      throw new RangeError(`ensemble index ${index} is outside the store.`)
    }
    return (head + index) % x.length
  }
  const xAt = (index: number) => x[slot(index)]
  function valueAt(member: number, index: number) {
    if (!Number.isInteger(member) || member < 0 || member >= memberCount) {
      throw new RangeError(`ensemble member ${member} is outside the store.`)
    }
    return values[member * x.length + slot(index)]
  }

  function reserve(required: number) {
    if (required <= x.length) return
    const capacity = Math.min(maxPoints, Math.max(required, x.length * 2))
    const nextX = new Float64Array(capacity)
    const nextValues = allocate(capacity * memberCount)
    for (let index = 0; index < count; index += 1) {
      const physical = (head + index) % x.length
      nextX[index] = x[physical]
      for (let member = 0; member < memberCount; member += 1) {
        nextValues[member * capacity + index] = values[member * x.length + physical]
      }
    }
    x = nextX
    values = nextValues
    head = 0
    extentIndexDirty = true
    generation += 1
  }

  function push(columns: EnsembleColumns) {
    let evictedCount = 0
    let evictedFrom = Infinity
    let evictedTo = -Infinity
    const touchedBlocks = new Set<number>()
    const evict = (value: number) => {
      evictedCount += 1
      evictedFrom = Math.min(evictedFrom, value)
      evictedTo = Math.max(evictedTo, value)
    }
    const start = Math.max(0, columns.length - maxPoints)
    for (let step = 0; step < start; step += 1) evict(columns.x[step])
    reserve(Math.min(maxPoints, count + columns.length - start))
    for (let step = start; step < columns.length; step += 1) {
      if (count === x.length) {
        evict(xAt(0))
        touchedBlocks.add(Math.floor(head / extentBlockSize))
        head = (head + 1) % x.length
        count -= 1
      }
      const physical = (head + count) % x.length
      x[physical] = columns.x[step]
      for (let member = 0; member < memberCount; member += 1) {
        values[member * x.length + physical] = columns.values[member * columns.length + step]
      }
      count += 1
      serial += 1
      touchedBlocks.add(Math.floor(physical / extentBlockSize))
    }
    if (count && maxAge !== undefined) {
      const cutoff = xAt(count - 1) - maxAge
      while (count && xAt(0) < cutoff) {
        evict(xAt(0))
        touchedBlocks.add(Math.floor(head / extentBlockSize))
        head = (head + 1) % x.length
        count -= 1
      }
    }
    if (extentIndexDirty) rebuildExtentIndex()
    else for (const block of touchedBlocks) extentBlocks[block] = refreshExtentBlock(block)
    return evictedCount
      ? Object.freeze({ count: evictedCount, from: evictedFrom, to: evictedTo })
      : undefined
  }

  function rebuildExtentIndex() {
    extentBlocks = Array.from({ length: Math.ceil(x.length / extentBlockSize) }, (_, block) =>
      refreshExtentBlock(block),
    )
    extentIndexDirty = false
  }

  function refreshExtentBlock(block: number) {
    const start = block * extentBlockSize
    const end = Math.min(x.length, start + extentBlockSize)
    let xMin = Infinity
    let xMax = -Infinity
    let yMin = Infinity
    let yMax = -Infinity
    for (let physical = start; physical < end; physical += 1) {
      const logical = (physical - head + x.length) % x.length
      if (logical >= count) continue
      summaryRows += 1
      let present = false
      for (let member = 0; member < memberCount; member += 1) {
        const value = values[member * x.length + physical]
        if (!Number.isFinite(value)) continue
        present = true
        yMin = Math.min(yMin, value)
        yMax = Math.max(yMax, value)
      }
      if (!present) continue
      xMin = Math.min(xMin, x[physical])
      xMax = Math.max(xMax, x[physical])
    }
    return xMin <= xMax ? Object.freeze({ xMin, xMax, yMin, yMax }) : undefined
  }

  /** Half-open logical row range with x inside the closed window. */
  function rowRange(window?: readonly [number, number]): [number, number] {
    if (!window) return [0, count]
    const low = Math.min(window[0], window[1])
    const high = Math.max(window[0], window[1])
    let left = 0
    let right = count
    while (left < right) {
      const middle = Math.floor((left + right) / 2)
      if (xAt(middle) < low) left = middle + 1
      else right = middle
    }
    const first = left
    right = count
    while (left < right) {
      const middle = Math.floor((left + right) / 2)
      if (xAt(middle) <= high) left = middle + 1
      else right = middle
    }
    return [first, left]
  }

  function extent(
    axis: 'x' | 'y',
    window?: readonly [number, number],
  ): readonly [number, number] | undefined {
    if (extentIndexDirty) rebuildExtentIndex()
    const range = rowRange(window)
    const end = range[1]
    let first = range[0]
    let low = Infinity
    let high = -Infinity
    const addRow = (physical: number) => {
      for (let member = 0; member < memberCount; member += 1) {
        const value = values[member * x.length + physical]
        if (!Number.isFinite(value)) continue
        const extentValue = axis === 'x' ? x[physical] : value
        low = Math.min(low, extentValue)
        high = Math.max(high, extentValue)
        if (axis === 'x') return
      }
    }
    while (first < end) {
      const physical = slot(first)
      const available = Math.min(end - first, x.length - physical)
      let offset = 0
      while (offset < available && (physical + offset) % extentBlockSize !== 0) {
        addRow(physical + offset)
        offset += 1
      }
      while (offset + extentBlockSize <= available) {
        const block = extentBlocks[(physical + offset) / extentBlockSize]
        if (block) {
          low = Math.min(low, axis === 'x' ? block.xMin : block.yMin)
          high = Math.max(high, axis === 'x' ? block.xMax : block.yMax)
        }
        offset += extentBlockSize
      }
      while (offset < available) {
        addRow(physical + offset)
        offset += 1
      }
      first += available
    }
    return low <= high ? Object.freeze([low, high]) : undefined
  }

  const isFresh = (column: DerivedColumn) =>
    !column.evicted && column.generation === generation && column.serial === serial

  /** First logical row the column must (re)compute. */
  function staleFrom(column: DerivedColumn) {
    if (isFresh(column)) return count
    if (column.generation !== generation || column.data.length !== x.length) {
      if (column.data.length !== x.length) column.data = new Float64Array(x.length)
      return 0
    }
    return Math.max(0, count - (serial - column.serial))
  }

  /** Copies the valid members at a physical slot into scratch; returns their count. */
  function gather(physical: number) {
    let valid = 0
    for (let member = 0; member < memberCount; member += 1) {
      const value = values[member * x.length + physical]
      if (Number.isFinite(value)) scratch[valid++] = value
    }
    return valid
  }

  function refresh(target: DerivedColumn) {
    // All cached quantiles share one sort per time step.
    const group =
      target.kind === 'quantile'
        ? [...derived.values()].filter((column) => column.kind === 'quantile')
        : [target]
    const starts = group.map(staleFrom)
    for (let index = Math.min(...starts); index < count; index += 1) {
      const physical = (head + index) % x.length
      const valid = gather(physical)
      if (target.kind === 'quantile') {
        // d3 types require an array; both quantile functions only use indexed access.
        const sorted = scratch.subarray(0, valid).sort() as unknown as number[]
        sortedSteps += 1
        for (let position = 0; position < group.length; position += 1) {
          if (index < starts[position]) continue
          group[position].data[physical] = valid
            ? quantileSorted(sorted, group[position].parameter!)!
            : NaN
        }
      } else if (target.kind === 'mean') {
        let sum = 0
        for (let member = 0; member < valid; member += 1) sum += scratch[member]
        target.data[physical] = valid ? sum / valid : NaN
      } else {
        let above = 0
        for (let member = 0; member < valid; member += 1) {
          if (scratch[member] > target.parameter!) above += 1
        }
        target.data[physical] = valid ? above / valid : NaN
      }
    }
    for (const column of group) {
      column.generation = generation
      column.serial = serial
    }
  }

  function column(kind: DerivedColumn['kind'], parameter: number | undefined) {
    const key = `${kind}:${parameter ?? ''}`
    let entry = derived.get(key)
    if (entry) derived.delete(key)
    else {
      entry = {
        kind,
        parameter,
        data: new Float64Array(x.length),
        generation: -1,
        serial: -1,
        evicted: false,
      }
    }
    derived.set(key, entry)
    let bytes = 0
    for (const cached of derived.values()) bytes += cached.data.byteLength
    while ((bytes > derivedLimitBytes || derived.size > derivedLimitEntries) && derived.size > 1) {
      const [oldestKey, oldest] = derived.entries().next().value!
      derived.delete(oldestKey)
      bytes -= oldest.data.byteLength
      oldest.evicted = true
      oldest.data = new Float64Array(0)
    }
    return entry
  }

  function statistic(kind: DerivedColumn['kind'], parameter?: number): EnsembleStatistic {
    let entry = column(kind, parameter)
    const data = () => {
      if (entry.evicted) entry = column(kind, parameter)
      if (!isFresh(entry)) refresh(entry)
      return entry.data
    }
    return Object.freeze({
      kind,
      parameter,
      get length() {
        return count
      },
      at(index: number) {
        const physical = slot(index)
        return data()[physical]
      },
      extent(window?: readonly [number, number]) {
        const current = data()
        const [first, end] = rowRange(window)
        let low = Infinity
        let high = -Infinity
        for (let index = first; index < end; index += 1) {
          const value = current[(head + index) % x.length]
          if (!Number.isFinite(value)) continue
          low = Math.min(low, value)
          high = Math.max(high, value)
        }
        return low <= high ? Object.freeze([low, high] as const) : undefined
      },
    })
  }

  function quantile(probability: number) {
    if (typeof probability !== 'number' || !(probability >= 0 && probability <= 1)) {
      throw new RangeError('ensemble.quantile probability must be within [0, 1].')
    }
    return statistic('quantile', probability === 0 ? 0 : probability)
  }

  function memberLod(member: number, window: readonly [number, number], width: number): SeriesLod {
    if (!Number.isInteger(member) || member < 0 || member >= memberCount) {
      throw new RangeError(`ensemble member ${member} is outside the store.`)
    }
    const start = Math.min(window[0], window[1])
    const end = Math.max(window[0], window[1])
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      throw new RangeError('ensemble.memberLod window must have finite bounds.')
    }
    if (!Number.isSafeInteger(width) || width < 1) {
      throw new RangeError('ensemble.memberLod width must be a positive safe integer.')
    }
    const key = `${version.get()}:${member}:${start}:${end}:${width}`
    let indices = lodCache.get(key)
    if (indices) {
      lodCache.delete(key)
    } else {
      const [first, after] = rowRange([start, end])
      const from = Math.max(0, first - 1)
      const to = Math.min(count, after + 1)
      const row = member * x.length
      const selected: number[] = []
      const select = (index: number) => {
        if (selected[selected.length - 1] !== index) selected.push(index)
      }
      let bucket = -1
      let bucketFirst = -1
      let minimum = -1
      let maximum = -1
      let minimumValue = 0
      let maximumValue = 0
      let last = -1
      let previousWasMissing = false
      // First and last bound the bucket; min/max are emitted in index order between them.
      const flush = () => {
        if (bucketFirst < 0) return
        select(bucketFirst)
        select(Math.min(minimum, maximum))
        select(Math.max(minimum, maximum))
        select(last)
        bucketFirst = -1
      }
      let physical = (head + from) % x.length
      for (let index = from; index < to; index += 1) {
        const value = values[row + physical]
        const xValue = x[physical]
        physical += 1
        if (physical === x.length) physical = 0
        if (!Number.isFinite(value)) {
          flush()
          if (!previousWasMissing) selected.push(index)
          previousWasMissing = true
          continue
        }
        const pixel =
          start === end
            ? Math.floor(width / 2)
            : Math.max(
                0,
                Math.min(width - 1, Math.floor(((xValue - start) / (end - start)) * width)),
              )
        if (bucketFirst < 0 || pixel !== bucket) {
          flush()
          bucketFirst = index
          minimum = index
          maximum = index
          minimumValue = value
          maximumValue = value
          bucket = pixel
        } else if (value < minimumValue) {
          minimum = index
          minimumValue = value
        } else if (value > maximumValue) {
          maximum = index
          maximumValue = value
        }
        last = index
        previousWasMissing = false
      }
      flush()
      indices = Uint32Array.from(selected)
      lodCacheByteLength += indices.byteLength
      while (
        (lodCacheByteLength > lodCacheLimitBytes || lodCache.size >= lodCacheLimitEntries) &&
        lodCache.size
      ) {
        const [oldestKey, oldest] = lodCache.entries().next().value!
        lodCache.delete(oldestKey)
        lodCacheByteLength -= oldest.byteLength
      }
    }
    lodCache.set(key, indices)
    const result = indices
    return {
      length: result.length,
      at(index: number) {
        if (!Number.isInteger(index) || index < 0 || index >= result.length) {
          throw new RangeError(`ensemble LOD index ${index} is outside the result.`)
        }
        return result[index]
      },
      *[Symbol.iterator]() {
        yield* result
      },
    }
  }

  function publish(
    from: number,
    to: number,
    details: Omit<EnsembleChange, 'version' | 'from' | 'to'>,
  ) {
    lodCache.clear()
    lodCacheByteLength = 0
    change = Object.freeze({ version: version.get() + 1, from, to, ...details })
    version.update((value) => value + 1)
  }

  function mutate(
    rows: EnsembleInput,
    mode: 'append' | 'prepend' | 'replace',
    bounds?: { from: number; to: number },
  ) {
    const columns = normalize(rows, precision, memberCount)
    const previousLength = count
    if (mode === 'append' && count && columns.length && columns.x[0] < xAt(count - 1)) {
      throw new RangeError('Appended x values must not precede the current last x.')
    }
    if (mode === 'prepend' && count && columns.length && columns.x[columns.length - 1] > xAt(0)) {
      throw new RangeError('Prepended x values must not follow the current first x.')
    }
    if (bounds) {
      if (typeof bounds.from !== 'number' || typeof bounds.to !== 'number') {
        throw new TypeError('ensemble.upsert bounds must be numbers.')
      }
      epoch(bounds.from, 'ensemble.upsert.from')
      epoch(bounds.to, 'ensemble.upsert.to')
      if (bounds.from > bounds.to) throw new RangeError('ensemble.upsert requires from <= to.')
      for (let step = 0; step < columns.length; step += 1) {
        if (columns.x[step] < bounds.from || columns.x[step] > bounds.to) {
          throw new RangeError(`ensemble.x[${step}] is outside the upsert range.`)
        }
      }
    }
    if (!columns.length && mode !== 'replace' && !bounds) return
    if (!count && !columns.length && !bounds) return
    // Retention can remove samples outside the mutation's own range.
    const from = Math.min(
      count ? xAt(0) : Infinity,
      columns.length ? columns.x[0] : Infinity,
      bounds?.from ?? Infinity,
    )
    const to = Math.max(
      count ? xAt(count - 1) : -Infinity,
      columns.length ? columns.x[columns.length - 1] : -Infinity,
      bounds?.to ?? -Infinity,
    )
    let evicted: EnsembleChange['evicted']
    let replaced = 0
    if (mode === 'append' && !bounds) {
      evicted = push(columns)
    } else {
      let before = 0
      let after = count
      if (bounds) {
        while (before < count && xAt(before) < bounds.from) before += 1
        after = before
        while (after < count && xAt(after) <= bounds.to) after += 1
        replaced = after - before
      } else if (mode === 'prepend') {
        after = 0
      } else {
        replaced = count
      }
      const length = before + columns.length + count - after
      const nextX = new Float64Array(length)
      const nextValues = new Float64Array(length * memberCount)
      for (let index = 0; index < length; index += 1) {
        const incoming = index >= before && index < before + columns.length
        const source = index < before ? index : index - before - columns.length + after
        nextX[index] = incoming ? columns.x[index - before] : xAt(source)
        for (let member = 0; member < memberCount; member += 1) {
          nextValues[member * length + index] = incoming
            ? columns.values[member * columns.length + index - before]
            : valueAt(member, source)
        }
      }
      head = 0
      count = 0
      reserve(Math.min(maxPoints, length))
      extentIndexDirty = true
      generation += 1
      evicted = push({ x: nextX, values: nextValues, length, memberCount })
    }
    const operation = bounds ? 'upsert' : mode
    const invalidatedFrom = operation === 'append' && evicted === undefined ? previousLength : 0
    publish(from, to, {
      operation,
      previousLength,
      length: count,
      inputLength: columns.length,
      invalidatedFrom,
      invalidatedTo: count,
      replaced,
      evicted,
    })
  }

  push(initial)
  const store: EnsembleStore = Object.freeze({
    quantileMethod,
    get length() {
      return count
    },
    get capacity() {
      return x.length
    },
    memberCount,
    members,
    get version() {
      return version.get()
    },
    get change() {
      version.get()
      return change
    },
    memberIndex: (id: string) => memberIds.get(id) ?? -1,
    extent,
    xAt,
    valueAt,
    memberLod,
    quantile,
    quantiles: (probabilities: readonly number[]) => {
      if (!Array.isArray(probabilities)) {
        throw new TypeError('ensemble.quantiles requires an array of probabilities.')
      }
      return Object.freeze(probabilities.map(quantile))
    },
    mean: () => statistic('mean'),
    exceedance(threshold: number) {
      if (typeof threshold !== 'number' || !Number.isFinite(threshold)) {
        throw new RangeError('ensemble.exceedance threshold must be finite.')
      }
      return statistic('exceedance', threshold === 0 ? 0 : threshold)
    },
    append: (rows: EnsembleInput) => mutate(rows, 'append'),
    prepend: (rows: EnsembleInput) => mutate(rows, 'prepend'),
    replace: (rows: EnsembleInput) => mutate(rows, 'replace'),
    upsert: ({ from, to, rows }: { from: number; to: number; rows: EnsembleInput }) =>
      mutate(rows, 'replace', { from, to }),
    clear() {
      if (!count) return
      const from = xAt(0)
      const to = xAt(count - 1)
      const previousLength = count
      head = 0
      count = 0
      extentBlocks = []
      extentIndexDirty = true
      generation += 1
      publish(from, to, {
        operation: 'clear',
        previousLength,
        length: 0,
        inputLength: 0,
        invalidatedFrom: 0,
        invalidatedTo: 0,
        replaced: previousLength,
        evicted: undefined,
      })
    },
  })
  stores.add(store)
  diagnostics.set(store, () => ({
    canonicalBytes: x.byteLength + values.byteLength,
    summaryBlocks: extentBlocks.length,
    summaryRows,
    derivedColumns: derived.size,
    derivedBytes: [...derived.values()].reduce((sum, column) => sum + column.data.byteLength, 0),
    sortedSteps,
  }))
  return store
}

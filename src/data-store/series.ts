import { reactive } from '../core/runtime.js'
import { validateKeys } from '../core/validation.js'

export interface SeriesInput {
  x: ArrayLike<number | Date>
  y: ArrayLike<number>
}

export interface SeriesStoreOptions {
  capacity?: number
  maxPoints?: number
  maxAge?: number
  precision?: 'float64' | 'float32'
}

export interface SeriesChange {
  readonly version: number
  /** Inclusive data-domain range affected by the mutation. */
  readonly from: number
  readonly to: number
  /** The mutation that produced this snapshot. */
  readonly operation: 'append' | 'prepend' | 'upsert' | 'replace' | 'clear'
  readonly previousLength: number
  readonly length: number
  /** Number of rows supplied by the caller, before retention. */
  readonly inputLength: number
  /** Half-open logical index range invalidated in the resulting store. */
  readonly invalidatedFrom: number
  readonly invalidatedTo: number
  /** Previous rows explicitly replaced or cleared, excluding retention. */
  readonly replaced: number
  /** Rows excluded by capacity or age retention, with their inclusive x extent. */
  readonly evicted: Readonly<{ count: number; from: number; to: number }> | undefined
}

export interface SeriesStore<Rows = SeriesInput> {
  readonly length: number
  readonly capacity: number
  readonly version: number
  readonly change: SeriesChange | undefined
  extent(
    axis: 'x' | 'y',
    window?: readonly [number, number],
    windowAxis?: 'x' | 'y',
  ): readonly [number, number] | undefined
  xAt(index: number): number
  yAt(index: number): number
  append(rows: Rows): void
  prepend(rows: Rows): void
  upsert(input: { from: number; to: number; rows: Rows }): void
  replace(rows: Rows): void
  clear(): void
}

const stores = new WeakSet<object>()
export const isSeriesStore = (value: object): value is SeriesStore<unknown> => stores.has(value)

function epoch(value: unknown, path: string): number {
  const numeric = value instanceof Date ? value.getTime() : value
  if (typeof numeric !== 'number' || !Number.isFinite(numeric) || Math.abs(numeric) > 8.64e15) {
    throw new RangeError(`${path} must be a finite value within the JavaScript Date range.`)
  }
  return numeric
}

function validateColumns(input: SeriesInput, precision: 'float64' | 'float32') {
  for (const key of ['x', 'y'] as const) {
    if (!input?.[key] || !Number.isSafeInteger(input[key].length) || input[key].length < 0) {
      throw new TypeError(`series.${key} must be an array-like column.`)
    }
  }
  if (input.x.length !== input.y.length) throw new RangeError('series column lengths differ.')
  let previous = -Infinity
  for (let index = 0; index < input.x.length; index += 1) {
    const x = epoch(input.x[index], `series.x[${index}]`)
    const y = input.y[index]
    if (x < previous) throw new RangeError(`series.x[${index}] is out of order.`)
    if (
      typeof y !== 'number' ||
      (!Number.isFinite(y) && !Number.isNaN(y)) ||
      (precision === 'float32' && Number.isFinite(y) && !Number.isFinite(Math.fround(y)))
    ) {
      throw new RangeError(`series.y[${index}] must be finite at the requested precision or NaN.`)
    }
    previous = x
  }
}

function createStore<Rows>(
  initial: Rows,
  convert: (rows: Rows) => SeriesInput,
  options: SeriesStoreOptions,
): SeriesStore<Rows> {
  validateKeys(options, ['capacity', 'maxPoints', 'maxAge', 'precision'], 'series')
  for (const key of ['capacity', 'maxPoints'] as const) {
    const value = options[key]
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 1)) {
      throw new RangeError(`series.${key} must be a positive safe integer.`)
    }
  }
  if (options.maxAge !== undefined && (!Number.isFinite(options.maxAge) || options.maxAge < 0)) {
    throw new RangeError('series.maxAge must be a nonnegative finite number.')
  }
  const precision = options.precision === undefined ? 'float64' : options.precision
  if (precision !== 'float32' && precision !== 'float64') {
    throw new Error('series.precision must be float32 or float64.')
  }
  const maxPoints = options.maxPoints ?? Infinity
  const maxAge = options.maxAge
  const input = convert(initial)
  validateColumns(input, precision)
  let x = new Float64Array(
    Math.max(1, Math.min(maxPoints, Math.max(options.capacity ?? 1, input.x.length))),
  )
  let y = precision === 'float32' ? new Float32Array(x.length) : new Float64Array(x.length)
  let head = 0
  let count = 0
  const version = reactive.signal(0)
  let change: SeriesChange | undefined
  const extentBlockSize = 128
  let extentBlocks: Array<
    Readonly<{ xMin: number; xMax: number; yMin: number; yMax: number }> | undefined
  > = []
  let extentIndexDirty = true

  function slot(index: number) {
    if (!Number.isInteger(index) || index < 0 || index >= count) {
      throw new RangeError(`series index ${index} is outside the store.`)
    }
    return (head + index) % x.length
  }
  const xAt = (index: number) => x[slot(index)]
  const yAt = (index: number) => y[slot(index)]

  function reserve(required: number) {
    if (required <= x.length) return
    const capacity = Math.min(maxPoints, Math.max(required, x.length * 2))
    const nextX = new Float64Array(capacity)
    const nextY = precision === 'float32' ? new Float32Array(capacity) : new Float64Array(capacity)
    for (let index = 0; index < count; index += 1) {
      nextX[index] = xAt(index)
      nextY[index] = yAt(index)
    }
    x = nextX
    y = nextY
    head = 0
    extentIndexDirty = true
  }

  function push(columns: SeriesInput) {
    let evictedCount = 0
    let evictedFrom = Infinity
    let evictedTo = -Infinity
    const touchedBlocks = new Set<number>()
    const evict = (value: number) => {
      evictedCount += 1
      evictedFrom = Math.min(evictedFrom, value)
      evictedTo = Math.max(evictedTo, value)
    }
    const start = Math.max(0, columns.x.length - maxPoints)
    for (let index = 0; index < start; index += 1) evict(Number(columns.x[index]))
    reserve(Math.min(maxPoints, count + columns.x.length - start))
    for (let index = start; index < columns.x.length; index += 1) {
      if (count === x.length) {
        evict(xAt(0))
        touchedBlocks.add(Math.floor(head / extentBlockSize))
        head = (head + 1) % x.length
        count -= 1
      }
      const physical = (head + count) % x.length
      x[physical] = Number(columns.x[index])
      y[physical] = columns.y[index]
      count += 1
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
    if (extentIndexDirty) {
      extentBlocks = Array.from({ length: Math.ceil(x.length / extentBlockSize) }, (_, index) =>
        refreshExtentBlock(index),
      )
      extentIndexDirty = false
    } else {
      for (const block of touchedBlocks) extentBlocks[block] = refreshExtentBlock(block)
    }
    return evictedCount
      ? Object.freeze({ count: evictedCount, from: evictedFrom, to: evictedTo })
      : undefined
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
      const value = y[physical]
      if (!Number.isFinite(value)) continue
      xMin = Math.min(xMin, x[physical])
      xMax = Math.max(xMax, x[physical])
      yMin = Math.min(yMin, value)
      yMax = Math.max(yMax, value)
    }
    return xMin <= xMax ? Object.freeze({ xMin, xMax, yMin, yMax }) : undefined
  }

  function extent(
    axis: 'x' | 'y',
    window?: readonly [number, number],
    windowAxis: 'x' | 'y' = 'x',
  ): readonly [number, number] | undefined {
    if (extentIndexDirty) {
      extentBlocks = Array.from({ length: Math.ceil(x.length / extentBlockSize) }, (_, index) =>
        refreshExtentBlock(index),
      )
      extentIndexDirty = false
    }
    let first = 0
    let end = count
    if (window && windowAxis === 'x') {
      const low = Math.min(window[0], window[1])
      const high = Math.max(window[0], window[1])
      let left = 0
      let right = count
      while (left < right) {
        const middle = Math.floor((left + right) / 2)
        if (xAt(middle) < low) left = middle + 1
        else right = middle
      }
      first = left
      left = first
      right = count
      while (left < right) {
        const middle = Math.floor((left + right) / 2)
        if (xAt(middle) <= high) left = middle + 1
        else right = middle
      }
      end = left
    }
    let low = Infinity
    let high = -Infinity
    const filterLow = window ? Math.min(window[0], window[1]) : -Infinity
    const filterHigh = window ? Math.max(window[0], window[1]) : Infinity
    const addBlock = (physicalBlock: number) => {
      const block = extentBlocks[physicalBlock]
      if (!block) return
      if (window) {
        const filterMin = windowAxis === 'x' ? block.xMin : block.yMin
        const filterMax = windowAxis === 'x' ? block.xMax : block.yMax
        if (filterMax < filterLow || filterMin > filterHigh) return
        if (filterMin < filterLow || filterMax > filterHigh) {
          const blockStart = physicalBlock * extentBlockSize
          const blockEnd = Math.min(x.length, blockStart + extentBlockSize)
          for (let physical = blockStart; physical < blockEnd; physical += 1) {
            const logical = (physical - head + x.length) % x.length
            if (logical < first || logical >= end || !Number.isFinite(y[physical])) continue
            const filterValue = windowAxis === 'x' ? x[physical] : y[physical]
            if (filterValue < filterLow || filterValue > filterHigh) continue
            const value = axis === 'x' ? x[physical] : y[physical]
            low = Math.min(low, value)
            high = Math.max(high, value)
          }
          return
        }
      }
      low = Math.min(low, axis === 'x' ? block.xMin : block.yMin)
      high = Math.max(high, axis === 'x' ? block.xMax : block.yMax)
    }
    const addValue = (logical: number) => {
      const physical = slot(logical)
      if (!Number.isFinite(y[physical])) return
      const filterValue = window ? (windowAxis === 'x' ? x[physical] : y[physical]) : undefined
      if (filterValue !== undefined && (filterValue < filterLow || filterValue > filterHigh)) return
      const value = axis === 'x' ? x[physical] : y[physical]
      low = Math.min(low, value)
      high = Math.max(high, value)
    }
    while (first < end) {
      const physical = slot(first)
      const available = Math.min(end - first, x.length - physical)
      let offset = 0
      while (offset < available && (physical + offset) % extentBlockSize !== 0) {
        addValue(first + offset)
        offset += 1
      }
      while (offset + extentBlockSize <= available) {
        addBlock(Math.floor((physical + offset) / extentBlockSize))
        offset += extentBlockSize
      }
      while (offset < available) {
        addValue(first + offset)
        offset += 1
      }
      first += available
    }
    return low <= high ? Object.freeze([low, high]) : undefined
  }

  function publish(
    from: number,
    to: number,
    details: Omit<SeriesChange, 'version' | 'from' | 'to'>,
  ) {
    change = Object.freeze({ version: version.get() + 1, from, to, ...details })
    version.update((value) => value + 1)
  }

  function mutate(
    rows: Rows,
    mode: 'append' | 'prepend' | 'replace',
    bounds?: { from: number; to: number },
  ) {
    const columns = convert(rows)
    validateColumns(columns, precision)
    const previousLength = count
    if (mode === 'append' && count && columns.x.length && Number(columns.x[0]) < xAt(count - 1)) {
      throw new RangeError('Appended x values must not precede the current last x.')
    }
    if (
      mode === 'prepend' &&
      count &&
      columns.x.length &&
      Number(columns.x[columns.x.length - 1]) > xAt(0)
    ) {
      throw new RangeError('Prepended x values must not follow the current first x.')
    }
    if (bounds) {
      if (typeof bounds.from !== 'number' || typeof bounds.to !== 'number') {
        throw new TypeError('series.upsert bounds must be numbers.')
      }
      epoch(bounds.from, 'series.upsert.from')
      epoch(bounds.to, 'series.upsert.to')
      if (bounds.from > bounds.to) throw new RangeError('series.upsert requires from <= to.')
      for (let index = 0; index < columns.x.length; index += 1) {
        if (Number(columns.x[index]) < bounds.from || Number(columns.x[index]) > bounds.to) {
          throw new RangeError(`series.x[${index}] is outside the upsert range.`)
        }
      }
    }
    if (!columns.x.length && mode !== 'replace' && !bounds) return
    if (!count && !columns.x.length && !bounds) return
    // Retention can remove samples outside the mutation's own range.
    const from = Math.min(
      count ? xAt(0) : Infinity,
      columns.x.length ? Number(columns.x[0]) : Infinity,
      bounds?.from ?? Infinity,
    )
    const to = Math.max(
      count ? xAt(count - 1) : -Infinity,
      columns.x.length ? Number(columns.x[columns.x.length - 1]) : -Infinity,
      bounds?.to ?? -Infinity,
    )
    let evicted: SeriesChange['evicted']
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
      const length = before + columns.x.length + count - after
      const nextX = new Float64Array(length)
      const nextY = precision === 'float32' ? new Float32Array(length) : new Float64Array(length)
      for (let index = 0; index < length; index += 1) {
        if (index < before) {
          nextX[index] = xAt(index)
          nextY[index] = yAt(index)
        } else if (index < before + columns.x.length) {
          nextX[index] = Number(columns.x[index - before])
          nextY[index] = columns.y[index - before]
        } else {
          const source = index - before - columns.x.length + after
          nextX[index] = xAt(source)
          nextY[index] = yAt(source)
        }
      }
      reserve(Math.min(maxPoints, length))
      head = 0
      count = 0
      extentIndexDirty = true
      evicted = push({ x: nextX, y: nextY })
    }
    const operation = bounds ? 'upsert' : mode
    const invalidatedFrom = operation === 'append' && evicted === undefined ? previousLength : 0
    publish(from, to, {
      operation,
      previousLength,
      length: count,
      inputLength: columns.x.length,
      invalidatedFrom,
      invalidatedTo: count,
      replaced,
      evicted,
    })
  }

  push(input)
  const store: SeriesStore<Rows> = Object.freeze({
    get length() {
      return count
    },
    get capacity() {
      return x.length
    },
    get version() {
      return version.get()
    },
    get change() {
      version.get()
      return change
    },
    extent,
    xAt,
    yAt,
    append: (rows: Rows) => mutate(rows, 'append'),
    prepend: (rows: Rows) => mutate(rows, 'prepend'),
    replace: (rows: Rows) => mutate(rows, 'replace'),
    upsert: ({ from, to, rows }: { from: number; to: number; rows: Rows }) =>
      mutate(rows, 'replace', { from, to }),
    clear() {
      if (!count) return
      const from = xAt(0)
      const to = xAt(count - 1)
      const previousLength = count
      head = 0
      count = 0
      extentIndexDirty = true
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
  return store
}

export function createSeries(input: SeriesInput, options: SeriesStoreOptions = {}): SeriesStore {
  return createStore(input, (rows) => rows, options)
}

export function fromObjects<T>(
  rows: readonly T[],
  mapping: { x: keyof T; y: keyof T },
  options: SeriesStoreOptions = {},
): SeriesStore<readonly T[]> {
  validateKeys(mapping, ['x', 'y'], 'fromObjects')
  const xKey = mapping.x
  const yKey = mapping.y
  return createStore(
    rows,
    (values) => {
      if (!Array.isArray(values)) throw new TypeError('fromObjects rows must be an array.')
      const x = new Float64Array(values.length)
      const y = new Float64Array(values.length)
      for (let index = 0; index < values.length; index += 1) {
        const row = values[index]
        const value = row?.[yKey]
        x[index] = epoch(row?.[xKey], `fromObjects.x[${index}]`)
        if (typeof value !== 'number')
          throw new TypeError(`fromObjects.y[${index}] must be a number.`)
        y[index] = value
      }
      return { x, y }
    },
    options,
  )
}

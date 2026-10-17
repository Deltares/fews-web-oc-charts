export interface ColumnarSeriesInput {
  x: ArrayLike<number>
  y: ArrayLike<number>
}

export interface ColumnarSeriesOptions {
  capacity?: number
  maxPoints?: number
}

export interface SeriesWindow {
  readonly start: number
  readonly end: number
  readonly width: number
  readonly reverse?: boolean
}

export interface LodIndices extends Iterable<number> {
  readonly length: number
  at(index: number): number
}

function validateColumns(x: ArrayLike<number>, y: ArrayLike<number>) {
  if (x.length !== y.length) {
    throw new RangeError(`Column lengths differ: x has ${x.length}, y has ${y.length}.`)
  }

  let previousX = -Infinity
  for (let index = 0; index < x.length; index += 1) {
    const xValue = x[index]
    const yValue = y[index]
    if (!Number.isFinite(xValue) || Math.abs(xValue) > 8.64e15) {
      throw new RangeError(`Invalid x value at index ${index}: expected a finite epoch value.`)
    }
    if (xValue < previousX) {
      throw new RangeError(`x values must be sorted; index ${index} is out of order.`)
    }
    if (!Number.isFinite(yValue) && !Number.isNaN(yValue)) {
      throw new RangeError(`Invalid y value at index ${index}: expected a finite value or NaN.`)
    }
    previousX = xValue
  }
}

function lowerBound(series: ColumnarSeries, value: number): number {
  let low = 0
  let high = series.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (series.xAt(middle) < value) low = middle + 1
    else high = middle
  }
  return low
}

function upperBound(series: ColumnarSeries, value: number): number {
  let low = 0
  let high = series.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (series.xAt(middle) <= value) low = middle + 1
    else high = middle
  }
  return low
}

class CachedLod implements LodIndices {
  constructor(private readonly indices: Uint32Array) {}

  get length() {
    return this.indices.length
  }

  at(index: number) {
    if (!Number.isInteger(index) || index < 0 || index >= this.indices.length) {
      throw new RangeError(`LOD index ${index} is outside the result.`)
    }
    return this.indices[index]
  }

  *[Symbol.iterator](): Iterator<number> {
    yield* this.indices
  }
}

export class ColumnarSeries {
  private xColumn: Float64Array
  private yColumn: Float64Array
  private head = 0
  private count: number
  private currentVersion = 0
  private readonly maxPoints: number
  private readonly lodLimitBytes = 4 * 1024 * 1024
  private readonly lodCache = new Map<string, CachedLod>()
  private lodBytes = 0

  private constructor(input: ColumnarSeriesInput, options: ColumnarSeriesOptions) {
    validateColumns(input.x, input.y)
    this.maxPoints = options.maxPoints ?? Infinity
    if (!Number.isInteger(this.maxPoints) && this.maxPoints !== Infinity) {
      throw new RangeError('maxPoints must be a positive integer.')
    }
    if (this.maxPoints < 1) throw new RangeError('maxPoints must be at least 1.')
    const initialCapacity =
      options.capacity ?? Math.max(1, Math.min(input.x.length, this.maxPoints))
    if (!Number.isInteger(initialCapacity) || initialCapacity < 1) {
      throw new RangeError('capacity must be a positive integer.')
    }

    this.count = Math.min(input.x.length, initialCapacity, this.maxPoints)
    const capacity = Math.max(1, Math.min(initialCapacity, this.maxPoints), this.count)
    this.xColumn = new Float64Array(capacity)
    this.yColumn = new Float64Array(capacity)
    const firstInput = input.x.length - this.count
    for (let index = 0; index < this.count; index += 1) {
      this.xColumn[index] = input.x[firstInput + index]
      this.yColumn[index] = input.y[firstInput + index]
    }
  }

  static create(input: ColumnarSeriesInput, options: ColumnarSeriesOptions = {}) {
    return new ColumnarSeries(input, options)
  }

  get length() {
    return this.count
  }

  get capacity() {
    return this.xColumn.length
  }

  get version() {
    return this.currentVersion
  }

  get canonicalByteLength() {
    return this.xColumn.byteLength + this.yColumn.byteLength
  }

  get lodCacheEntries() {
    return this.lodCache.size
  }

  get lodCacheByteLength() {
    return this.lodBytes
  }

  xAt(logicalIndex: number) {
    return this.xColumn[this.physicalIndex(logicalIndex)]
  }

  yAt(logicalIndex: number) {
    return this.yColumn[this.physicalIndex(logicalIndex)]
  }

  append(input: ColumnarSeriesInput) {
    validateColumns(input.x, input.y)
    if (input.x.length === 0) return
    if (this.count > 0 && input.x[0] < this.xAt(this.count - 1)) {
      throw new RangeError('Appended x values must not precede the current last x value.')
    }

    const retainedIncoming = Math.min(input.x.length, this.maxPoints)
    const required = Math.min(this.maxPoints, this.count + retainedIncoming)
    this.ensureCapacity(required)

    const firstInput = input.x.length - retainedIncoming
    for (let index = firstInput; index < input.x.length; index += 1) {
      const physical = (this.head + this.count) % this.capacity
      this.xColumn[physical] = input.x[index]
      this.yColumn[physical] = input.y[index]
      this.count += 1
      if (this.count > this.capacity || this.count > this.maxPoints) {
        this.head = (this.head + 1) % this.capacity
        this.count -= 1
      }
    }
    this.changed()
  }

  decimate(window: SeriesWindow): LodIndices {
    if (
      !Number.isFinite(window.start) ||
      !Number.isFinite(window.end) ||
      window.end < window.start
    ) {
      throw new RangeError('LOD window must have finite, ordered bounds.')
    }
    if (!Number.isInteger(window.width) || window.width < 1) {
      throw new RangeError('LOD width must be a positive integer.')
    }
    const key = `${this.currentVersion}:${window.start}:${window.end}:${window.width}:${window.reverse === true}`
    const cached = this.lodCache.get(key)
    if (cached) {
      this.lodCache.delete(key)
      this.lodCache.set(key, cached)
      return cached
    }

    const from = Math.max(0, lowerBound(this, window.start) - 1)
    const to = Math.min(this.count, upperBound(this, window.end) + 1)
    const indices: number[] = []
    let bucket = -1
    let first = -1
    let minimum = -1
    let maximum = -1
    let last = -1
    let inRun = false
    let previousWasMissing = false

    const flushRun = () => {
      if (first < 0) return
      const selected = [first, minimum, maximum, last].sort((left, right) => left - right)
      for (const index of selected) {
        if (indices[indices.length - 1] !== index) indices.push(index)
      }
      first = -1
      minimum = -1
      maximum = -1
      last = -1
      inRun = false
    }

    for (let index = from; index < to; index += 1) {
      const yValue = this.yAt(index)
      if (!Number.isFinite(yValue)) {
        flushRun()
        if (!previousWasMissing && indices[indices.length - 1] !== index) indices.push(index)
        previousWasMissing = true
        continue
      }

      const xValue = this.xAt(index)
      const pixel =
        window.start === window.end
          ? Math.floor(window.width / 2)
          : Math.max(
              0,
              Math.min(
                window.width - 1,
                Math.floor(
                  (window.reverse
                    ? (window.end - xValue) / (window.end - window.start)
                    : (xValue - window.start) / (window.end - window.start)) * window.width,
                ),
              ),
            )
      if (!inRun || pixel !== bucket) {
        flushRun()
        bucket = pixel
        first = index
        minimum = index
        maximum = index
        inRun = true
      } else {
        if (yValue < this.yAt(minimum)) minimum = index
        if (yValue > this.yAt(maximum)) maximum = index
      }
      last = index
      previousWasMissing = false
    }
    flushRun()

    const result = new CachedLod(Uint32Array.from(indices))
    const byteLength = result.length * Uint32Array.BYTES_PER_ELEMENT
    this.lodCache.set(key, result)
    this.lodBytes += byteLength
    while (this.lodBytes > this.lodLimitBytes || this.lodCache.size > 32) {
      const oldestKey = this.lodCache.keys().next().value
      if (oldestKey === undefined) break
      const oldest = this.lodCache.get(oldestKey)
      if (oldest) this.lodBytes -= oldest.length * Uint32Array.BYTES_PER_ELEMENT
      this.lodCache.delete(oldestKey)
    }
    return result
  }

  private physicalIndex(logicalIndex: number) {
    if (!Number.isInteger(logicalIndex) || logicalIndex < 0 || logicalIndex >= this.count) {
      throw new RangeError(`Series index ${logicalIndex} is outside the current window.`)
    }
    return (this.head + logicalIndex) % this.capacity
  }

  private ensureCapacity(required: number) {
    if (required <= this.capacity) return
    const doubled = Math.max(required, this.capacity * 2)
    const nextCapacity = Math.min(doubled, this.maxPoints)
    const xColumn = new Float64Array(nextCapacity)
    const yColumn = new Float64Array(nextCapacity)
    for (let index = 0; index < this.count; index += 1) {
      xColumn[index] = this.xAt(index)
      yColumn[index] = this.yAt(index)
    }
    this.xColumn = xColumn
    this.yColumn = yColumn
    this.head = 0
  }

  private changed() {
    this.currentVersion += 1
    this.lodCache.clear()
    this.lodBytes = 0
  }
}

export function createColumnarSeries(
  input: ColumnarSeriesInput,
  options: ColumnarSeriesOptions = {},
) {
  return ColumnarSeries.create(input, options)
}

import { describe, expect, test } from 'vitest'
import { createSeries, fromObjects, type SeriesStore } from '../../src/index.js'
import { seriesStorageDiagnostics } from '../../src/data-store/series.js'

function columns(store: SeriesStore<unknown>) {
  return {
    x: Array.from({ length: store.length }, (_, index) => store.xAt(index)),
    y: Array.from({ length: store.length }, (_, index) => store.yAt(index)),
  }
}

function referenceLod(
  store: SeriesStore<unknown>,
  window: readonly [number, number],
  width: number,
) {
  const low = Math.min(...window)
  const high = Math.max(...window)
  const rows = Array.from({ length: store.length }, (_, index) => index)
  const first = rows.findIndex((index) => store.xAt(index) >= low)
  const after = rows.findIndex((index) => store.xAt(index) > high)
  const from = Math.max(0, (first < 0 ? rows.length : first) - 1)
  const to = Math.min(rows.length, (after < 0 ? rows.length : after) + 1)
  const selected: number[] = []
  let group: number[] = []
  let bucket = -1
  let missing = false
  const flush = () => {
    if (!group.length) return
    const minimum = group.reduce((a, b) => (store.yAt(b) < store.yAt(a) ? b : a))
    const maximum = group.reduce((a, b) => (store.yAt(b) > store.yAt(a) ? b : a))
    selected.push(...new Set([group[0], minimum, maximum, group.at(-1)!].sort((a, b) => a - b)))
    group = []
  }
  for (const index of rows.slice(from, to)) {
    if (Number.isNaN(store.yAt(index))) {
      flush()
      if (!missing) selected.push(index)
      missing = true
      continue
    }
    const pixel =
      low === high
        ? Math.floor(width / 2)
        : Math.max(
            0,
            Math.min(width - 1, Math.floor(((store.xAt(index) - low) / (high - low)) * width)),
          )
    if (pixel !== bucket) flush()
    group.push(index)
    bucket = pixel
    missing = false
  }
  flush()
  return selected
}

describe('columnar series stores', () => {
  test('copies inputs, validates dates and preserves missing samples and duplicate order', () => {
    const x = new Float64Array([1, 1, 2])
    const y = new Float64Array([10, 11, NaN])
    const store = createSeries({ x, y }, { capacity: 1 })
    x[0] = 999
    y[0] = 999
    expect(columns(store)).toEqual({ x: [1, 1, 2], y: [10, 11, NaN] })
    expect(store.length).toBe(3)
    expect(store.version).toBe(0)
    expect(() => store.xAt(-1)).toThrow(/outside/)
    expect(() => store.yAt(store.length)).toThrow(/outside/)
    expect(createSeries({ x: [new Date(1)], y: [1] }).xAt(0)).toBe(1)
    expect(() => createSeries({ x: [new Date(NaN)], y: [1] })).toThrow(/x\[0\]/)
  })

  test.each([
    { x: [1], y: [] },
    { x: [2, 1], y: [1, 2] },
    { x: [NaN], y: [1] },
    { x: [Infinity], y: [1] },
    { x: [8.64e15 + 1], y: [1] },
    { x: [1], y: [Infinity] },
  ])('rejects invalid columns atomically: %j', (input) => {
    const store = createSeries({ x: [1, 2], y: [10, 20] })
    for (const method of ['append', 'prepend', 'replace'] as const) {
      expect(() => store[method](input)).toThrow()
      expect(columns(store)).toEqual({ x: [1, 2], y: [10, 20] })
      expect(store.version).toBe(0)
      expect(store.change).toBeUndefined()
    }
  })

  test('append/prepend preserve equal-boundary order and reject out-of-order boundaries', () => {
    const store = createSeries({ x: [2, 2], y: [20, 21] })
    store.append({ x: [2, 3], y: [22, 30] })
    store.prepend({ x: [1, 2], y: [10, 19] })
    expect(columns(store)).toEqual({ x: [1, 2, 2, 2, 2, 3], y: [10, 19, 20, 21, 22, 30] })
    expect(() => store.append({ x: [2], y: [1] })).toThrow(/last x/)
    expect(() => store.prepend({ x: [2], y: [1] })).toThrow(/first x/)
    expect(store.version).toBe(2)
    expect(store.change).toMatchObject({
      operation: 'prepend',
      previousLength: 4,
      length: 6,
      inputLength: 2,
      invalidatedFrom: 0,
      invalidatedTo: 6,
      replaced: 0,
      evicted: undefined,
    })
  })

  test('upsert replaces closed ranges, including every duplicate, and rolls back invalid rows', () => {
    const store = createSeries({ x: [1, 2, 2, 3, 3, 4], y: [1, 2, 3, 4, 5, 6] })
    store.upsert({ from: 2, to: 3, rows: { x: [2, 2, 3], y: [20, 21, 30] } })
    expect(columns(store)).toEqual({ x: [1, 2, 2, 3, 4], y: [1, 20, 21, 30, 6] })
    const before = columns(store)
    const change = store.change
    for (const input of [
      { from: 2, to: 3, rows: { x: [4], y: [1] } },
      { from: 3, to: 2, rows: { x: [], y: [] } },
      { from: NaN, to: 3, rows: { x: [], y: [] } },
    ]) {
      expect(() => store.upsert(input)).toThrow()
      expect(columns(store)).toEqual(before)
      expect(store.change).toBe(change)
    }
    store.upsert({ from: 2, to: 3, rows: { x: [], y: [] } })
    expect(columns(store)).toEqual({ x: [1, 4], y: [1, 6] })
    expect(store.change).toMatchObject({
      version: 2,
      from: 1,
      to: 4,
      operation: 'upsert',
      previousLength: 5,
      length: 2,
      inputLength: 0,
      invalidatedFrom: 0,
      invalidatedTo: 2,
      replaced: 3,
      evicted: undefined,
    })
  })

  test('retains newest points across wrapped appends, prepends, replacements and upserts', () => {
    const store = createSeries({ x: [0, 1, 2], y: [0, 1, 2] }, { capacity: 2, maxPoints: 3 })
    for (let index = 3; index < 10; index += 1) store.append({ x: [index], y: [index] })
    expect(columns(store).x).toEqual([7, 8, 9])
    expect(store.change).toMatchObject({
      operation: 'append',
      previousLength: 3,
      length: 3,
      inputLength: 1,
      invalidatedFrom: 0,
      invalidatedTo: 3,
      replaced: 0,
      evicted: { count: 1, from: 6, to: 6 },
    })
    expect(store.capacity).toBe(3)
    store.prepend({ x: [6], y: [6] })
    expect(columns(store).x).toEqual([7, 8, 9])
    store.upsert({ from: 8, to: 9, rows: { x: [8, 8, 9], y: [80, 81, 90] } })
    expect(columns(store)).toEqual({ x: [8, 8, 9], y: [80, 81, 90] })
    store.replace({ x: [1, 2, 3, 4], y: [1, 2, 3, 4] })
    expect(columns(store).x).toEqual([2, 3, 4])
    expect(store.change).toMatchObject({
      operation: 'replace',
      inputLength: 4,
      length: 3,
      evicted: { count: 1, from: 1, to: 1 },
    })
    store.clear()
    expect(store.length).toBe(0)
    expect(store.change).toMatchObject({
      operation: 'clear',
      previousLength: 3,
      length: 0,
      invalidatedFrom: 0,
      invalidatedTo: 0,
      replaced: 3,
    })
    const version = store.version
    store.clear()
    store.append({ x: [], y: [] })
    expect(store.version).toBe(version)
    store.append({ x: [0], y: [1] })
    expect(columns(store)).toEqual({ x: [0], y: [1] })
  })

  test('maxAge includes all duplicates at the exact cutoff and is applied after every mutation', () => {
    const store = createSeries({ x: [0, 1, 1, 2], y: [0, 10, 11, 2] }, { maxAge: 1 })
    expect(columns(store).x).toEqual([1, 1, 2])
    store.prepend({ x: [0], y: [0] })
    expect(columns(store).x).toEqual([1, 1, 2])
    store.append({ x: [3], y: [3] })
    expect(columns(store).x).toEqual([2, 3])
    store.replace({ x: [4, 4, 5], y: [1, 2, 3] })
    expect(columns(store).x).toEqual([4, 4, 5])
    const exact = createSeries({ x: [1, 2, 2], y: [1, 2, 3] }, { maxAge: 0 })
    expect(columns(exact).x).toEqual([2, 2])
  })

  test('keeps indexed extents correct across missing values, append retention, upsert, replace and clear', () => {
    const store = createSeries({ x: [0, 1, 2], y: [4, NaN, -2] }, { maxPoints: 3 })
    expect(store.extent('x')).toEqual([0, 2])
    expect(store.extent('y')).toEqual([-2, 4])

    store.append({ x: [3], y: [6] })
    expect(store.extent('x')).toEqual([2, 3])
    expect(store.extent('y')).toEqual([-2, 6])

    store.upsert({ from: 2, to: 3, rows: { x: [2, 3], y: [8, NaN] } })
    expect(store.extent('x')).toEqual([2, 2])
    expect(store.extent('y')).toEqual([8, 8])

    store.replace({ x: [5], y: [NaN] })
    expect(store.extent('x')).toBeUndefined()
    expect(store.extent('y')).toBeUndefined()
    store.clear()
    expect(store.extent('x')).toBeUndefined()
  })

  test('queries indexed y extents within ascending, reversed and wrapped x windows', () => {
    const x = Array.from({ length: 400 }, (_, index) => index)
    const y = x.map((value) => (value % 17 === 0 ? NaN : (value % 31) - 15))
    const store = createSeries({ x, y }, { maxPoints: 300 })
    store.append({
      x: Array.from({ length: 200 }, (_, index) => index + 400),
      y: Array.from({ length: 200 }, (_, index) => (index % 19 === 0 ? NaN : 100 - index)),
    })

    for (const window of [
      [350, 430],
      [430, 350],
      [590, 599],
      [0, 2],
    ] as const) {
      const low = Math.min(...window)
      const high = Math.max(...window)
      const values = Array.from({ length: store.length }, (_, index) => ({
        x: store.xAt(index),
        y: store.yAt(index),
      }))
        .filter(
          ({ x: value, y: result }) => value >= low && value <= high && Number.isFinite(result),
        )
        .map(({ y: value }) => value)
      const expected = values.length ? [Math.min(...values), Math.max(...values)] : undefined
      expect(store.extent('y', window)).toEqual(expected)
    }
  })

  test('queries indexed x extents within ascending and reversed y windows', () => {
    const x = Array.from({ length: 400 }, (_, index) => index)
    const y = x.map((value) => (value % 13 === 0 ? NaN : ((value * 17) % 101) - 50))
    const store = createSeries({ x, y }, { maxPoints: 300 })
    store.append({
      x: Array.from({ length: 200 }, (_, index) => index + 400),
      y: Array.from({ length: 200 }, (_, index) => (index % 11 === 0 ? NaN : 75 - index)),
    })

    for (const window of [
      [-10, 10],
      [10, -10],
      [75, 60],
      [-100, -90],
    ] as const) {
      const low = Math.min(...window)
      const high = Math.max(...window)
      const values = Array.from({ length: store.length }, (_, index) => ({
        x: store.xAt(index),
        y: store.yAt(index),
      }))
        .filter(
          ({ x: xValue, y: yValue }) => Number.isFinite(yValue) && yValue >= low && yValue <= high,
        )
        .map(({ x: value }) => value)
      const expected = values.length ? [Math.min(...values), Math.max(...values)] : undefined
      expect(store.extent('x', window, 'y')).toEqual(expected)
    }
  })

  test('bounds and reuses viewport LOD while preserving extrema and gaps', () => {
    const x = Array.from({ length: 100_000 }, (_, index) => index)
    const y = x.map((value) => {
      if (value === 50_000 || value === 50_001) return NaN
      if (value === 50_042) return 500
      if (value === 50_073) return -500
      return Math.sin(value / 100)
    })
    const store = createSeries({ x, y })
    const first = store.lod([49_900, 50_100], 10)
    const selected = Array.from(first)

    expect(selected).toContain(50_042)
    expect(selected).toContain(50_073)
    expect(selected.filter((index) => Number.isNaN(store.yAt(index)))).toEqual([50_000])
    expect(selected.length).toBeLessThanOrEqual(44)
    expect(store.lod([49_900, 50_100], 10)).toBe(first)
    expect(store.lodCacheEntries).toBe(1)
    expect(store.lodCacheByteLength).toBe(first.length * Uint32Array.BYTES_PER_ELEMENT)

    for (let index = 0; index < 40; index += 1) {
      store.lod([index, index + 1_000], 10 + index)
    }
    expect(store.lodCacheEntries).toBeLessThanOrEqual(16)
    expect(store.lodCacheByteLength).toBeLessThanOrEqual(2 * 1024 * 1024)

    store.append({ x: [100_000], y: [1] })
    expect(store.lodCacheEntries).toBe(0)
    expect(store.lodCacheByteLength).toBe(0)
  })

  test('float32 precision is opt-in and rejects overflow before mutation', () => {
    const store = createSeries({ x: [1], y: [1 / 3] }, { precision: 'float32' })
    expect(store.yAt(0)).toBe(Math.fround(1 / 3))
    expect(() => store.append({ x: [2], y: [Number.MAX_VALUE] })).toThrow(/precision/)
    expect(store.version).toBe(0)
    expect(createSeries({ x: [1], y: [1 / 3] }).yAt(0)).toBe(1 / 3)
  })

  test.each(['float64', 'float32'] as const)(
    'block LOD matches full M4 after every mutation with %s storage',
    (precision) => {
      const x = Array.from({ length: 1800 }, (_, index) => Math.floor(index / 2))
      const y = x.map((value, index) =>
        index % 131 < 3 || (index >= 256 && index < 512) ? NaN : (value % 19) - 9,
      )
      const store = createSeries(
        { x, y },
        { capacity: 2048, maxPoints: 2048, maxAge: 1100, precision },
      )
      const verify = () => {
        for (const window of [
          [-1, 2000],
          [850, 200],
          [256, 256],
          [-5, -2],
          [5000, 5001],
        ] as const) {
          for (const width of [1, 2, 17, 256]) {
            expect(Array.from(store.lod(window, width))).toEqual(referenceLod(store, window, width))
          }
        }
      }
      verify()
      store.append({ x: [900, 900, 901], y: [NaN, -100, 100] })
      verify()
      store.prepend({ x: [-1, 0], y: [1000, NaN] })
      verify()
      store.upsert({ from: 200, to: 300, rows: { x: [200, 200, 300], y: [1000, -1000, NaN] } })
      verify()
      store.upsert({ from: 400, to: 500, rows: { x: [], y: [] } })
      verify()
      store.append({
        x: Array.from({ length: 2500 }, (_, index) => index + 902),
        y: Array.from({ length: 2500 }, (_, index) => (index % 127 === 0 ? NaN : index % 7)),
      })
      verify()
      store.replace({ x: [1, 1, 2], y: [NaN, -1, 1] })
      verify()
      store.clear()
      verify()
      store.append({ x: [1, 2], y: [1, NaN] })
      verify()
    },
  )

  test('retained live appends refresh only touched summaries and reuse survivors without source rescans', () => {
    const length = 16_384
    const x = Float64Array.from({ length }, (_, index) => index)
    const y = x.map((value) => Math.sin(value / 13))
    const store = createSeries({ x, y }, { maxPoints: length })
    const snapshot = store.lod([0, length + 512], 8)
    const oldIndices = Array.from(snapshot)
    const canonicalBytes = seriesStorageDiagnostics(store).canonicalBytes
    for (let step = 0; step < 512; step += 1) {
      const before = seriesStorageDiagnostics(store)
      store.append({ x: [length + step], y: [Math.sin((length + step) / 13)] })
      const window = [step + 1, length + step] as const
      const current = store.lod(window, 8)
      const after = seriesStorageDiagnostics(store)
      expect(after.summaryRows - before.summaryRows).toBeLessThanOrEqual(256)
      expect(after.lodRows - before.lodRows).toBeLessThanOrEqual(8 * 128 + 256)
      expect(after.lodReusedRows - before.lodReusedRows).toBeGreaterThan(15_000)
      expect(after.canonicalBytes).toBe(canonicalBytes)
      expect(after.summaryBlocks).toBe(128)
      expect(store.lodCacheEntries).toBe(1)
      expect(store.lodCacheByteLength).toBeLessThanOrEqual(8 * 4 * 4)
      if (step % 64 === 0 || step === 511) {
        expect(Array.from(current)).toEqual(referenceLod(store, window, 8))
      }
    }
    expect(Array.from(snapshot)).toEqual(oldIndices)
  })

  test('growth rebuilds summaries and cache hits or rejected mutations do no LOD work', () => {
    const store = createSeries({ x: [], y: [] })
    for (const length of [1, 127, 129, 1025]) {
      const from = store.length
      const x = Array.from({ length }, (_, index) => from + index)
      store.append({ x, y: x.map((value) => (value % 31 === 0 ? NaN : value % 7)) })
      const window = [0, store.length] as const
      const selected = store.lod(window, 2)
      expect(Array.from(selected)).toEqual(referenceLod(store, window, 2))
      const before = seriesStorageDiagnostics(store)
      expect(store.lod([window[1], window[0]], 2)).toBe(selected)
      expect(() => store.append({ x: [-1], y: [0] })).toThrow(/last x/)
      expect(store.lod(window, 2)).toBe(selected)
      expect(seriesStorageDiagnostics(store)).toEqual(before)
    }
    store.clear()
    expect(seriesStorageDiagnostics(store).summaryBlocks).toBe(0)
    expect(Array.from(store.lod([0, 100], 2))).toEqual([])
  })

  test('copies retention options rather than retaining mutable caller state', () => {
    const options = { maxAge: 1 }
    const store = createSeries({ x: [0, 1], y: [0, 1] }, options)
    options.maxAge = 100
    store.append({ x: [2], y: [2] })
    expect(columns(store).x).toEqual([1, 2])
  })

  test('object adapters copy the mapping for future mutations', () => {
    const mapping: { x: 'time' | 'other'; y: 'value' | 'other' } = { x: 'time', y: 'value' }
    const store = fromObjects([{ time: 1, value: 10, other: 100 }], mapping)
    mapping.x = 'other'
    mapping.y = 'other'
    store.append([{ time: 2, value: 20, other: 200 }])
    expect(columns(store)).toEqual({ x: [1, 2], y: [10, 20] })
  })

  test('object adapters convert once, own no source rows, and accept the same row mapping for mutations', () => {
    const rows = [{ time: new Date(1), value: 10 }]
    const store = fromObjects(rows, { x: 'time', y: 'value' })
    rows[0].time.setTime(999)
    rows[0].value = 999
    store.append([{ time: new Date(2), value: NaN }])
    store.prepend([{ time: new Date(0), value: 0 }])
    store.upsert({ from: 1, to: 1, rows: [{ time: new Date(1), value: 11 }] })
    expect(columns(store)).toEqual({ x: [0, 1, 2], y: [0, 11, NaN] })
    expect(() => store.append([{ time: new Date(NaN), value: 1 }])).toThrow(/x\[0\]/)
    store.replace([{ time: new Date(3), value: 30 }])
    expect(columns(store)).toEqual({ x: [3], y: [30] })
  })
})

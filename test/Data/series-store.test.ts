import { describe, expect, test } from 'vitest'
import { createSeries, fromObjects, type SeriesStore } from '../../src/index.js'

function columns(store: SeriesStore<unknown>) {
  return {
    x: Array.from({ length: store.length }, (_, index) => store.xAt(index)),
    y: Array.from({ length: store.length }, (_, index) => store.yAt(index)),
  }
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

  test('float32 precision is opt-in and rejects overflow before mutation', () => {
    const store = createSeries({ x: [1], y: [1 / 3] }, { precision: 'float32' })
    expect(store.yAt(0)).toBe(Math.fround(1 / 3))
    expect(() => store.append({ x: [2], y: [Number.MAX_VALUE] })).toThrow(/precision/)
    expect(store.version).toBe(0)
    expect(createSeries({ x: [1], y: [1 / 3] }).yAt(0)).toBe(1 / 3)
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

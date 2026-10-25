import { describe, expect, test } from 'vitest'
import { bar, createTable, stackedArea } from '../../src/index.js'
import { tableStorageDiagnostics } from '../../src/data-store/table.js'

describe('aligned tables', () => {
  test('splice validation checks both interval boundaries and deletions atomically', () => {
    const data = createTable({ t: [0, 2, 4], start: [0, 2, 4], end: [1, 3, 5], a: [1, 2, 3] })
    const mark = bar(data, {
      x: 't',
      y: 'a',
      scales: { x: 't', y: 'q' },
      interval: { start: 'start', end: 'end' },
    })
    expect(mark.data).toBe(data)
    const snapshot = () => Array.from({ length: data.length }, (_, row) => data.sampleId(row))
    const ids = snapshot()
    for (const [start, end] of [
      [0.5, 3],
      [2, 4.5],
      [NaN, 3],
      [2, Infinity],
    ]) {
      expect(() =>
        data.upsert({
          from: 2,
          to: 2,
          rows: { t: [2], start: [start], end: [end], a: [5] },
        }),
      ).toThrow()
      expect(data.version).toBe(0)
      expect(snapshot()).toEqual(ids)
    }
    expect(() => data.prepend({ t: [-1], start: [-1], end: [0.5], a: [1] })).toThrow(
      /interval.*row 1/,
    )
    data.upsert({ from: 2, to: 2, rows: { t: [], start: [], end: [], a: [] } })
    data.upsert({ from: 2, to: 2, rows: { t: [2], start: [1], end: [4], a: [4] } })
    expect(data.version).toBe(2)
    expect(data.length).toBe(3)
  })

  test.each(['bar', 'area'])('validates every inserted %s row before retention', (kind) => {
    const data = createTable({ t: [10, 11], a: [1, 2], b: [3, 4] }, { maxPoints: 2 })
    const options = {
      x: 't',
      layers: [
        { id: 'a', y: 'a' },
        { id: 'b', y: 'b' },
      ],
      scales: { x: 't', y: 'q' },
    }
    const mark =
      kind === 'bar'
        ? bar(data, { ...options, layout: 'stacked', width: 10 })
        : stackedArea(data, options)
    expect(mark.data).toBe(data)
    expect(() => data.prepend({ t: [0], a: [Number.MAX_VALUE], b: [Number.MAX_VALUE] })).toThrow(
      /overflow.*row 0/,
    )
    expect(() =>
      data.upsert({
        from: 0,
        to: 0,
        rows: { t: [0], a: [Number.MAX_VALUE], b: [Number.MAX_VALUE] },
      }),
    ).toThrow(/overflow.*row 0/)
    expect(data.version).toBe(0)
    data.prepend({ t: [0], a: [1], b: [2] })
    expect(data.version).toBe(1)
    expect(data.sampleId(0)).toBe(0)
    expect(data.sampleId(1)).toBe(1)
  })

  test('owns numeric, date and dictionary-encoded categorical columns without exposing buffers', () => {
    const t = [new Date(0), new Date(1)]
    const q = new Float64Array([3, NaN])
    const names = ['a', 'b']
    const data = createTable({ t, q, names })
    t[0].setTime(42)
    q[0] = 99
    names[0] = 'changed'
    expect(data.valueAt('t', 0)).toBe(0)
    expect(data.valueAt('q', 0)).toBe(3)
    expect(data.valueAt('q', 1)).toBeNaN()
    expect(data.valueAt('names', 0)).toBe('a')
    expect(data.kind('names')).toBe('string')
    expect(() => data.valueAt('missing', 0)).toThrow('Unknown')
    expect(() => data.valueAt('q', 2)).toThrow('outside')
    expect(() => createTable({ t: [0, 1], q: [1] })).toThrow('length')
    expect(() => createTable({ t: [new Date(NaN)] })).toThrow('finite')
    expect(() => createTable({ t: [0], q: [Infinity] })).toThrow('finite')
    expect(() => createTable({ t: [1, 0] })).toThrow('ordered')
    expect(() => createTable({ category: ['a'] }, { maxAge: 1 })).toThrow('numeric')
  })

  test('mutates all columns atomically, retains stable source IDs, and applies retention', () => {
    const data = createTable({ t: [1, 2], q: [10, 20] }, { maxPoints: 3, maxAge: 3 })
    const id = data.sampleId(1)
    data.prepend({ t: [0], q: [0] })
    expect(data.sampleId(2)).toBe(id)
    data.append({ t: [3, 4], q: [30, 40] })
    expect(data.length).toBe(3)
    expect(data.sampleId(0)).toBe(id)
    data.upsert({ from: 3, to: 3, rows: { t: [3], q: [300] } })
    expect(data.valueAt('q', 1)).toBe(300)
    expect(data.sampleId(0)).toBe(id)
    const version = data.version
    expect(() => data.append({ t: [1], q: [1] })).toThrow('ordered')
    expect(() => data.append({ t: [5], q: [1, 2] })).toThrow('length')
    expect(() => data.replace({ t: [0], q: ['bad'] })).toThrow('kind')
    expect(() => data.upsert({ from: 0, to: 1, rows: { t: [2], q: [2] } })).toThrow('closed range')
    expect(data.version).toBe(version)
    expect(data.valueAt('q', 1)).toBe(300)
    data.append({ t: [10], q: [100] })
    expect(data.length).toBe(1)
    data.clear()
    expect(data.length).toBe(0)
    const cleared = data.version
    data.clear()
    data.append({ t: [], q: [] })
    expect(data.version).toBe(cleared)
    data.replace({ t: [0, 0], q: [1, 2] })
    expect(data.length).toBe(2)
  })

  test('publishes immutable mutation metadata after append, upsert, replacement and clear', () => {
    const data = createTable({ t: [1, 2], q: [10, 20] }, { maxPoints: 3 })
    data.append({ t: [3], q: [30] })
    expect(data.change).toEqual({
      version: 1,
      operation: 'append',
      spliceFrom: 2,
      previousLength: 2,
      length: 3,
      inputLength: 1,
      invalidatedFrom: 2,
      invalidatedTo: 3,
      replaced: 0,
      evicted: 0,
      from: 1,
      to: 3,
    })
    expect(Object.isFrozen(data.change)).toBe(true)

    data.append({ t: [4, 5], q: [40, 50] })
    expect(data.change).toMatchObject({
      operation: 'append',
      previousLength: 3,
      length: 3,
      inputLength: 2,
      invalidatedFrom: 0,
      invalidatedTo: 3,
      evicted: 2,
      from: 1,
      to: 5,
    })

    data.upsert({ from: 4, to: 4, rows: { t: [4], q: [400] } })
    expect(data.change).toMatchObject({
      operation: 'upsert',
      inputLength: 1,
      spliceFrom: 1,
      replaced: 1,
      invalidatedFrom: 0,
      invalidatedTo: 3,
    })

    data.replace({ t: [8], q: [80] })
    expect(data.change).toMatchObject({
      operation: 'replace',
      previousLength: 3,
      length: 1,
      replaced: 3,
    })
    data.clear()
    expect(data.change).toMatchObject({ operation: 'clear', previousLength: 1, length: 0 })
  })

  test('composite constraints reject duplicate keys and bad intervals before committing a mutation', () => {
    const data = createTable({ t: [0], end: [2], a: [3] })
    const mark = bar(data, {
      x: 't',
      y: 'a',
      scales: { x: 't', y: 'q' },
      interval: { start: 't', end: 'end' },
    })
    expect(mark.data).toBe(data)
    expect(() => data.append({ t: [0], end: [2], a: [4] })).toThrow('row 1')
    expect(() => data.append({ t: [1], end: [3], a: [4] })).toThrow('non-overlapping')
    expect(data.version).toBe(0)
    expect(data.length).toBe(1)
    data.append({ t: [2], end: [3], a: [4] })
    expect(data.length).toBe(2)
  })

  test('age retention includes duplicate cutoff keys and preserves categorical columns through clear', () => {
    const data = createTable({ t: [0, 1, 1, 2], q: [0, 10, 11, 20] }, { maxAge: 1 })
    expect(data.length).toBe(3)
    expect([data.valueAt('q', 0), data.valueAt('q', 1)]).toEqual([10, 11])
    data.prepend({ t: [0], q: [0] })
    expect(data.length).toBe(3)
    data.upsert({ from: 1, to: 1, rows: { t: [1], q: [100] } })
    expect(data.length).toBe(2)
    expect(data.valueAt('q', 0)).toBe(100)
    const categories = createTable({ name: ['b', 'a'], q: [1, 2] })
    categories.clear()
    categories.append({ name: ['c', 'b'], q: [3, 4] })
    expect(categories.kind('name')).toBe('string')
    expect([categories.valueAt('name', 0), categories.valueAt('name', 1)]).toEqual(['c', 'b'])
  })

  test('retained appends wrap aligned buffers without copying surviving rows', () => {
    const size = 128
    const keys = Array.from({ length: size }, (_, row) => row)
    const data = createTable(
      { t: keys, q: keys.map((row) => -row), label: keys.map((row) => `label-${row % 3}`) },
      { maxPoints: size },
    )
    const initial = tableStorageDiagnostics(data)
    const expected = keys.map((t) => ({ t, q: -t, label: `label-${t % 3}`, id: t }))

    for (let t = size; t < size * 5; t += 1) {
      const q = t % 11 === 0 ? NaN : -t
      const label = `label-${t % 3}`
      data.append({ t: [t], q: [q], label: [label] })
      expected.push({ t, q, label, id: t })
      expected.shift()
      expect(
        Array.from({ length: data.length }, (_, row) => ({
          t: data.valueAt('t', row),
          q: data.valueAt('q', row),
          label: data.valueAt('label', row),
          id: data.sampleId(row),
        })),
      ).toEqual(expected)
    }
    const final = tableStorageDiagnostics(data)
    expect(final.copiedRows).toBe(initial.copiedRows)
    expect(final.appendedRows - initial.appendedRows).toBe(size * 4)
    expect(final.capacity).toBe(size)
    expect(final.byteLength).toBe(size * 4 * Float64Array.BYTES_PER_ELEMENT)
    expect(final.byteLength).toBe(initial.byteLength)
  })

  test('grows geometrically and supports non-append mutations after wrapping', () => {
    const data = createTable({ t: [2], q: [20] }, { maxPoints: 5 })
    const originalId = data.sampleId(0)
    data.append({ t: [3, 4], q: [30, 40] })
    expect(data.sampleId(0)).toBe(originalId)
    expect(tableStorageDiagnostics(data).capacity).toBe(3)
    data.append({ t: [5], q: [50] })
    expect(tableStorageDiagnostics(data).capacity).toBe(5)
    const copied = tableStorageDiagnostics(data).copiedRows
    data.append({ t: [6, 7, 8], q: [60, 70, 80] })
    expect(tableStorageDiagnostics(data).copiedRows).toBe(copied)
    const survivorId = data.sampleId(2)
    data.upsert({ from: 5, to: 5, rows: { t: [5], q: [500] } })
    expect(Array.from({ length: data.length }, (_, row) => data.valueAt('q', row))).toEqual([
      40, 500, 60, 70, 80,
    ])
    expect(data.sampleId(2)).toBe(survivorId)
    data.prepend({ t: [3], q: [30] })
    expect(data.valueAt('t', 0)).toBe(4)
    data.clear()
    data.append({ t: [10], q: [100] })
    expect(data.length).toBe(1)
    expect(data.valueAt('q', 0)).toBe(100)
  })

  test('applies combined age/count retention to oversized appends and includes cutoff duplicates', () => {
    const options = { maxPoints: 4, maxAge: 2 }
    const data = createTable({ t: [0, 1], q: [0, 10] }, options)
    options.maxAge = 1_000
    data.append({ t: [2, 3, 4], q: [20, 30, 40] })
    expect(Array.from({ length: data.length }, (_, row) => data.valueAt('t', row))).toEqual([
      2, 3, 4,
    ])
    const id = data.sampleId(2)
    data.append({ t: [4, 5, 6], q: [41, 50, 60] })
    expect(Array.from({ length: data.length }, (_, row) => data.valueAt('q', row))).toEqual([
      40, 41, 50, 60,
    ])
    expect(data.sampleId(0)).toBe(id)
    data.append({ t: [7, 8, 9, 10, 11, 12], q: [70, 80, 90, 100, 110, 120] })
    expect(Array.from({ length: data.length }, (_, row) => data.valueAt('t', row))).toEqual([
      10, 11, 12,
    ])
    expect(data.change).toMatchObject({ evicted: 7, inputLength: 6, previousLength: 4, length: 3 })
    const zeroAge = createTable({ t: [], q: [] }, { maxAge: 0 })
    zeroAge.append({ t: [1, 2, 2], q: [1, 2, 3] })
    zeroAge.append({ t: [2], q: [4] })
    expect(Array.from({ length: zeroAge.length }, (_, row) => zeroAge.valueAt('q', row))).toEqual([
      2, 3, 4,
    ])
  })

  test('rejects appends before overwriting wrapped columns, IDs or diagnostics', () => {
    const data = createTable({ t: [0, 1], end: [1, 2], a: [10, 20] }, { maxPoints: 2 })
    const mark = bar(data, {
      x: 't',
      y: 'a',
      scales: { x: 't', y: 'q' },
      interval: { start: 't', end: 'end' },
    })
    data.append({ t: [2], end: [3], a: [30] })
    const before = tableStorageDiagnostics(data)
    const ids = [data.sampleId(0), data.sampleId(1)]
    const change = data.change
    expect(() => data.append({ t: [2], end: [3], a: [300] })).toThrow(/Duplicate/)
    expect(() => data.append({ t: [3], end: [2], a: [40] })).toThrow(/interval/)
    expect(data.change).toBe(change)
    expect(tableStorageDiagnostics(data)).toEqual(before)
    expect([data.sampleId(0), data.sampleId(1)]).toEqual(ids)
    expect([data.valueAt('a', 0), data.valueAt('a', 1)]).toEqual([20, 30])
    data.append({ t: [3], end: [4], a: [40] })
    expect(data.sampleId(1)).toBe(3)
    expect(mark.data).toBe(data)
  })

  test('checks categorical append keys against every existing composite key', () => {
    const data = createTable({ category: ['a', 'b', 'c'], q: [1, 2, 3] })
    const mark = bar(data, {
      x: 'category',
      y: 'q',
      scales: { x: 'x', y: 'y' },
      width: 10,
    })
    expect(() => data.append({ category: ['a'], q: [4] })).toThrow(/Duplicate.*row 3/)
    expect(data.length).toBe(3)
    expect(data.version).toBe(0)
    data.append({ category: ['d'], q: [4] })
    expect(data.valueAt('category', 3)).toBe('d')
    expect(mark.data).toBe(data)
  })
})

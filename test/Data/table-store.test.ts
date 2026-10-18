import { describe, expect, test } from 'vitest'
import { bar, createTable } from '../../src/index.js'

describe('aligned tables', () => {
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
})

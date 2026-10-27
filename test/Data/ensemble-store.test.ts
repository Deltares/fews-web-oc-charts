import { describe, expect, test } from 'vitest'
import { createEnsemble, type EnsembleStore } from '../../src/index.js'
import { ensembleStorageDiagnostics, isEnsembleStore } from '../../src/data-store/ensemble.js'

function snapshot(store: EnsembleStore) {
  return {
    x: Array.from({ length: store.length }, (_, index) => store.xAt(index)),
    members: Array.from({ length: store.memberCount }, (_, member) =>
      Array.from({ length: store.length }, (_, index) => store.valueAt(member, index)),
    ),
  }
}

describe('ensemble stores', () => {
  test('accepts member columns and row-major matrices with identical results', () => {
    const fromColumns = createEnsemble({
      x: [new Date(1), 2, 3],
      members: [
        [1, null, 3],
        [4, 5, NaN],
      ],
    })
    const fromMatrix = createEnsemble({
      x: [1, 2, 3],
      members: { memberCount: 2, values: new Float32Array([1, NaN, 3, 4, 5, NaN]) },
    })
    expect(snapshot(fromColumns)).toEqual(snapshot(fromMatrix))
    expect(snapshot(fromColumns)).toEqual({
      x: [1, 2, 3],
      members: [
        [1, NaN, 3],
        [4, 5, NaN],
      ],
    })
    expect(fromColumns.memberCount).toBe(2)
    expect(isEnsembleStore(fromColumns)).toBe(true)
    expect(isEnsembleStore({})).toBe(false)
  })

  test('copies caller buffers and stores values as float32 by default', () => {
    const x = new Float64Array([1, 2])
    const member = new Float64Array([0.1, 0.2])
    const store = createEnsemble({ x, members: [member] })
    x[0] = 99
    member[0] = 99
    expect(store.xAt(0)).toBe(1)
    expect(store.valueAt(0, 0)).toBe(Math.fround(0.1))
    expect(
      createEnsemble({ x: [1, 2], members: [member] }, { precision: 'float64' }).valueAt(0, 1),
    ).toBe(0.2)
    expect(() => createEnsemble({ x: [1], members: [[1e40]] })).toThrow(/requested precision/)
    expect(
      createEnsemble({ x: [1], members: [[1e40]] }, { precision: 'float64' }).valueAt(0, 0),
    ).toBe(1e40)
  })

  test('keeps 50 members × 10k steps within about 2 MB of canonical storage', () => {
    const steps = 10_000
    const memberCount = 50
    const store = createEnsemble({
      x: Float64Array.from({ length: steps }, (_, index) => index),
      members: { memberCount, values: new Float32Array(steps * memberCount) },
    })
    expect(ensembleStorageDiagnostics(store).canonicalBytes).toBe(
      steps * 8 + steps * memberCount * 4,
    )
  })

  test('validates shape, order, values, options and metadata', () => {
    expect(() => createEnsemble({ x: [1], members: [] })).toThrow(/at least one member/)
    expect(() => createEnsemble({ x: [1, 2], members: [[1]] })).toThrow(/as long as x/)
    expect(() =>
      createEnsemble({ x: [1, 2], members: { memberCount: 2, values: [1, 2, 3] } }),
    ).toThrow(/memberCount \* x.length/)
    expect(() => createEnsemble({ x: [2, 1], members: [[1, 2]] })).toThrow(/out of order/)
    expect(() => createEnsemble({ x: [Infinity], members: [[1]] })).toThrow(/finite/)
    expect(() => createEnsemble({ x: [1], members: [[Infinity]] })).toThrow(/finite/)
    expect(() => createEnsemble({ x: [1], members: [['1' as never]] })).toThrow(/finite/)
    expect(() => createEnsemble({ x: [1], members: [[1]] }, { maxPoints: 0 })).toThrow(/positive/)
    expect(() => createEnsemble({ x: [1], members: [[1]] }, { maxAge: -1 })).toThrow(/nonnegative/)
    expect(() => createEnsemble({ x: [1], members: [[1]] }, { unknown: true } as never)).toThrow()
    expect(() =>
      createEnsemble({ x: [1], members: [[1], [2]] }, { metadata: [{ id: 'a' }] }),
    ).toThrow(/one entry per member/)
    expect(() =>
      createEnsemble({ x: [1], members: [[1], [2]] }, { metadata: [{ id: 'a' }, { id: 'a' }] }),
    ).toThrow(/not unique/)
  })

  test('exposes member metadata with stable ids and labels', () => {
    const plain = createEnsemble({ x: [1], members: [[1], [2]] })
    expect(plain.members).toEqual([
      { index: 0, id: '0', label: '0' },
      { index: 1, id: '1', label: '1' },
    ])
    const named = createEnsemble(
      { x: [1], members: [[1], [2]] },
      { metadata: [{ id: 'control', label: 'Control run' }, { id: 'm1' }] },
    )
    expect(named.members[0]).toEqual({ index: 0, id: 'control', label: 'Control run' })
    expect(named.members[1].label).toBe('m1')
    expect(named.memberIndex('m1')).toBe(1)
    expect(named.memberIndex('missing')).toBe(-1)
    expect(Object.isFrozen(named.members)).toBe(true)
    named.replace({ x: [5], members: [[0], [0]] })
    expect(named.members[0].id).toBe('control')
  })

  test('computes extents over all members, skipping missing values', () => {
    const store = createEnsemble({
      x: [1, 2, 3, 4],
      members: [
        [1, NaN, 9, NaN],
        [-2, NaN, 4, NaN],
      ],
    })
    expect(store.extent('y')).toEqual([-2, 9])
    expect(store.extent('x')).toEqual([1, 3])
    expect(store.extent('y', [2, 4])).toEqual([4, 9])
    expect(store.extent('y', [2, 2])).toBeUndefined()
  })

  test('block-indexed extents match a full scan across ring wraparound', () => {
    const memberCount = 3
    const value = (member: number, step: number) =>
      step % 37 === 0 ? NaN : Math.sin(step * 0.1 + member) * (member + 1)
    const rows = (from: number, to: number) => {
      const x = Array.from({ length: to - from }, (_, index) => from + index)
      return {
        x,
        members: Array.from({ length: memberCount }, (_, m) => x.map((s) => value(m, s))),
      }
    }
    const store = createEnsemble(rows(0, 600), { maxPoints: 600 })
    store.append(rows(600, 1000))
    const reference = (window: readonly [number, number]) => {
      let low = Infinity
      let high = -Infinity
      for (let index = 0; index < store.length; index += 1) {
        const x = store.xAt(index)
        if (x < window[0] || x > window[1]) continue
        for (let member = 0; member < memberCount; member += 1) {
          const v = store.valueAt(member, index)
          if (!Number.isFinite(v)) continue
          low = Math.min(low, v)
          high = Math.max(high, v)
        }
      }
      return low <= high ? [low, high] : undefined
    }
    expect(store.xAt(0)).toBe(400)
    for (const window of [
      [-Infinity, Infinity],
      [400, 999],
      [450, 900],
      [599, 601],
      [777, 777],
    ] as const) {
      expect(store.extent('y', window)).toEqual(reference(window))
    }
  })

  test('appends into a ring with retention and reports change metadata', () => {
    const store = createEnsemble(
      {
        x: [1, 2],
        members: [
          [10, 20],
          [30, 40],
        ],
      },
      { maxPoints: 3 },
    )
    const before = store.version
    store.append({
      x: [3, 4],
      members: [
        [50, 60],
        [70, 80],
      ],
    })
    expect(store.version).toBe(before + 1)
    expect(snapshot(store)).toEqual({
      x: [2, 3, 4],
      members: [
        [20, 50, 60],
        [40, 70, 80],
      ],
    })
    expect(store.capacity).toBe(3)
    expect(store.change).toMatchObject({
      operation: 'append',
      previousLength: 2,
      length: 3,
      inputLength: 2,
      evicted: { count: 1, from: 1, to: 1 },
      invalidatedFrom: 0,
      from: 1,
      to: 4,
    })
    store.append({ x: [], members: [[], []] })
    expect(store.version).toBe(before + 1)
  })

  test('applies age retention including duplicates at the cutoff', () => {
    const store = createEnsemble({ x: [0, 5, 5], members: [[1, 2, 3]] }, { maxAge: 5 })
    store.append({ x: [10], members: [[4]] })
    expect(snapshot(store).x).toEqual([5, 5, 10])
    expect(store.change?.evicted).toEqual({ count: 1, from: 0, to: 0 })
  })

  test('supports prepend, upsert, replace and clear with duplicate-preserving order', () => {
    const store = createEnsemble({ x: [2, 3, 3, 4], members: [[1, 2, 3, 4]] })
    store.prepend({ x: [0, 2], members: [[-1, 0]] })
    expect(snapshot(store)).toEqual({ x: [0, 2, 2, 3, 3, 4], members: [[-1, 0, 1, 2, 3, 4]] })
    store.upsert({ from: 2, to: 3, rows: { x: [2.5], members: [[9]] } })
    expect(snapshot(store)).toEqual({ x: [0, 2.5, 4], members: [[-1, 9, 4]] })
    expect(store.change).toMatchObject({ operation: 'upsert', replaced: 4, from: 0, to: 4 })
    store.replace({ x: [7, 8], members: [[7, 8]] })
    expect(snapshot(store)).toEqual({ x: [7, 8], members: [[7, 8]] })
    expect(store.change).toMatchObject({ operation: 'replace', replaced: 3 })
    store.clear()
    expect(store.length).toBe(0)
    expect(store.extent('y')).toBeUndefined()
    expect(store.change).toMatchObject({ operation: 'clear', replaced: 2, from: 7, to: 8 })
    store.append({ x: [1], members: [[1]] })
    expect(snapshot(store)).toEqual({ x: [1], members: [[1]] })
  })

  test('rejects invalid mutations atomically', () => {
    const store = createEnsemble({
      x: [1, 2],
      members: [
        [1, 2],
        [3, 4],
      ],
    })
    const before = snapshot(store)
    const version = store.version
    expect(() => store.append({ x: [0], members: [[0], [0]] })).toThrow(/precede/)
    expect(() => store.prepend({ x: [3], members: [[0], [0]] })).toThrow(/follow/)
    expect(() => store.append({ x: [3], members: [[0]] })).toThrow(/exactly 2 members/)
    expect(() =>
      store.append({
        x: [3, 4],
        members: [
          [0, 1],
          [0, Infinity],
        ],
      }),
    ).toThrow(/finite/)
    expect(() => store.upsert({ from: 2, to: 1, rows: { x: [], members: [[], []] } })).toThrow(
      /from <= to/,
    )
    expect(() => store.upsert({ from: 1, to: 2, rows: { x: [3], members: [[0], [0]] } })).toThrow(
      /outside the upsert range/,
    )
    expect(snapshot(store)).toEqual(before)
    expect(store.version).toBe(version)
  })

  test('validates accessor indices', () => {
    const store = createEnsemble({ x: [1], members: [[1]] })
    expect(() => store.xAt(1)).toThrow(RangeError)
    expect(() => store.valueAt(1, 0)).toThrow(/member 1/)
    expect(() => store.valueAt(0, -1)).toThrow(RangeError)
  })
})

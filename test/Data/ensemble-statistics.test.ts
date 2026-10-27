import { quantileSorted } from 'd3'
import { describe, expect, test } from 'vitest'
import {
  createEnsemble,
  createSeries,
  type EnsembleStatistic,
  type EnsembleStore,
} from '../../src/index.js'
import { ensembleStorageDiagnostics } from '../../src/data-store/ensemble.js'

const column = (statistic: EnsembleStatistic) =>
  Array.from({ length: statistic.length }, (_, index) => statistic.at(index))

function referenceQuantile(store: EnsembleStore, probability: number) {
  return Array.from({ length: store.length }, (_, index) => {
    const valid = Array.from({ length: store.memberCount }, (_, member) =>
      store.valueAt(member, index),
    )
      .filter(Number.isFinite)
      .sort((a, b) => a - b)
    return valid.length ? quantileSorted(valid, probability)! : NaN
  })
}

function rows(from: number, to: number, memberCount = 5) {
  const x = Array.from({ length: to - from }, (_, index) => from + index)
  return {
    x,
    members: Array.from({ length: memberCount }, (_, member) =>
      x.map((step) => (step % 11 === member ? NaN : Math.sin(step * 0.3 + member * 1.7) * 10)),
    ),
  }
}

describe('ensemble statistics', () => {
  test('quantiles, mean and exceedance ignore missing members and give NaN when all are missing', () => {
    const store = createEnsemble({
      x: [1, 2, 3],
      members: [
        [1, NaN, 5],
        [3, NaN, NaN],
        [2, NaN, 9],
      ],
    })
    expect(column(store.quantile(0.5))).toEqual([2, NaN, 7])
    expect(column(store.quantile(0))).toEqual([1, NaN, 5])
    expect(column(store.quantile(1))).toEqual([3, NaN, 9])
    expect(column(store.quantile(0.25))).toEqual([1.5, NaN, 6])
    expect(column(store.mean())).toEqual([2, NaN, 7])
    expect(column(store.exceedance(2))).toEqual([1 / 3, NaN, 1])
    expect(store.quantile(0.5).extent()).toEqual([2, 7])
    expect(store.quantile(0.5).extent([2, 2])).toBeUndefined()
  })

  test('matches a reference quantile for every requested probability', () => {
    const store = createEnsemble(rows(0, 300))
    const probabilities = [0, 0.05, 0.25, 0.5, 0.75, 0.95, 1]
    store.quantiles(probabilities).forEach((statistic, position) => {
      expect(statistic.parameter).toBe(probabilities[position])
      expect(column(statistic)).toEqual(referenceQuantile(store, probabilities[position]))
    })
  })

  test('sorts each time step once for all cached quantiles, median and p50 share a column', () => {
    const store = createEnsemble(rows(0, 100))
    const [low, high] = store.quantiles([0.05, 0.95])
    const median = store.quantile(0.5)
    const p50 = store.quantile(0.5)
    column(low)
    column(high)
    column(median)
    column(p50)
    const after = ensembleStorageDiagnostics(store)
    expect(after.derivedColumns).toBe(3)
    expect(after.sortedSteps).toBe(100)
    store.mean().at(0)
    store.exceedance(1).at(0)
    expect(ensembleStorageDiagnostics(store).sortedSteps).toBe(100)
  })

  test('appends compute only new rows and stay correct across ring eviction', () => {
    const store = createEnsemble(rows(0, 64), { capacity: 128, maxPoints: 128 })
    const median = store.quantile(0.5)
    const mean = store.mean()
    column(median)
    column(mean)
    expect(ensembleStorageDiagnostics(store).sortedSteps).toBe(64)
    store.append(rows(64, 74))
    expect(column(median)).toEqual(referenceQuantile(store, 0.5))
    expect(ensembleStorageDiagnostics(store).sortedSteps).toBe(74)
    store.append(rows(74, 200))
    expect(store.xAt(0)).toBe(72)
    expect(column(median)).toEqual(referenceQuantile(store, 0.5))
    expect(ensembleStorageDiagnostics(store).sortedSteps).toBe(200)
    const reference = Array.from({ length: store.length }, (_, index) => {
      const valid = Array.from({ length: 5 }, (_, member) => store.valueAt(member, index)).filter(
        Number.isFinite,
      )
      return valid.reduce((sum, value) => sum + value, 0) / valid.length
    })
    column(mean).forEach((value, index) => expect(value).toBeCloseTo(reference[index], 10))
  })

  test('recomputes fully after capacity growth and rebuilding mutations', () => {
    const store = createEnsemble(rows(0, 10))
    const median = store.quantile(0.5)
    column(median)
    store.append(rows(10, 50))
    expect(column(median)).toEqual(referenceQuantile(store, 0.5))
    store.upsert({ from: 20, to: 30, rows: rows(20, 31, 5) })
    expect(column(median)).toEqual(referenceQuantile(store, 0.5))
    store.prepend(rows(-5, 0))
    expect(column(median)).toEqual(referenceQuantile(store, 0.5))
    store.replace({
      x: [1, 2],
      members: [
        [1, 2],
        [3, 4],
        [5, 6],
        [7, 8],
        [9, 10],
      ],
    })
    expect(column(median)).toEqual([5, 6])
    store.clear()
    expect(median.length).toBe(0)
    store.append({ x: [3], members: [[1], [1], [1], [1], [2]] })
    expect(column(median)).toEqual([1])
  })

  test('bounds the cache and transparently recomputes evicted columns', () => {
    const store = createEnsemble(rows(0, 20))
    const first = store.exceedance(-100)
    for (let threshold = 0; threshold < 40; threshold += 1) store.exceedance(threshold).at(0)
    expect(ensembleStorageDiagnostics(store).derivedColumns).toBe(32)
    expect(column(first)).toEqual(Array.from({ length: 20 }, () => 1))
    expect(ensembleStorageDiagnostics(store).derivedColumns).toBe(32)
  })

  test('validates parameters', () => {
    const store = createEnsemble({ x: [1], members: [[1]] })
    expect(() => store.quantile(-0.1)).toThrow(/\[0, 1\]/)
    expect(() => store.quantile(NaN)).toThrow(/\[0, 1\]/)
    expect(() => store.quantiles(0.5 as never)).toThrow(TypeError)
    expect(() => store.exceedance(Infinity)).toThrow(/finite/)
    expect(() => store.quantile(0.5).at(1)).toThrow(RangeError)
  })

  test('computes 50 members × 10k steps of quantiles quickly', () => {
    const steps = 10_000
    const memberCount = 50
    const values = new Float32Array(steps * memberCount)
    for (let index = 0; index < values.length; index += 1) values[index] = Math.sin(index * 0.37)
    const store = createEnsemble({
      x: Float64Array.from({ length: steps }, (_, index) => index),
      members: { memberCount, values },
    })
    const start = performance.now()
    const statistics = store.quantiles([0.05, 0.25, 0.5, 0.75, 0.95])
    for (const statistic of statistics) statistic.extent()
    const elapsed = performance.now() - start
    expect(ensembleStorageDiagnostics(store).sortedSteps).toBe(steps)
    // Generous bound for CI noise; the plan's 50 ms target covers the full initial render.
    expect(elapsed).toBeLessThan(250)
  })

  test('decimates members like the series store, keeping gaps and boundary neighbours', () => {
    const steps = 5_000
    const x = Float64Array.from({ length: steps }, (_, index) => index)
    const y = Float64Array.from({ length: steps }, (_, index) =>
      index % 997 === 0 ? NaN : Math.sin(index * 0.05) * (index % 7),
    )
    const ensembleStore = createEnsemble(
      { x, members: [y, y.map((value) => -value)] },
      { precision: 'float64' },
    )
    const series = createSeries({ x, y })
    for (const [window, width] of [
      [[0, steps - 1], 100],
      [[1200.5, 3100], 37],
      [[400, 400], 5],
    ] as const) {
      expect([...ensembleStore.memberLod(0, window, width)]).toEqual([...series.lod(window, width)])
    }
    const lod = ensembleStore.memberLod(1, [0, steps - 1], 100)
    expect(ensembleStore.memberLod(1, [0, steps - 1], 100).length).toBe(lod.length)
    expect(() => ensembleStore.memberLod(2, [0, 1], 10)).toThrow(/member 2/)
    expect(() => ensembleStore.memberLod(0, [0, Infinity], 10)).toThrow(/finite/)
    expect(() => ensembleStore.memberLod(0, [0, 1], 0)).toThrow(/width/)
    ensembleStore.append({ x: [steps], members: [[1e6], [-1e6]] })
    const updated = [...ensembleStore.memberLod(0, [0, steps], 100)]
    expect(updated.at(-1)).toBe(steps)
  })
})

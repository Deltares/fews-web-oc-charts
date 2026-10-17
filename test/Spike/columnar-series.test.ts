import { describe, expect, test } from 'vitest'
import { createColumnarSeries } from '../../src/spike/data/columnar-series.js'

describe('phase 0 columnar series', () => {
  test('copies caller buffers and retains appended samples in a wrapped ring', () => {
    const inputX = new Float64Array([1, 2, 3])
    const inputY = new Float64Array([10, 20, 30])
    const series = createColumnarSeries({ x: inputX, y: inputY }, { capacity: 3, maxPoints: 3 })
    inputX[0] = 999
    inputY[0] = 999
    series.append({ x: new Float64Array([4, 5]), y: new Float64Array([40, 50]) })

    expect(Array.from({ length: series.length }, (_, index) => series.xAt(index))).toEqual([
      3, 4, 5,
    ])
    expect(Array.from({ length: series.length }, (_, index) => series.yAt(index))).toEqual([
      30, 40, 50,
    ])
    expect(series.capacity).toBe(3)
    expect(series.canonicalByteLength).toBe(3 * 2 * Float64Array.BYTES_PER_ELEMENT)
    expect(series.version).toBe(1)
  })

  test('validates an append atomically and supports stable duplicate x values', () => {
    const series = createColumnarSeries({
      x: new Float64Array([1, 2]),
      y: new Float64Array([10, 20]),
    })
    expect(() =>
      series.append({
        x: new Float64Array([3, 2]),
        y: new Float64Array([30, 40]),
      }),
    ).toThrow(/sorted/)
    expect(series.version).toBe(0)
    expect(series.length).toBe(2)

    series.append({
      x: new Float64Array([2, 2]),
      y: new Float64Array([21, 22]),
    })
    expect(Array.from({ length: series.length }, (_, index) => series.yAt(index))).toEqual([
      10, 20, 21, 22,
    ])
  })

  test('validates ingestion columns and values before constructing the series', () => {
    expect(() =>
      createColumnarSeries({
        x: new Float64Array([1, 0]),
        y: new Float64Array([1, 2]),
      }),
    ).toThrow(/index 1/)
    expect(() =>
      createColumnarSeries({
        x: new Float64Array([1]),
        y: new Float64Array([Number.POSITIVE_INFINITY]),
      }),
    ).toThrow(/y value at index 0/)
    expect(() =>
      createColumnarSeries({
        x: new Float64Array([1]),
        y: new Float64Array([]),
      }),
    ).toThrow(/Column lengths differ/)
  })

  test('bounds LOD output by pixel columns and keeps extrema, gaps, and boundary duplicates', () => {
    const x = Float64Array.from({ length: 101 }, (_, index) => index)
    const y = Float64Array.from({ length: 101 }, (_, index) => {
      if (index === 25 || index === 26) return Number.NaN
      return index === 42 ? 100 : index === 73 ? -100 : Math.sin(index / 10)
    })
    const series = createColumnarSeries({ x, y })
    const lod = series.decimate({ start: 25, end: 75, width: 10 })
    const selected = Array.from(lod)

    expect(selected).toContain(42)
    expect(selected).toContain(73)
    expect(selected.filter((index) => Number.isNaN(series.yAt(index)))).toEqual([25])
    expect(selected.length).toBeLessThanOrEqual(4 * 10 + 4)
    expect(series.decimate({ start: 25, end: 75, width: 10 })).toBe(lod)
  })

  test('evicts old LOD entries and clears cached indices when the data changes', () => {
    const series = createColumnarSeries({
      x: Float64Array.from({ length: 200 }, (_, index) => index),
      y: Float64Array.from({ length: 200 }, (_, index) => index),
    })
    for (let start = 0; start < 40; start += 1) {
      series.decimate({ start, end: start + 50, width: 8 })
    }
    expect(series.lodCacheEntries).toBeLessThanOrEqual(32)
    series.append({ x: new Float64Array([200]), y: new Float64Array([200]) })
    expect(series.lodCacheEntries).toBe(0)
  })

  test('keeps million-point canonical buffers and repeated-window cache bounded', () => {
    const count = 1_000_000
    const x = Float64Array.from({ length: count }, (_, index) => index)
    const y = Float64Array.from({ length: count }, (_, index) => Math.sin(index / 10_000))
    const series = createColumnarSeries({ x, y })

    for (let start = 0; start < 100_000; start += 1_000) {
      const lod = series.decimate({ start, end: start + 100_000, width: 1000 })
      expect(lod.length).toBeLessThanOrEqual(4004)
    }

    expect(series.canonicalByteLength).toBe(16_000_000)
    expect(series.lodCacheEntries).toBeLessThanOrEqual(32)
    expect(series.lodCacheByteLength).toBeLessThanOrEqual(4 * 1024 * 1024)
  })
})

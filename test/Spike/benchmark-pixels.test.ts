import { describe, expect, test } from 'vitest'
import { changedPixelRatio } from '../../scripts/benchmark-pixels.js'

describe('benchmark RGBA comparison', () => {
  test('detects a missing black stroke on a transparent background', () => {
    expect(
      changedPixelRatio(
        new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 0]),
        new Uint8ClampedArray([0, 0, 0, 0, 0, 0, 0, 0]),
      ),
    ).toBe(0.5)
  })

  test('compares every channel and counts each changed pixel only once', () => {
    expect(
      changedPixelRatio(
        new Uint8ClampedArray(16),
        new Uint8ClampedArray([3, 0, 0, 0, 0, 3, 0, 0, 0, 0, 3, 0, 3, 3, 3, 3]),
      ),
    ).toBe(1)
  })

  test('uses a strict channel delta and accepts identical images', () => {
    expect(changedPixelRatio(new Uint8ClampedArray(4), new Uint8ClampedArray([2, 2, 2, 2]))).toBe(0)
    expect(changedPixelRatio(new Uint8ClampedArray(4), new Uint8ClampedArray(4))).toBe(0)
  })

  test('rejects incompatible images and invalid thresholds', () => {
    expect(() => changedPixelRatio(new Uint8ClampedArray(4), new Uint8ClampedArray(8))).toThrow()
    expect(() => changedPixelRatio(new Uint8ClampedArray(3), new Uint8ClampedArray(3))).toThrow()
    expect(() => changedPixelRatio(new Uint8ClampedArray(0), new Uint8ClampedArray(0))).toThrow()
    expect(() =>
      changedPixelRatio(new Uint8ClampedArray(4), new Uint8ClampedArray(4), -1),
    ).toThrow()
  })
})

import { describe, expect, test } from 'vitest'
import type { ScaleKind } from '../../src/scales/scale.js'
import { isValidScaleDomain } from '../../src/plot/scale-domain.js'

describe('interaction scale-domain validation', () => {
  test.each<ScaleKind>(['linear', 'log', 'time', 'degrees', 'angular', 'radial'])(
    'rejects non-finite %s domain values at either endpoint',
    (kind) => {
      for (const value of [NaN, Infinity, -Infinity]) {
        expect(isValidScaleDomain(kind, [value, 10])).toBe(false)
        expect(isValidScaleDomain(kind, [1, value])).toBe(false)
      }
      expect(isValidScaleDomain(kind, [1, 10])).toBe(true)
    },
  )

  test('requires strictly positive log values, including underflow', () => {
    expect(isValidScaleDomain('log', [Number.MIN_VALUE, Number.MAX_VALUE])).toBe(true)
    for (const value of [0, -0, -1]) {
      expect(isValidScaleDomain('log', [value, 10])).toBe(false)
      expect(isValidScaleDomain('log', [1, value])).toBe(false)
    }
  })

  test('includes both Date limits but rejects values beyond them', () => {
    expect(isValidScaleDomain('time', [-8.64e15, 8.64e15])).toBe(true)
    expect(isValidScaleDomain('time', [-8.64e15 - 1, 0])).toBe(false)
    expect(isValidScaleDomain('time', [0, 8.64e15 + 1])).toBe(false)
  })

  test('does not apply log or time restrictions to linear domains', () => {
    expect(isValidScaleDomain('linear', [-Number.MAX_VALUE, Number.MAX_VALUE])).toBe(true)
    expect(isValidScaleDomain('linear', [0, 0])).toBe(true)
  })
})

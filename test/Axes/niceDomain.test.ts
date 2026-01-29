import { describe, expect, test } from 'vitest'
import { niceDomain } from '../../src/Axes/niceDomain.js'
import { AxisType } from '../../src/Axis/axisType.js'

describe('niceDomain', () => {
  test('should return a nice domain for positive numbers', () => {
    const domain = [1, 9]
    const result = niceDomain(domain, 25, AxisType.value)
    expect(result).toEqual([0, 10])
  })

  test('should return a nice domain for negative numbers', () => {
    const domain = [-9, -1]
    const result = niceDomain(domain, 25, AxisType.value)
    expect(result).toEqual([-10, 0])
  })

  test('should return a nice domain for mixed numbers', () => {
    const domain = [-5, 5]
    const result = niceDomain(domain, 25, AxisType.value)
    expect(result).toEqual([-6, 6])
  })

  test('should handle single value domains', () => {
    const domain = [-2, 3]
    const result = niceDomain(domain, 25, AxisType.value)
    expect(result).toEqual([-2.5, 3.5])
  })
})

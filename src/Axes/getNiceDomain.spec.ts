import { describe, it, expect } from 'vitest'
import { getNiceDomain } from './getNiceDomain'
describe('getNiceDomain', () => {
  it('should expand domain when data extent max exceeds default domain max', () => {
    const result = getNiceDomain({
      defaultDomain: [0, 100],
      dataExtent: [10, 120],
      bufferRatio: 0.1,
    })
    expect(result[1]).toBeGreaterThan(120)
    expect(result[1]).toEqual(140)
  })

  it('should expand domain when data extent min is below default domain min', () => {
    const result = getNiceDomain({
      defaultDomain: [50, 150],
      dataExtent: [20, 140],
      bufferRatio: 0.1,
    })
    expect(result[0]).toBeLessThan(20)
    expect(result[0]).toEqual(0)
  })

  it('should expand domain when both data extent bounds exceed default domain', () => {
    const result = getNiceDomain({
      defaultDomain: [0, 100],
      dataExtent: [-30, 150],
      bufferRatio: 0.1,
    })
    expect(result[0]).toBeLessThan(-30)
    expect(result[1]).toBeGreaterThan(150)
    expect(result).toEqual([-60, 180])
  })

  it('should apply buffer when data extent max exceeds default domain max', () => {
    const result = getNiceDomain({
      defaultDomain: [0, 100],
      dataExtent: [10, 110],
      bufferRatio: 0.2,
    })
    expect(result[1]).toBeGreaterThan(110)
  })

  it('should handle data extent max far beyond default domain with large buffer', () => {
    const result = getNiceDomain({
      defaultDomain: [0, 100],
      dataExtent: [0, 200],
      bufferRatio: 0.5,
    })
    expect(result[1]).toBeGreaterThan(200)
    expect(result[0]).toBeLessThanOrEqual(0)
    expect(result).toEqual([0, 300])
  })

  it('should expand domain to accommodate data with buffer', () => {
    const result = getNiceDomain({
      defaultDomain: [0, 100],
      dataExtent: [10, 90],
      bufferRatio: 0.1,
    })
    expect(result).toEqual([0, 100])
  })

  it('should use default buffer ratio of 0.1 when not specified', () => {
    const result = getNiceDomain({
      defaultDomain: [0, 100],
      dataExtent: [20, 80],
    })
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBe(2)
    expect(result).toEqual([0, 100])
  })

  it('should not apply buffer when default domain is 0', () => {
    const result = getNiceDomain({
      defaultDomain: [0, 100],
      dataExtent: [0, 50],
      bufferRatio: 0.1,
    })
    expect(result).toEqual([0, 100])
  })

  it('should apply nice function for clean step values', () => {
    const result = getNiceDomain({
      defaultDomain: [0, 100],
      dataExtent: [15, 85],
      bufferRatio: 0.05,
    })
    expect(result[0] % 10).toBe(0)
  })

  it('should respect defaultDomain when larger than expanded dataExtent', () => {
    const result = getNiceDomain({
      defaultDomain: [0, 150],
      dataExtent: [20, 80],
      bufferRatio: 0.1,
    })
    expect(result[1]).toBeGreaterThanOrEqual(150)
  })

  it('should handle negative values', () => {
    const result = getNiceDomain({
      defaultDomain: [-100, 100],
      dataExtent: [-50, 50],
      bufferRatio: 0.1,
    })
    expect(result[0]).toBeLessThan(result[1])
  })

  it('should handle zero data range', () => {
    const result = getNiceDomain({
      defaultDomain: [0, 100],
      dataExtent: [50, 50],
      bufferRatio: 0.1,
    })
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBe(2)
    expect(result).toEqual([0, 100])
  })

  it('should workd with an undefined default domain', () => {
    const result = getNiceDomain({
      defaultDomain: undefined,
      dataExtent: [110, 120],
      bufferRatio: 0.1,
    })
    expect(result).toEqual([109, 121])
  })

  it('should workd with an array with undefined for default domain', () => {
    const result = getNiceDomain({
      defaultDomain: [undefined, undefined],
      dataExtent: [110, 120],
      bufferRatio: 0.1,
    })
    expect(result).toEqual([109, 121])
  })

  it('should work with zero spread dataExtent', () => {
    const result = getNiceDomain({
      defaultDomain: [undefined, undefined],
      dataExtent: [100, 100],
      bufferRatio: 0.1,
    })
    expect(result).toEqual([90, 110])
  })

  it('should work with zero spread dataExtent', () => {
    const result = getNiceDomain({
      defaultDomain: [0, 0],
      dataExtent: [-0.011, -0.011],
      bufferRatio: 0.1,
    })
    expect(result).toEqual([-0.014, 0])
  })

  it('should be consistent with two dataExtent, where the min value is above default domain', () => {
    const result1 = getNiceDomain({
      defaultDomain: [0, 100],
      dataExtent: [110, 120],
      bufferRatio: 0.1,
    })
    expect(result1).toEqual([0, 140])
    const result2 = getNiceDomain({
      defaultDomain: [0, 100],
      dataExtent: [10, 120],
      bufferRatio: 0.1,
    })
    expect(result2).toEqual(result1)
  })
})

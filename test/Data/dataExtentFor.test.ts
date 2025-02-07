import { describe, expect, test } from 'vitest'
import { dataExtentFor } from '../../src/Data/dataExtentFor'

describe('dataExtentFor', () => {
  test('scalar x valued data', () => {
    const data = [
      {
        x: 0,
      },
      {
        x: -1,
      },
      {
        x: 1,
      },
    ]
    const extent = dataExtentFor(data, 'x')
    expect(extent).toStrictEqual([-1, 1])
  })

  test('scalar x valued data with NaN', () => {
    const data = [
      {
        x: NaN,
      },
      {
        x: -1,
      },
      {
        x: 1,
      },
    ]
    const extent = dataExtentFor(data, 'x')
    expect(extent).toStrictEqual([-1, 1])
  })

  test('array valued data', () => {
    const data = [
      {
        x: [0, 1],
      },
      {
        x: [-1, 0],
      },
      {
        x: [0, 1],
      },
      {
        x: [0, 1],
      },
    ]
    const extent = dataExtentFor(data, 'x')
    expect(extent).toStrictEqual([-1, 1])
  })

  test('data with Date', () => {
    const data = [
      {
        x: new Date('2024-02-01'),
      },
      {
        x: new Date('2024-01-01'),
      },
      {
        x: new Date('2024-03-01'),
      },
    ]
    const extent = dataExtentFor(data, 'x')
    expect(extent).toStrictEqual([new Date('2024-01-01'), new Date('2024-03-01')])
  })
})

describe('dataExtentFor with filter', () => {
  test('unfiltered x valued data', () => {
    const data = [
      {
        x: 999,
      },
      {
        x: -1,
      },
      {
        x: 1,
      },
    ]
    const extent = dataExtentFor(data, 'x')
    expect(extent).toStrictEqual([-1, 999])
  })

  test('fiterscalar x valued data', () => {
    const data = [
      {
        x: 999,
      },
      {
        x: -1,
      },
      {
        x: 1,
      },
    ]
    const filter = (d) => d.x !== 999
    const extent = dataExtentFor(data, 'x', filter)
    expect(extent).toStrictEqual([-1, 1])
  })

  test('scalar x valued data', () => {
    const data = [
      {
        x: 999,
        flag: 4,
      },
      {
        x: -1,
      },
      {
        x: 1,
      },
    ]
    const filter = (d: { flag?: number }) => d.flag !== 4
    const extent = dataExtentFor(data, 'x', filter)
    expect(extent).toStrictEqual([-1, 1])
  })

  test('all data filtered', () => {
    const data = [
      {
        x: 999,
      },
      {
        x: 999,
      },
      {
        x: 999,
      },
    ]
    const filter = (d) => d.x !== 999
    const extent = dataExtentFor(data, 'x', filter)
    expect(extent).toStrictEqual([undefined, undefined])
  })

  test('all flagged data', () => {
    const data = [
      {
        x: 999,
        flag: 4,
      },
      {
        x: -1,
        flag: 4,
      },
      {
        x: 1,
        flag: 4,
      },
    ]
    const filter = (d) => d.flag !== 4
    const extent = dataExtentFor(data, 'x', filter)
    expect(extent).toStrictEqual([undefined, undefined])
  })

  test('array valued single missinge value filter', () => {
    const data = [
      {
        x: [0, 1],
      },
      {
        x: [999, 999],
      },
      {
        x: [0, 1],
      },
      {
        x: [-1, 1],
      },
    ]
    const filter = (d) => !d.x.includes(999)
    const extent = dataExtentFor(data, 'x', filter)
    expect(extent).toStrictEqual([-1, 1])
  })

  test('array valued single flagged data', () => {
    const data = [
      {
        x: [0, 1],
        flag: 0,
      },
      {
        x: [-999, 999],
        flag: 4,
      },
      {
        x: [0, 1],
        flag: 0,
      },
      {
        x: [-1, 1],
        flag: 0,
      },
    ]
    const filter = (d) => d.flag !== 4
    const extent = dataExtentFor(data, 'x', filter)
    expect(extent).toStrictEqual([-1, 1])
  })

  test('array valued all flagged data', () => {
    const data = [
      {
        x: [0, 1],
        flag: 4,
      },
      {
        x: [-1, 0],
        flag: 4,
      },
      {
        x: [0, 1],
        flag: 4,
      },
      {
        x: [0, 1],
        flag: 4,
      },
    ]
    const filter = (d) => d.flag !== 4
    const extent = dataExtentFor(data, 'x', filter)
    expect(extent).toStrictEqual([undefined, undefined])
  })
})

import { dataExtentFor } from '../../src/Data/dataExtentFor'

describe('dataExtentFor', () => {
  it('scalar x valued data', () => {
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

  it('scalar x valued data with NaN', () => {
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

  it('array valued data', () => {
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

  it('data with Date', () => {
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
  it('unfiltered x valued data', () => {
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


  it('fiterscalar x valued data', () => {
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


  it('scalar x valued data', () => {
    const data = [
      {
        x: 999, flag: 4
      },
      {
        x: -1,
      },
      {
        x: 1,
      },
    ]
    const filter = (d: {flag?: number}) => d.flag !== 4
    const extent = dataExtentFor(data, 'x', filter)
    expect(extent).toStrictEqual([-1, 1])
  })

  it('all data filtered', () => {
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

  it('all flagged data', () => {
    const data = [
      {
        x: 999, flag: 4
      },
      {
        x: -1, flag: 4
      },
      {
        x: 1, flag: 4
      },
    ]
    const filter = (d) => d.flag !== 4
    const extent = dataExtentFor(data, 'x', filter)
    expect(extent).toStrictEqual([undefined, undefined])
  })
})


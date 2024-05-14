import { dataExtentFor } from '../../src/Data/dataExtentFor'

/**
 * Dummy test
 */
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

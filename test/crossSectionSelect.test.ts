import * as d3 from 'd3'
import { describe, expect, test } from 'vitest'
import { CrossSectionSelect } from '../src/Visitors/crossSectionSelect'

describe('CrossSectionSelect', () => {
  test('findNearestPoint backtracks to the previous non-null value', () => {
    const select = new CrossSectionSelect(0, () => {}, {})
    const xScale = d3.scaleLinear().domain([0, 10]).range([0, 100])
    const yScale = d3.scaleLinear().domain([0, 100]).range([100, 0])

    ;(select as any).axis = {
      xScales: [xScale],
      yScales: [yScale],
      chartsExtent: () => [0, 1],
    }

    const chart = {
      id: 'chart-1',
      data: [
        { x: 0, y: 10 },
        { x: 5, y: 20 },
        { x: 10, y: null },
      ],
      axisIndex: {
        x: { axisIndex: 0 },
        y: { axisIndex: 0 },
      },
      dataKeys: {
        x: 'x',
        y: 'y',
      },
      visible: true,
    } as any

    const point = select.findNearestPoint(chart, 80)

    expect(point).toMatchObject({
      id: 'chart-1',
      x: 50,
      y: 80,
      value: '20.00',
      d: { x: 5, y: 20 },
    })
  })
})

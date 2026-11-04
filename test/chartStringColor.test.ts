import { afterEach, describe, expect, test } from 'vite-plus/test'
import { AxisType, CartesianAxes, ChartBar, ChartMatrix } from '../src'
import type { DataPoint } from '../src/Data/types'

describe('charts colored by string values', () => {
  const data = [
    { x: 0, y: 1, color: 'red' },
    { x: 1, y: 2, color: 'blue' },
    { x: 2, y: 3, color: null },
  ] as unknown as DataPoint[]
  const options = { color: { map: (value: number | Date) => String(value) } }

  let container: HTMLDivElement | undefined

  afterEach(() => container?.remove())

  function fills(type: AxisType, chart: ChartBar | ChartMatrix) {
    container = document.createElement('div')
    document.body.append(container)
    const axes = new CartesianAxes(container, 400, 200, { x: [{ type }], y: [{ type }] })
    chart.addTo(
      axes,
      { x: { key: 'x', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 }, color: { key: 'color' } },
      'chart',
      '.chart',
    )
    axes.redraw({ x: { autoScale: true }, y: { autoScale: true } })
    const rects = axes.chartGroup.node()!.querySelectorAll('[data-chart-id="chart"] rect')
    return [...rects].map((rect) => rect.getAttribute('fill'))
  }

  test.each([
    ['ChartBar', () => fills(AxisType.value, new ChartBar(data, options))],
    ['ChartMatrix', () => fills(AxisType.band, new ChartMatrix(data, options))],
  ])('%s passes strings to the color map, and null is not filled', (_name, draw) => {
    const result = draw()
    expect(result).toContain('red')
    expect(result).toContain('blue')
    expect(result).toContain('none')
    expect(result).not.toContain('null')
  })
})

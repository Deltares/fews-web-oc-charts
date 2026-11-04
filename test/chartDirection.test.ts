import { afterEach, describe, expect, test } from 'vite-plus/test'
import { AxisType, CartesianAxes, ChartDirection } from '../src'

describe('ChartDirection', () => {
  let container: HTMLDivElement | undefined
  let axes: CartesianAxes | undefined

  afterEach(() => {
    axes?.observer.disconnect()
    container?.remove()
  })

  test('handles pointer events on a cartesian axis', () => {
    container = document.createElement('div')
    document.body.append(container)
    axes = new CartesianAxes(container, 400, 200, {
      x: [{ type: AxisType.time }],
      y: [{ type: AxisType.degrees }],
    })
    const data = [0, 1, 2].map((i) => ({ x: new Date(Date.UTC(2025, 0, 1, i)), y: i * 90 }))
    const chart = new ChartDirection(data, {})
    chart.addTo(
      axes,
      { x: { key: 'x', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } },
      'chart',
      '.chart',
    )
    axes.redraw({ x: { autoScale: true }, y: { autoScale: true } })

    expect(() => chart.onPointerOver()).not.toThrow()
    const highlight = axes.canvas.select('.front').select('[data-chart-id="chart"] circle')
    expect(highlight.empty()).toBe(false)
    expect(highlight.style('opacity')).toBe('1')
    expect(() => chart.onPointerOut()).not.toThrow()
    expect(highlight.style('opacity')).toBe('0')
  })
})

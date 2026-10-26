import { afterEach, describe, expect, test } from 'vitest'
import { AxisType, CartesianAxes, ChartBar } from '../src'

describe('ChartBar', () => {
  let container: HTMLDivElement | undefined

  afterEach(() => container?.remove())

  function drawBars(axisIndex: Record<string, { key: string; axisIndex?: number }>) {
    container = document.createElement('div')
    container.style.width = '400px'
    container.style.height = '200px'
    document.body.append(container)

    const axes = new CartesianAxes(container, 400, 200, {
      x: [{ type: AxisType.time }],
      y: [{ type: AxisType.value }],
    })
    const data = [0, 1, 2, 3].map((i) => ({ x: new Date(Date.UTC(2025, 0, 1, i)), y: i + 1 }))
    new ChartBar(data, {}).addTo(axes, axisIndex, 'bars', { fill: 'rgb(0, 0, 255)' })
    axes.redraw({ x: { autoScale: true }, y: { autoScale: true } })
    return [...container.querySelectorAll<SVGRectElement>('[data-chart-id="bars"] rect')]
  }

  test('inherits the style fill when no color key is configured', () => {
    const rects = drawBars({ x: { key: 'x', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } })

    expect(rects.length).toBeGreaterThan(0)
    for (const rect of rects) {
      expect(rect.hasAttribute('fill')).toBe(false)
      expect(getComputedStyle(rect).fill).toBe('rgb(0, 0, 255)')
    }
  })

  test('uses the color map when a color key is configured', () => {
    const rects = drawBars({
      x: { key: 'x', axisIndex: 0 },
      y: { key: 'y', axisIndex: 0 },
      color: { key: 'y' },
    })

    expect(rects.length).toBeGreaterThan(0)
    for (const rect of rects) {
      expect(rect.getAttribute('fill')).not.toBe('none')
    }
  })
})

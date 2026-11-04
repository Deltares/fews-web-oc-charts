import { afterEach, describe, expect, test } from 'vite-plus/test'
import {
  AxisType,
  CartesianAxes,
  ChartProgress,
  ChartRange,
  ChartRule,
  ChartText,
  PolarAxes,
} from '../src'
import type { DataPoint } from '../src/Data/types'

describe('chart data accepted before v4.7.3', () => {
  let container: HTMLDivElement | undefined
  let axes: CartesianAxes | PolarAxes | undefined

  afterEach(() => {
    // Stop resize redraws, which can't start a transition in a detached container.
    axes?.observer.disconnect()
    container?.remove()
  })

  function createContainer() {
    container = document.createElement('div')
    document.body.append(container)
    return container
  }

  function createCartesianAxes(yType = AxisType.value) {
    const cartesian = new CartesianAxes(createContainer(), 400, 200, {
      x: [{ type: AxisType.time }],
      y: [{ type: yType }],
    })
    axes = cartesian
    return cartesian
  }

  test('ChartProgress draws string radial keys with date ranges, and redraws', async () => {
    const start = new Date(Date.UTC(2025, 0, 1, 0))
    const data = ['a', 'b'].map((x, i) => ({
      x,
      y: [start, new Date(Date.UTC(2025, 0, 1, i + 2))],
      v: i,
    })) as unknown as DataPoint[]
    const polar = new PolarAxes(createContainer(), 400, 400, {
      radial: { type: AxisType.band, domain: ['a', 'b'] },
      angular: { type: AxisType.time, domain: [start, new Date(Date.UTC(2025, 0, 1, 12))] },
    } as never)
    axes = polar
    const chart = new ChartProgress(data, {})
    chart.addTo(
      polar,
      {
        radial: { key: 'x', axisIndex: 0 },
        angular: { key: 'y', axisIndex: 0 },
        color: { key: 'v' },
      },
      'chart',
      '.chart',
    )
    polar.redraw()

    const paths = () => [
      ...polar.chartGroup.node()!.querySelectorAll('[data-chart-id="chart"] path'),
    ]
    expect(paths().length).toBe(2)
    for (const path of paths()) expect(path.getAttribute('d')).toMatch(/^M[^N]+$/)
    expect(paths().map((path) => path.getAttribute('data-chart-element-id'))).toEqual(['a', 'b'])
    expect((paths()[1] as SVGElement).style.fill).not.toBe('')

    // A redraw transitions from the previous data, which must also accept these values.
    polar.redraw()
    await new Promise((resolve) => setTimeout(resolve, 200))
    for (const path of paths()) expect(path.getAttribute('d')).toMatch(/^M[^N]+$/)
    expect(data[0].x).toBe('a')
    expect((data[1].y as unknown as Date[])[1]).toBeInstanceOf(Date)
  })

  test('ChartText draws without a y key', () => {
    const cartesian = createCartesianAxes()
    const data = [0, 1, 2].map((i) => ({
      x: new Date(Date.UTC(2025, 0, 1, i)),
      label: `label ${i}`,
    })) as unknown as DataPoint[]
    new ChartText(data, {}).addTo(
      cartesian,
      { x: { key: 'x', axisIndex: 0 }, value: { key: 'label' } },
      'chart',
      '.chart',
    )
    cartesian.redraw({ x: { autoScale: true } })

    const texts = [...cartesian.chartGroup.node()!.querySelectorAll('[data-chart-id="chart"] text')]
    expect(texts.map((text) => text.textContent)).toEqual(['label 0', 'label 1', 'label 2'])
  })

  test('ChartRange draws date ranges', () => {
    const cartesian = createCartesianAxes()
    const data = [
      { x: [new Date(Date.UTC(2025, 0, 1)), new Date(Date.UTC(2025, 0, 2))], y: [1, 2] },
    ] as unknown as DataPoint[]
    new ChartRange(data, {}).addTo(
      cartesian,
      { x: { key: 'x', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } },
      'chart',
      '.chart',
    )
    expect(() => cartesian.redraw({ x: { autoScale: true }, y: { autoScale: true } })).not.toThrow()
    expect(
      cartesian.chartGroup.node()!.querySelectorAll('[data-chart-id="chart"] rect').length,
    ).toBe(1)
  })

  test('ChartRule draws date ranges', () => {
    const cartesian = createCartesianAxes(AxisType.time)
    const data = [
      {
        x: new Date(Date.UTC(2025, 0, 1)),
        y: [new Date(Date.UTC(2025, 0, 1)), new Date(Date.UTC(2025, 0, 2))],
      },
      {
        x: new Date(Date.UTC(2025, 0, 2)),
        y: [new Date(Date.UTC(2025, 0, 2)), new Date(Date.UTC(2025, 0, 3))],
      },
    ] as unknown as DataPoint[]
    new ChartRule(data, {}).addTo(
      cartesian,
      { x: { key: 'x', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } },
      'chart',
      '.chart',
    )
    expect(() => cartesian.redraw({ x: { autoScale: true }, y: { autoScale: true } })).not.toThrow()
    expect(
      cartesian.chartGroup.node()!.querySelectorAll('[data-chart-id="chart"] line').length,
    ).toBeGreaterThan(0)
  })
})

import { afterEach, describe, expect, test } from 'vitest'
import { AxisType, CartesianAxes, ChartBar, ChartMatrix } from '../src'

describe('chart group class', () => {
  const containers: HTMLDivElement[] = []

  afterEach(() => containers.splice(0).forEach((container) => container.remove()))

  function createAxes(type: AxisType) {
    const container = document.createElement('div')
    document.body.append(container)
    containers.push(container)
    return new CartesianAxes(container, 400, 200, { x: [{ type }], y: [{ type }] })
  }

  function drawBar(style: string) {
    const axes = createAxes(AxisType.time)
    const data = [0, 1, 2, 3].map((i) => ({ x: new Date(Date.UTC(2025, 0, 1, i)), y: i + 1 }))
    new ChartBar(data, {}).addTo(
      axes,
      { x: { key: 'x', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } },
      'chart',
      style,
    )
    axes.redraw({ x: { autoScale: true }, y: { autoScale: true } })
    return axes.chartGroup.node()!.querySelector('[data-chart-id="chart"]')!
  }

  function drawMatrix(style: string) {
    const axes = createAxes(AxisType.band)
    const data = [0, 1].map((x) => ({ x, y: 0, color: 1 }))
    new ChartMatrix(data, {}).addTo(
      axes,
      { x: { key: 'x', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 }, color: { key: 'color' } },
      'chart',
      style,
    )
    axes.redraw({ x: { autoScale: true }, y: { autoScale: true } })
    return axes.chartGroup.node()!.querySelector('[data-chart-id="chart"]')!
  }

  test.each([
    ['ChartBar', 'chart-bar', drawBar],
    ['ChartMatrix', 'chart-matrix', drawMatrix],
  ])('%s adds its group class', (_name, groupClass, draw) => {
    expect(draw('.foo').getAttribute('class')).toBe(`${groupClass} foo`)
    expect(draw('#foo').getAttribute('class')).toBe(groupClass)
  })
})

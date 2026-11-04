import { afterEach, describe, expect, test, vi } from 'vite-plus/test'
import {
  AxisType,
  CartesianAxes,
  ChartArrow,
  ChartBar,
  ChartLine,
  ChartRange,
  PolarAxes,
} from '../src'
import type { ChartArrowData } from '../src'

describe('charts set valid SVG attributes', () => {
  let container: HTMLDivElement | undefined
  let axes: CartesianAxes | PolarAxes | undefined

  afterEach(() => {
    axes?.observer.disconnect()
    container?.remove()
  })

  function createContainer() {
    container = document.createElement('div')
    document.body.append(container)
    return container
  }

  function createPolarAxes() {
    const polar = new PolarAxes(createContainer(), 400, 400, {
      radial: { type: AxisType.value, domain: [0, 1] },
      angular: { type: AxisType.value, domain: [0, 360] },
    } as never)
    axes = polar
    return polar
  }

  function arrowElement(polar: PolarAxes, data: ChartArrowData[]) {
    new ChartArrow(data, { transitionTime: 0 }).addTo(
      polar,
      { radial: { key: 'x', axisIndex: 0 }, angular: { key: 'y', axisIndex: 0 } },
      'chart',
      '.chart',
    )
    polar.redraw()
    return polar.chartGroup.node()!.querySelector('[data-chart-id="chart"] path')!
  }

  async function nextTransition() {
    await new Promise((resolve) => setTimeout(resolve, 50))
  }

  test('ChartLine positions its highlight with the configured keys', () => {
    const cartesian = new CartesianAxes(createContainer(), 400, 200, {
      x: [{ type: AxisType.value, domain: [0, 10] }],
      y: [{ type: AxisType.value, domain: [0, 10] }],
    })
    axes = cartesian
    const data = [
      { time: 1, level: 2 },
      { time: 5, level: 6 },
      { time: 9, level: 3 },
    ]
    const chart = new ChartLine(data, {})
    chart.addTo(
      cartesian,
      { x: { key: 'time', axisIndex: 0 }, y: { key: 'level', axisIndex: 0 } },
      'chart',
      '.chart',
    )
    cartesian.redraw({ x: { autoScale: true }, y: { autoScale: true } })
    const xScale = cartesian.xScales[0]
    const yScale = cartesian.yScales[0]

    chart.onPointerOver()
    const result = chart.onPointerMove(5, 'x', xScale, yScale)

    const circle = cartesian.canvas.select('.front').select('[data-chart-id="chart"] circle')
    expect(circle.attr('transform')).toBe(`translate(${xScale(5)}, ${yScale(6)})`)
    expect(result).toMatchObject({ point: { x: 5, y: 6, time: 5, level: 6 } })
  })

  test('ChartBar positions its highlight with the configured keys', () => {
    const cartesian = new CartesianAxes(createContainer(), 400, 200, {
      x: [{ type: AxisType.value }],
      y: [{ type: AxisType.value }],
    })
    axes = cartesian
    const data = [
      { time: 1, level: 2 },
      { time: 5, level: 6 },
      { time: 9, level: 3 },
    ]
    const chart = new ChartBar(data, {})
    chart.addTo(
      cartesian,
      { x: { key: 'time', axisIndex: 0 }, y: { key: 'level', axisIndex: 0 } },
      'chart',
      '.chart',
    )
    cartesian.redraw({ x: { autoScale: true }, y: { autoScale: true } })
    const yScale = cartesian.yScales[0]

    const result = chart.onPointerMove(5, 'x', cartesian.xScales[0], yScale)

    const rect = cartesian.canvas.select('.front').select('[data-chart-id="chart"] rect')
    expect(Number(rect.attr('height'))).toBeCloseTo(Math.abs(yScale(0) - yScale(6)))
    expect(result).toMatchObject({ point: { x: 5, y: 6 } })
  })

  test('ChartRange rects have no negative size on a reversed y axis', () => {
    const cartesian = new CartesianAxes(createContainer(), 400, 200, {
      x: [{ type: AxisType.value }],
      y: [{ type: AxisType.value }],
    })
    axes = cartesian
    const data = [{ x: [1, 2], y: [2, 3] }]
    new ChartRange(data, { transitionTime: 0 }).addTo(
      cartesian,
      { x: { key: 'x', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } },
      'chart',
      '.chart',
    )
    cartesian.yScales[0].domain([0, 4]).range([0, 100])
    cartesian.xScales[0].domain([0, 4]).range([100, 0])
    const chart = cartesian.charts[0]
    chart.plotter(cartesian, chart.axisIndex)

    const rect = cartesian.chartGroup.node()!.querySelector('[data-chart-id="chart"] rect')!
    expect(Number(rect.getAttribute('height'))).toBe(25)
    expect(Number(rect.getAttribute('y'))).toBe(50)
    expect(Number(rect.getAttribute('width'))).toBe(25)
    expect(Number(rect.getAttribute('x'))).toBe(50)
  })

  test('ChartArrow is positioned on its first draw', async () => {
    const setAttribute = vi.spyOn(Element.prototype, 'setAttribute')
    const path = arrowElement(createPolarAxes(), [{ x: [0, 1], y: [90, 90] }])
    await nextTransition()
    const transforms = setAttribute.mock.calls.filter(([name]) => name === 'transform')
    setAttribute.mockRestore()
    expect(transforms.map(([, value]) => value)).not.toContain('translate()')
    expect(path.getAttribute('transform')).toMatch(/^translate\(-?\d[^,]*,-?\d[^)]*\) rotate\(/)
  })

  test('ChartArrow draws nothing for null values', async () => {
    const data = [{ x: [0, 1], y: [null, null] }] as unknown as ChartArrowData[]
    const path = arrowElement(createPolarAxes(), data)
    await nextTransition()
    expect(path.getAttribute('d') ?? '').toBe('')
    expect(path.getAttribute('transform') ?? '').toBe('')
  })
})

import { afterEach, describe, expect, test } from 'vitest'
import {
  angular,
  createPlot,
  createPolarPlot,
  linear,
  radial,
  range,
  type Plot,
} from '../../src/index.js'

const plots: Plot[] = []
const hosts: HTMLElement[] = []

function create(host: HTMLElement, config: Parameters<typeof createPlot>[1]) {
  const plot = createPlot(host, config)
  plots.push(plot)
  return plot
}

function host() {
  const element = document.createElement('div')
  element.style.width = '400px'
  element.style.height = '240px'
  document.body.append(element)
  hosts.push(element)
  return element
}

async function frame() {
  await new Promise(requestAnimationFrame)
  await new Promise(requestAnimationFrame)
}

afterEach(() => {
  plots.splice(0).forEach((plot) => plot.destroy())
  hosts.splice(0).forEach((element) => element.remove())
})

describe('band marks', () => {
  test('renders x/y intervals as clipped rectangles and contributes their bounds to autoscale', async () => {
    const mark = range({
      id: 'intervals',
      x: 'x',
      y: 'y',
      xValues: [[1, 2], [3, 5], null],
      yValues: [
        [4, 8],
        [0, 2],
        [100, 200],
      ],
      fill: '#1677a6',
      opacity: 0.4,
    })
    const plot = create(host(), {
      width: 400,
      height: 240,
      scales: { x: linear(), y: linear() },
      directions: { x: 'x' },
      marks: [mark],
    })
    await frame()

    expect(plot.scales.x.scale.domain.get()).toEqual([1, 5])
    expect(plot.scales.y.scale.domain.get()).toEqual([0, 8])
    const group = plot.element.querySelector<SVGGElement>('[data-mark="band"]')
    expect(group?.dataset.markId).toBe('intervals')
    expect(group?.getAttribute('fill')).toBe('#1677a6')
    expect(group?.getAttribute('fill-opacity')).toBe('0.4')
    const rects = [...plot.element.querySelectorAll<SVGRectElement>('[data-mark="band-range"]')]
    expect(rects).toHaveLength(2)
    expect(rects[0]?.getAttribute('x')).toBe(String(plot.scales.x.project(1)))
    expect(rects[0]?.getAttribute('y')).toBe(String(plot.scales.y.project(8)))
    expect(rects[0]?.getAttribute('width')).toBe(
      String(plot.scales.x.project(2) - plot.scales.x.project(1)),
    )
    expect(rects[0]?.getAttribute('height')).toBe(
      String(plot.scales.y.project(4) - plot.scales.y.project(8)),
    )
    expect(plot.element.querySelector('[data-layer="marks"]')?.getAttribute('clip-path')).toMatch(
      /^url\(#fews-plot-clip-/,
    )
  })

  test('reprojects ranges when a scale changes and reuses the SVG nodes', async () => {
    const plot = create(host(), {
      width: 400,
      height: 240,
      scales: {
        x: linear({ domain: [0, 10] }),
        y: linear({ domain: [0, 10] }),
      },
      directions: { x: 'x' },
      marks: [
        range({
          x: 'x',
          y: 'y',
          xValues: [[2, 4]],
          yValues: [[3, 7]],
        }),
      ],
    })
    await frame()

    const rect = plot.element.querySelector<SVGRectElement>('[data-mark="band-range"]')!
    const original = rect.getAttribute('x')
    plot.scales.x.scale.domain.set([0, 20])
    await frame()
    expect(rect.getAttribute('x')).not.toBe(original)
    expect(plot.element.querySelector('[data-mark="band-range"]')).toBe(rect)
  })

  test('renders polar ranges as annular sectors', async () => {
    const element = host()
    const plot = createPolarPlot(element, {
      width: 400,
      height: 240,
      scales: {
        theta: angular({ domain: [0, 360] }),
        distance: radial({ domain: [0, 10] }),
      },
      marks: [
        range({
          x: 'theta',
          y: 'distance',
          xValues: [[30, 90]],
          yValues: [[2, 4]],
        }),
      ],
    })
    plots.push(plot)
    await frame()

    const path = plot.element.querySelector<SVGPathElement>('[data-mark="band-range"]')
    const region = plot.regions.get().plot
    const group = plot.element.querySelector<SVGGElement>('[data-mark="band"]')
    expect(path?.getAttribute('d')).toContain('A')
    expect(group?.getAttribute('transform')).toBe(
      `translate(${region.x + region.width / 2},${region.y + region.height / 2})`,
    )
  })

  test('validates range values, lengths, and scale bindings', () => {
    expect(() => range({ x: 'x', y: 'y', xValues: [[2, 1]], yValues: [[0, 1]] })).toThrow(
      /ascending pair/,
    )
    expect(() => range({ x: 'x', y: 'y', xValues: [[0, 1]], yValues: [] })).toThrow(/equal lengths/)

    expect(() =>
      create(host(), {
        scales: { x: linear(), y: linear() },
        directions: { x: 'x', y: 'x' },
        marks: [range({ x: 'x', y: 'y', xValues: [[0, 1]], yValues: [[0, 1]] })],
      }),
    ).toThrow(/y-direction/)

    expect(() =>
      create(host(), {
        scales: { x: linear(), y: linear() },
        directions: { x: 'x' },
        marks: [range({ x: 'x', y: 'missing', xValues: [[0, 1]], yValues: [[0, 1]] })],
      }),
    ).toThrow(/missing x or y scale/)
  })
})

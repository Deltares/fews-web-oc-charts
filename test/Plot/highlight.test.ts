import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  bandScale,
  bar,
  createPlot,
  createTable,
  crosshair,
  highlight,
  line,
  linearScale,
  stackedArea,
  type Plot,
} from '../../src/index.js'

const plots: Plot[] = []
const hosts: HTMLElement[] = []

async function frame() {
  await new Promise(requestAnimationFrame)
  await new Promise(requestAnimationFrame)
}

function host() {
  const element = document.createElement('div')
  document.body.append(element)
  hosts.push(element)
  return element
}

async function pointer(plot: Plot, type: string, x: number, y: number) {
  plot.element.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, isPrimary: true }))
  await frame()
}

function highlights(plot: Plot) {
  return [...plot.element.querySelectorAll('[data-layer="highlight"] [data-highlight]')]
}

afterEach(() => {
  for (const plot of plots.splice(0)) plot.destroy()
  for (const element of hosts.splice(0)) element.remove()
  vi.restoreAllMocks()
})

describe('highlight plugin', () => {
  test('marks the nearest line samples and hides when the pointer leaves', async () => {
    const observed = line({
      id: 'observed',
      x: 't',
      y: 'q',
      xValues: [0, 5, 10],
      yValues: [1, 20, 3],
    })
    const forecast = line({
      id: 'forecast',
      x: 't',
      y: 'q',
      xValues: [0, 4, 10],
      yValues: [2, 30, 4],
      stroke: 'red',
    })
    const handle = highlight()
    const plot = createPlot(host(), {
      width: 500,
      height: 300,
      directions: { t: 'x', q: 'y' },
      scales: { t: linearScale({ domain: [0, 10] }), q: linearScale({ domain: [0, 40] }) },
      marks: [observed, forecast],
      plugins: [handle],
    })
    plots.push(plot)
    await frame()
    vi.spyOn(plot.element, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 500, 300))

    const layer = plot.element.querySelector('[data-layer="highlight"]')!
    const marks = plot.element.querySelector('[data-layer="marks"]')!
    expect(marks.compareDocumentPosition(layer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(layer.getAttribute('pointer-events')).toBe('none')

    await pointer(plot, 'pointermove', plot.scales.t.project(5), plot.scales.q.project(10))
    const circles = highlights(plot)
    expect(circles.map((node) => node.tagName)).toEqual(['circle', 'circle'])
    expect(Number(circles[0].getAttribute('cx'))).toBeCloseTo(plot.scales.t.project(5))
    expect(Number(circles[0].getAttribute('cy'))).toBeCloseTo(plot.scales.q.project(20))
    expect(Number(circles[1].getAttribute('cx'))).toBeCloseTo(plot.scales.t.project(4))
    expect(circles[1].getAttribute('fill')).toBe('red')

    handle.update({ marks: [forecast] })
    await frame()
    expect(highlights(plot)).toHaveLength(1)

    await pointer(plot, 'pointerleave', 0, 0)
    expect(highlights(plot)).toHaveLength(0)
    expect(layer.getAttribute('display')).toBe('none')

    plot.update({ plugins: [] })
    await frame()
    expect(plot.element.querySelector('[data-layer="highlight"]')).toBeNull()
  })

  test('outlines the hovered bar rectangle', async () => {
    const mark = bar(createTable({ t: ['one'], observed: [3], forecast: [4] }), {
      id: 'flow',
      x: 't',
      scales: { x: 't', y: 'q' },
      layers: [
        { id: 'observed', y: 'observed', stack: 'total', fill: 'green' },
        { id: 'forecast', y: 'forecast', stack: 'total', fill: 'blue' },
      ],
      layout: 'stacked',
    })
    const plot = createPlot(host(), {
      width: 100,
      height: 100,
      margins: { top: 0, right: 0, bottom: 0, left: 0 },
      scales: { t: bandScale({ domain: ['one'] }), q: linearScale({ domain: [0, 7] }) },
      marks: [mark],
      plugins: [highlight({ axis: 'xy' })],
    })
    plots.push(plot)
    await frame()
    vi.spyOn(plot.element, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 100, 100))
    const rectangle = plot.element.querySelector<SVGRectElement>('[data-layer-id="forecast"]')!
    const attribute = (name: string) => Number(rectangle.getAttribute(name))
    await pointer(
      plot,
      'pointermove',
      attribute('x') + attribute('width') / 2,
      attribute('y') + attribute('height') / 2,
    )
    const [node] = highlights(plot)
    expect(highlights(plot)).toHaveLength(1)
    expect(node.tagName).toBe('rect')
    for (const name of ['x', 'y', 'width', 'height']) {
      expect(Number(node.getAttribute(name))).toBeCloseTo(attribute(name))
    }
    expect(node.getAttribute('fill')).toBe('blue')
    expect(node.getAttribute('stroke')).toBe('currentColor')
  })

  test('draws the stacked-area slice around the hovered sample', async () => {
    const mark = stackedArea(
      createTable({ t: [0, 1, 2], observed: [2, 2, 2], forecast: [3, 3, 3] }),
      {
        id: 'flow',
        x: 't',
        scales: { x: 't', y: 'q' },
        layers: [
          { id: 'observed', y: 'observed', stack: 'total' },
          { id: 'forecast', y: 'forecast', stack: 'total' },
        ],
      },
    )
    const guide = crosshair({ mode: 'x', snap: { mark, axis: 'x' } })
    const plot = createPlot(host(), {
      width: 100,
      height: 100,
      margins: { top: 0, right: 0, bottom: 0, left: 0 },
      scales: { t: linearScale({ domain: [0, 2] }), q: linearScale({ domain: [0, 5] }) },
      marks: [mark],
      plugins: [guide, highlight({ crosshair: guide })],
    })
    plots.push(plot)
    await frame()
    vi.spyOn(plot.element, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 100, 100))
    await pointer(plot, 'pointermove', plot.scales.t.project(1), 50)
    const paths = highlights(plot)
    expect(paths.map((node) => node.tagName)).toEqual(['path', 'path'])
    const numbers = paths[1]
      .getAttribute('d')!
      .match(/-?\d+(\.\d+)?/g)!
      .map(Number)
    const xs = numbers.filter((_, index) => index % 2 === 0)
    expect(Math.min(...xs)).toBeCloseTo(plot.scales.t.project(0.5))
    expect(Math.max(...xs)).toBeCloseTo(plot.scales.t.project(1.5))
  })

  test('validates options and plot integration', () => {
    expect(() => highlight({ axis: 'z' as never })).toThrow('highlight.axis')
    expect(() => highlight({ crosshair: {} })).toThrow('highlight.crosshair')
    const mark = line({ x: 't', y: 'q', xValues: [0], yValues: [0] })
    const directions = { t: 'x', q: 'y' } as const
    const scales = { t: linearScale({ domain: [0, 1] }), q: linearScale({ domain: [0, 1] }) }
    expect(() =>
      createPlot(host(), {
        directions,
        scales,
        marks: [],
        plugins: [highlight({ marks: [mark] })],
      }),
    ).toThrow('highlight.marks must be included in plot.marks.')
    expect(() =>
      createPlot(host(), {
        directions,
        scales,
        marks: [mark],
        plugins: [highlight(), highlight()],
      }),
    ).toThrow('at most one highlight plugin')
    expect(() =>
      createPlot(host(), {
        directions,
        scales,
        marks: [mark],
        plugins: [highlight({ crosshair: crosshair() })],
      }),
    ).toThrow('highlight.crosshair must be included in plot.plugins.')
  })
})

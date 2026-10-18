import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  angular,
  axis,
  band,
  createPlot,
  createPolarPlot,
  line,
  linear,
  radial,
  time,
  type Plot,
} from '../../src/index.js'

const plots: Plot[] = []
const hosts: HTMLElement[] = []

function host(width = 640, height = 360) {
  const element = document.createElement('div')
  element.style.width = `${width}px`
  element.style.height = `${height}px`
  document.body.append(element)
  hosts.push(element)
  return element
}

function plot(...args: Parameters<typeof createPlot>) {
  const result = createPlot(...args)
  plots.push(result)
  return result
}

async function frame() {
  await new Promise(requestAnimationFrame)
  await new Promise(requestAnimationFrame)
}

afterEach(() => {
  for (const current of plots.splice(0)) current.destroy()
  for (const element of hosts.splice(0)) element.remove()
  vi.restoreAllMocks()
})

describe('static line marks', () => {
  test('updates theme and colour attributes without projecting points or rewriting paths', async () => {
    const element = host()
    const current = plot(element, {
      theme: 'light',
      themeElement: element,
      scales: { x: linear(), y: linear() },
      directions: { x: 'x' },
      marks: [
        line({ x: 'x', y: 'y', xValues: [0, 1], yValues: [0, 1] }),
        line({
          x: 'x',
          y: 'y',
          xValues: [0, 1],
          yValues: [1, 0],
          stroke: '#1677a6',
          strokeWidth: 3,
        }),
      ],
    })
    await frame()
    const paths = [...current.element.querySelectorAll<SVGPathElement>('[data-mark="line"]')]
    const geometry = paths.map((path) => path.getAttribute('d'))
    const attributes = paths.map((path) => vi.spyOn(path, 'setAttribute'))
    const projectX = vi.spyOn(current.scales.x, 'project')
    const projectY = vi.spyOn(current.scales.y, 'project')

    current.update({ theme: 'dark' })
    await frame()
    expect(paths[0].getAttribute('stroke')).toContain('#66c2ff')
    expect(paths[1].getAttribute('stroke')).toBe('#1677a6')
    expect(paths[1].getAttribute('stroke-width')).toBe('3')

    element.style.setProperty('--fews-chart-accent', '#ff0000')
    await vi.waitFor(() => expect(paths[0].getAttribute('stroke')).toContain('#ff0000'))
    expect(paths[1].getAttribute('stroke')).toBe('#1677a6')
    expect(projectX).not.toHaveBeenCalled()
    expect(projectY).not.toHaveBeenCalled()
    expect(paths.map((path) => path.getAttribute('d'))).toEqual(geometry)
    paths.forEach((path, index) => {
      expect(current.element.querySelectorAll('[data-mark="line"]')[index]).toBe(path)
      expect(
        attributes[index].mock.calls.every(
          ([name]) => name === 'stroke' || name === 'stroke-width',
        ),
      ).toBe(true)
    })
  })

  test('rebuilds geometry and applies styles for layout and coalesced scale/theme changes', async () => {
    const element = host()
    const x = linear()
    const current = plot(element, {
      theme: 'light',
      themeElement: element,
      scales: { x, y: linear() },
      axes: [axis('x', { position: 'bottom' }), axis('y')],
      marks: [line({ x: 'x', y: 'y', xValues: [0, 1], yValues: [0, 1] })],
    })
    await frame()
    const path = current.element.querySelector<SVGPathElement>('[data-mark="line"]')!
    const original = path.getAttribute('d')
    const attributes = vi.spyOn(path, 'setAttribute')
    const projectX = vi.spyOn(current.scales.x, 'project')

    element.style.setProperty('--fews-chart-font-size', '24px')
    await vi.waitFor(() => expect(path.getAttribute('d')).not.toBe(original))
    expect(projectX).toHaveBeenCalled()
    expect(attributes.mock.calls.some(([name]) => name === 'd')).toBe(true)

    attributes.mockClear()
    x.domain.set([0, 2])
    current.update({ theme: 'dark' })
    await frame()
    expect(path.getAttribute('d')).toBe(
      `M${current.scales.x.project(0)},${current.scales.y.project(0)}` +
        `L${current.scales.x.project(1)},${current.scales.y.project(1)}`,
    )
    expect(attributes.mock.calls.filter(([name]) => name === 'd')).toHaveLength(1)
    expect(path.getAttribute('stroke')).toContain('#66c2ff')

    current.update({
      marks: [
        line({
          id: 'replacement',
          x: 'x',
          y: 'y',
          xValues: [0, 2],
          yValues: [1, 0],
          stroke: '#1677a6',
          strokeWidth: 3,
        }),
      ],
    })
    await frame()
    expect(path.getAttribute('data-mark-id')).toBe('replacement')
    expect(path.getAttribute('stroke')).toBe('#1677a6')
    expect(path.getAttribute('stroke-width')).toBe('3')
    expect(path.getAttribute('d')).toBe(
      `M${current.scales.x.project(0)},${current.scales.y.project(1)}` +
        `L${current.scales.x.project(2)},${current.scales.y.project(0)}`,
    )
  })

  test('renders named time/value scales, a secondary axis, and missing-value gaps', async () => {
    const t = time({ domain: [0, 3], timeZone: 'UTC' })
    const q = linear({ domain: [0, 100] })
    const rain = linear({ domain: [0, 10] })
    const discharge = line({
      id: 'discharge',
      x: 't',
      y: 'q',
      xValues: [0, 1, 2, 3],
      yValues: [0, 50, Number.NaN, 100],
      stroke: '#1677a6',
    })
    const rainfall = line({
      id: 'rainfall',
      x: 't',
      y: 'rain',
      xValues: [0, 3],
      yValues: [2, 8],
      stroke: '#d17b0f',
    })
    const current = plot(host(), {
      scales: { t, q, rain },
      axes: [
        axis('t', { position: 'bottom', tickCount: 3 }),
        axis('q', { position: 'left' }),
        axis('rain', { position: 'right' }),
      ],
      marks: [discharge, rainfall],
    })
    await frame()

    const paths = current.element.querySelectorAll<SVGPathElement>(
      '[data-layer="marks"] path[data-mark="line"]',
    )
    const first = paths[0]
    const second = paths[1]
    if (!first || !second) throw new Error('Expected both line marks to render.')
    expect(first.getAttribute('data-mark-id')).toBe('discharge')
    expect(first.getAttribute('stroke')).toBe('#1677a6')
    expect(first.getAttribute('d')).toBe(
      `M${current.scales.t.project(0)},${current.scales.q.project(0)}` +
        `L${current.scales.t.project(1)},${current.scales.q.project(50)}` +
        `M${current.scales.t.project(3)},${current.scales.q.project(100)}`,
    )
    expect(second.getAttribute('data-mark-id')).toBe('rainfall')
    expect(second.getAttribute('d')).toContain('L')
    expect(current.element.querySelectorAll('[data-layer="axes"] > g')).toHaveLength(3)
    expect(
      current.element.querySelector('[data-layer="marks"]')?.getAttribute('clip-path'),
    ).toMatch(/^url\(#fews-plot-clip-/)

    t.domain.set([0, 6])
    await frame()
    expect(first.getAttribute('d')).toContain(`${current.scales.t.project(1)}`)
  })

  test('updates and removes marks atomically with plot configuration', async () => {
    const mark = line({ id: 'one', x: 'x', y: 'y', xValues: [0, 1], yValues: [1, 2] })
    const current = plot(host(), {
      scales: { x: linear({ domain: [0, 1] }), y: linear({ domain: [0, 2] }) },
      directions: { x: 'x' },
      marks: [mark],
    })
    await frame()
    expect(current.element.querySelectorAll('[data-mark="line"]')).toHaveLength(1)

    expect(() =>
      current.update({
        marks: [line({ x: 'missing', y: 'y', xValues: [0], yValues: [1] })],
      }),
    ).toThrow(/missing x or y scale/)
    expect(current.options.get().resolved.marks).toEqual([mark])

    current.update({ marks: [] })
    await frame()
    expect(current.element.querySelectorAll('[data-mark="line"]')).toHaveLength(0)
  })

  test('synchronously rejects values that do not match their bound scale kind', async () => {
    const mark = line({ id: 'one', x: 'x', y: 'y', xValues: [0, 1], yValues: [1, 2] })
    const current = plot(host(), {
      scales: { x: linear({ domain: [0, 1] }), y: linear({ domain: [0, 2] }) },
      directions: { x: 'x' },
      marks: [mark],
    })
    await frame()
    const path = current.element.querySelector('[data-mark="line"]')!
    const rendered = path.getAttribute('d')

    expect(() =>
      current.update({
        marks: [line({ id: 'bad', x: 'x', y: 'y', xValues: [0, 1], yValues: [1, 'high'] })],
      }),
    ).toThrow(/line "bad" yValues\[1\] must be a number for linear scale "y"/)
    expect(current.options.get().resolved.marks).toEqual([mark])
    await frame()
    expect(path.getAttribute('d')).toBe(rendered)

    expect(() => current.update({ scales: { x: band({ domain: ['a', 'b'] }) } })).toThrow(
      /xValues\[0\] must be a string for band scale "x"/,
    )
    expect(() =>
      plot(host(), {
        scales: { x: time({ domain: [0, 1] }), y: linear() },
        directions: { x: 'x' },
        marks: [line({ x: 'x', y: 'y', xValues: ['2024-01-01'], yValues: [1] })],
      }),
    ).toThrow(/xValues\[0\] must be a number for time scale "x"/)

    current.update({
      scales: { x: band({ domain: ['a', 'b'] }) },
      marks: [line({ x: 'x', y: 'y', xValues: ['a', null, 'b'], yValues: [1, 2, Number.NaN] })],
    })
    await frame()
    expect(path.getAttribute('d')).toMatch(/^M[^L]+$/)
  })

  test('validates line values and rejects polar use', () => {
    expect(() => line({ x: 'x', y: 'y', xValues: [0], yValues: [] })).toThrow(/equal lengths/)
    expect(() => line({ x: 'x', y: 'y', xValues: [0], yValues: [1], strokeWidth: 0 })).toThrow(
      /positive finite/,
    )
    const invalid = {
      x: 'x',
      y: 'y',
      xValues: [0],
      yValues: [1],
      unexpected: true,
    }
    expect(() => line(invalid)).toThrow(/line.unexpected/)

    const element = host()
    expect(() =>
      createPolarPlot(element, {
        scales: { theta: angular(), radius: radial() },
        marks: [line({ x: 'theta', y: 'radius', xValues: [0], yValues: [1] })],
      }),
    ).toThrow(/cartesian plots only/)
  })
})

import { afterEach, describe, expect, test } from 'vitest'
import {
  angular,
  axis,
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
})

describe('static line marks', () => {
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

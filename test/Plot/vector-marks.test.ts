import { afterEach, describe, expect, test } from 'vitest'
import {
  angular,
  arrows,
  createPlot,
  createPolarPlot,
  direction,
  linear,
  radial,
  type Plot,
} from '../../src/index.js'

const plots: Plot[] = []
const hosts: HTMLElement[] = []

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
  for (const current of plots.splice(0)) current.destroy()
  for (const element of hosts.splice(0)) element.remove()
})

describe('arrow and direction marks', () => {
  test('renders Cartesian vectors and bearing glyphs, retaining gaps and autoscale extents', async () => {
    const current = createPlot(host(), {
      scales: { x: linear(), y: linear() },
      directions: { x: 'x' },
      marks: [
        arrows({
          id: 'vectors',
          x: 'x',
          y: 'y',
          xValues: [2, null],
          yValues: [3, 4],
          xEndValues: [8, 9],
          yEndValues: [7, 10],
        }),
        direction({
          id: 'bearings',
          x: 'x',
          y: 'y',
          xValues: [3, 5],
          yValues: [4, 6],
          directionValues: [0, 90],
          size: 12,
        }),
      ],
    })
    plots.push(current)
    await frame()

    expect(current.scales.x.scale.domain.get()).toEqual([2, 8])
    expect(current.scales.y.scale.domain.get()).toEqual([3, 7])

    const vectorGroup = current.element.querySelector<SVGGElement>('[data-mark="arrows"]')!
    expect(vectorGroup.dataset.markId).toBe('vectors')
    const [vector, gap] = [...vectorGroup.children] as SVGGElement[]
    expect(vector.querySelector('[data-mark="arrows-shaft"]')?.getAttribute('x1')).toBe(
      String(current.scales.x.project(2)),
    )
    expect(vector.querySelector('[data-mark="arrows-head"]')?.getAttribute('d')).toContain(
      `M${current.scales.x.project(8)},${current.scales.y.project(7)}`,
    )
    expect(gap.getAttribute('display')).toBe('none')

    const directionHead = current.element.querySelector<SVGPathElement>(
      '[data-mark="direction-head"]',
    )!
    const originX = current.scales.x.project(3)
    const originY = current.scales.y.project(4)
    expect(directionHead.getAttribute('d')).toContain(`M${originX},${originY + 12}`)
    expect(
      current.element.querySelector('[data-mark="direction"]')?.getAttribute('data-mark-id'),
    ).toBe('bearings')
  })

  test('projects polar arrow endpoints with the plot angular convention and renders polar bearings', async () => {
    const current = createPolarPlot(host(), {
      scales: {
        bearing: angular({
          domain: [0, 360],
          direction: 'anticlockwise',
          intercept: Math.PI / 4,
        }),
        distance: radial({ domain: [0, 10] }),
      },
      marks: [
        arrows({
          x: 'bearing',
          y: 'distance',
          xValues: [30],
          yValues: [2],
          xEndValues: [90],
          yEndValues: [6],
        }),
        direction({
          x: 'bearing',
          y: 'distance',
          xValues: [0],
          yValues: [5],
          directionValues: [90],
        }),
      ],
    })
    plots.push(current)
    await frame()

    const start = current.project(30, 2)
    const end = current.project(90, 6)
    const shaft = current.element.querySelector<SVGLineElement>('[data-mark="arrows-shaft"]')!
    const head = current.element.querySelector<SVGPathElement>('[data-mark="arrows-head"]')!
    expect(shaft.getAttribute('x1')).toBe(String(start.x))
    expect(shaft.getAttribute('y1')).toBe(String(start.y))
    expect(head.getAttribute('d')).toContain(`M${end.x},${end.y}`)

    const directionStart = current.project(0, 5)
    const directionEndX = directionStart.x - 12
    const directionEndY = directionStart.y
    expect(
      current.element.querySelector('[data-mark="direction-head"]')?.getAttribute('d'),
    ).toContain(`M${directionEndX},${directionEndY}`)
  })

  test('thins direction glyphs without including skipped values in autoscale', async () => {
    const current = createPlot(host(), {
      scales: { x: linear(), y: linear() },
      directions: { x: 'x' },
      marks: [
        direction({
          x: 'x',
          y: 'y',
          xValues: [1, 100, 3],
          yValues: [2, 100, 4],
          directionValues: [0, 45, 90],
          every: 2,
        }),
      ],
    })
    plots.push(current)
    await frame()

    expect(current.scales.x.scale.domain.get()).toEqual([1, 3])
    expect(current.scales.y.scale.domain.get()).toEqual([2, 4])
    const glyphs = current.element.querySelectorAll<SVGGElement>('[data-mark="direction"] > g')
    expect(glyphs[0]?.hasAttribute('display')).toBe(false)
    expect(glyphs[1]?.getAttribute('display')).toBe('none')
    expect(glyphs[2]?.hasAttribute('display')).toBe(false)
  })

  test('rejects invalid arrays, scale bindings, and negative polar radii', () => {
    expect(() =>
      arrows({
        x: 'x',
        y: 'y',
        xValues: [0],
        yValues: [0],
        xEndValues: [],
        yEndValues: [1],
      }),
    ).toThrow(/equal lengths/)
    expect(() =>
      direction({
        x: 'x',
        y: 'y',
        xValues: [0],
        yValues: [0],
        directionValues: [Number.NaN],
      }),
    ).toThrow(/finite number or gap/)

    expect(() =>
      createPlot(host(), {
        scales: { x: linear(), y: linear() },
        directions: { x: 'x', y: 'x' },
        marks: [
          arrows({
            x: 'x',
            y: 'y',
            xValues: [0],
            yValues: [0],
            xEndValues: [1],
            yEndValues: [1],
          }),
        ],
      }),
    ).toThrow(/requires x\/y scales/)

    expect(() =>
      createPolarPlot(host(), {
        scales: { angle: angular(), radius: radial() },
        marks: [
          arrows({
            x: 'angle',
            y: 'radius',
            xValues: [0],
            yValues: [-1],
            xEndValues: [90],
            yEndValues: [2],
          }),
        ],
      }),
    ).toThrow(/nonnegative radial coordinates/)
  })
})

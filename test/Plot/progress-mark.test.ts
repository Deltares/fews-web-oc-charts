import { afterEach, describe, expect, test } from 'vitest'
import {
  angular,
  createPlot,
  createPolarPlot,
  linear,
  progress,
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

describe('progress mark', () => {
  test('renders polar intervals at radial values and contributes eligible extents', async () => {
    const current = createPolarPlot(host(), {
      scales: {
        angle: angular({ autoscale: 'data' }),
        radius: radial(),
      },
      marks: [
        progress({
          id: 'tasks',
          x: 'angle',
          y: 'radius',
          xValues: [[0, 40], [0, 90], null],
          yValues: [20, 60, 100],
          thickness: 10,
          fill: '#1677a6',
          opacity: 0.6,
        }),
      ],
    })
    plots.push(current)
    await frame()

    const group = current.element.querySelector<SVGGElement>('[data-mark="progress"]')!
    const paths = group.querySelectorAll<SVGPathElement>('[data-mark="progress-arc"]')
    expect(group.dataset.markId).toBe('tasks')
    expect(paths).toHaveLength(2)
    expect(paths[0]?.dataset.index).toBe('0')
    expect(paths[0]?.getAttribute('d')).toContain('A')
    expect(group.getAttribute('fill')).toBe('#1677a6')
    expect(group.getAttribute('fill-opacity')).toBe('0.6')
    expect(current.scales.angle.scale.domain.get()).toEqual([0, 90])
    expect(current.scales.radius.scale.domain.get()).toEqual([20, 60])
  })

  test('updates the projection while retaining the keyed SVG renderer', async () => {
    const initial = progress({
      id: 'stable',
      x: 'angle',
      y: 'radius',
      xValues: [[0, 30]],
      yValues: [20],
    })
    const current = createPolarPlot(host(), {
      scales: {
        angle: angular({ domain: [0, 100] }),
        radius: radial({ domain: [0, 100] }),
      },
      marks: [initial],
    })
    plots.push(current)
    await frame()

    const group = current.element.querySelector('[data-mark="progress"]')
    const before = group?.querySelector('path')?.getAttribute('d')
    current.update({
      marks: [
        progress({
          id: 'stable',
          x: 'angle',
          y: 'radius',
          xValues: [[0, 60]],
          yValues: [40],
        }),
      ],
    })
    await frame()

    expect(current.element.querySelector('[data-mark="progress"]')).toBe(group)
    expect(group?.querySelector('path')?.getAttribute('d')).not.toBe(before)
  })

  test('rejects invalid values and unsupported scale bindings', () => {
    expect(() => progress({ x: 'angle', y: 'radius', xValues: [[20, 10]], yValues: [1] })).toThrow(
      /ascending pair/,
    )
    expect(() => progress({ x: 'angle', y: 'radius', xValues: [[0, 10]], yValues: [-1] })).toThrow(
      /nonnegative finite/,
    )
    expect(() =>
      progress({ x: 'angle', y: 'radius', xValues: [[0, 10]], yValues: [1, 2] }),
    ).toThrow(/equal lengths/)

    expect(() =>
      createPlot(host(), {
        scales: { angle: linear(), radius: linear() },
        directions: { angle: 'x' },
        marks: [progress({ x: 'angle', y: 'radius', xValues: [[0, 10]], yValues: [1] })],
      }),
    ).toThrow(/polar plots only/)
    expect(() =>
      createPolarPlot(host(), {
        scales: { angle: angular(), radius: radial() },
        marks: [progress({ x: 'radius', y: 'angle', xValues: [[0, 10]], yValues: [1] })],
      }),
    ).toThrow(/angular and radial scales/)
  })
})

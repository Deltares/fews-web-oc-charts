import { afterEach, describe, expect, test } from 'vitest'
import {
  angular,
  band,
  createPlot,
  createPolarPlot,
  linear,
  radial,
  rule,
  time,
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

describe('rule marks', () => {
  test('renders full-span horizontal and vertical rules at their scale values', async () => {
    const current = plot(host(), {
      width: 400,
      height: 240,
      scales: {
        x: time({ domain: [0, 10], timeZone: 'UTC' }),
        y: linear({ domain: [0, 100] }),
      },
      directions: { x: 'x' },
      marks: [
        rule({ id: 'threshold', scale: 'y', value: 75, stroke: '#1677a6', strokeWidth: 2 }),
        rule({ id: 'event', scale: 'x', value: 4 }),
      ],
    })
    await frame()

    const [horizontal, vertical] =
      current.element.querySelectorAll<SVGLineElement>('[data-mark="rule"]')
    const region = current.regions.get().plot
    expect(horizontal?.dataset.markId).toBe('threshold')
    expect(horizontal?.getAttribute('x1')).toBe(String(region.x))
    expect(horizontal?.getAttribute('x2')).toBe(String(region.x + region.width))
    expect(horizontal?.getAttribute('y1')).toBe(String(current.scales.y.project(75)))
    expect(horizontal?.getAttribute('y2')).toBe(String(current.scales.y.project(75)))
    expect(horizontal?.getAttribute('stroke')).toBe('#1677a6')
    expect(horizontal?.getAttribute('stroke-width')).toBe('2')
    expect(vertical?.dataset.markId).toBe('event')
    expect(vertical?.getAttribute('x1')).toBe(String(current.scales.x.project(4)))
    expect(vertical?.getAttribute('x2')).toBe(String(current.scales.x.project(4)))
    expect(vertical?.getAttribute('y1')).toBe(String(region.y))
    expect(vertical?.getAttribute('y2')).toBe(String(region.y + region.height))
  })

  test('reprojects rules on domain changes without changing autoscale domains', async () => {
    const x = linear()
    const y = linear()
    const current = plot(host(), {
      scales: { x, y },
      directions: { x: 'x' },
      marks: [rule({ scale: 'y', value: 25 })],
    })
    await frame()
    const line = current.element.querySelector<SVGLineElement>('[data-mark="rule"]')!
    const original = line.getAttribute('y1')
    expect(y.domain.get()).toEqual([0, 1])

    y.domain.set([0, 50])
    await frame()

    expect(line.getAttribute('y1')).not.toBe(original)
    expect(line.getAttribute('y1')).toBe(String(current.scales.y.project(25)))
    expect(y.domain.get()).toEqual([0, 50])
  })

  test('validates rule options and supported scale bindings', () => {
    expect(() => rule({ scale: 'y', value: Number.NaN })).toThrow(/finite number/)
    expect(() => rule({ scale: '', value: 1 })).toThrow(/must name a plot scale/)
    expect(() => rule({ scale: 'y', value: 1, strokeWidth: 0 })).toThrow(/positive finite/)
    expect(() => rule({ scale: 'y', value: 1, stroke: '' })).toThrow(/non-empty/)

    expect(() =>
      plot(host(), {
        scales: { y: band({ domain: ['low', 'high'] }) },
        marks: [rule({ scale: 'y', value: 1 })],
      }),
    ).toThrow(/continuous linear or time scale/)
    expect(() =>
      plot(host(), {
        scales: { y: time() },
        marks: [rule({ scale: 'missing', value: 1 })],
      }),
    ).toThrow(/missing scale/)
    expect(() =>
      createPolarPlot(host(), {
        scales: { theta: angular(), radius: radial() },
        marks: [rule({ scale: 'radius', value: 1 })],
      }),
    ).toThrow(/cartesian plots only/)
  })
})

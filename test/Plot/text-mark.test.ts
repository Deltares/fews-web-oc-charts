import { afterEach, describe, expect, test } from 'vitest'
import {
  angular,
  band,
  createPlot,
  createPolarPlot,
  linear,
  radial,
  text,
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

describe('text marks', () => {
  test('renders aligned labels with projected positions, offsets, rotation and styling', async () => {
    const current = plot(host(), {
      scales: {
        x: linear({ domain: [0, 10] }),
        y: linear({ domain: [0, 100] }),
      },
      directions: { x: 'x' },
      marks: [
        text({
          id: 'labels',
          x: 'x',
          y: 'y',
          xValues: [2, 8],
          yValues: [25, 75],
          textValues: ['Low', 'High'],
          dx: 3,
          dy: -4,
          angle: -30,
          fill: '#245',
          fontFamily: 'serif',
          fontSize: 14,
          fontWeight: 600,
          textAnchor: 'start',
          dominantBaseline: 'hanging',
        }),
      ],
    })
    await frame()

    const group = current.element.querySelector<SVGGElement>('[data-mark="text"]')!
    const [low, high] = group.querySelectorAll<SVGTextElement>('[data-mark="text-label"]')
    expect(group.dataset.markId).toBe('labels')
    expect(low?.textContent).toBe('Low')
    expect(low?.getAttribute('x')).toBe(String(current.scales.x.project(2)))
    expect(low?.getAttribute('y')).toBe(String(current.scales.y.project(25)))
    expect(low?.getAttribute('dx')).toBe('3')
    expect(low?.getAttribute('dy')).toBe('-4')
    expect(low?.getAttribute('transform')).toBe(
      `rotate(-30 ${current.scales.x.project(2)} ${current.scales.y.project(25)})`,
    )
    expect(low?.getAttribute('fill')).toBe('#245')
    expect(low?.getAttribute('font-family')).toBe('serif')
    expect(low?.getAttribute('font-size')).toBe('14px')
    expect(low?.getAttribute('font-weight')).toBe('600')
    expect(low?.getAttribute('text-anchor')).toBe('start')
    expect(low?.getAttribute('dominant-baseline')).toBe('hanging')
    expect(high?.textContent).toBe('High')

    current.scales.y.scale.domain.set([0, 200])
    await frame()
    expect(low?.getAttribute('y')).toBe(String(current.scales.y.project(25)))
  })

  test('preserves aligned gaps, autoscale extents, and label nodes on id-matched updates', async () => {
    const current = plot(host(), {
      scales: { x: linear(), y: linear() },
      directions: { x: 'x' },
      marks: [
        text({
          id: 'notes',
          x: 'x',
          y: 'y',
          xValues: [2, 4, 6],
          yValues: [10, 20, 30],
          textValues: ['A', null, 'C'],
        }),
      ],
    })
    await frame()
    const group = current.element.querySelector<SVGGElement>('[data-mark="text"]')!
    const original = group.children[0]
    expect(current.scales.x.scale.domain.get()).toEqual([2, 6])
    expect(current.scales.y.scale.domain.get()).toEqual([10, 30])
    expect(group.children).toHaveLength(3)
    expect(group.children[1].getAttribute('display')).toBe('none')

    current.update({
      marks: [
        text({
          id: 'notes',
          x: 'x',
          y: 'y',
          xValues: [3, 5],
          yValues: [15, 25],
          textValues: ['Updated', 'Again'],
        }),
      ],
    })
    await frame()
    const updatedGroup = current.element.querySelector<SVGGElement>('[data-mark="text"]')!
    expect(updatedGroup).toBe(group)
    expect(updatedGroup.children[0]).toBe(original)
    expect(updatedGroup.children[0].textContent).toBe('Updated')
    expect(updatedGroup.children).toHaveLength(2)

    current.update({
      marks: [text({ id: 'notes', x: 'x', y: 'y', xValues: [], yValues: [], textValues: [] })],
    })
    await frame()
    expect(current.element.querySelector('[data-mark="text"]')).toBe(group)
    expect(group.children).toHaveLength(0)
    current.update({ marks: [] })
    await frame()
    expect(group.isConnected).toBe(false)
    expect(current.element.querySelector('[data-layer="marks"]')?.children).toHaveLength(0)
  })

  test('validates coordinates, labels, style and cartesian scale bindings', () => {
    expect(() => text({ x: 'x', y: 'y', xValues: [1], yValues: [1], textValues: [] })).toThrow(
      /equal lengths/,
    )
    expect(() =>
      text({ x: 'x', y: 'y', xValues: [1], yValues: [1], textValues: [Number.NaN] }),
    ).toThrow(/finite number/)
    expect(() =>
      text({
        x: 'x',
        y: 'y',
        xValues: [1],
        yValues: [1],
        textValues: ['A'],
        fontSize: 0,
      }),
    ).toThrow(/positive finite/)

    expect(() =>
      plot(host(), {
        scales: { x: linear(), y: linear() },
        directions: { x: 'x' },
        marks: [text({ x: 'x', y: 'y', xValues: ['bad'], yValues: [1], textValues: ['A'] })],
      }),
    ).toThrow(/must be a number/)
    expect(() =>
      plot(host(), {
        scales: { x: band({ domain: ['a', 'b'] }), y: linear({ domain: [0, 1] }) },
        directions: { x: 'x' },
        marks: [text({ x: 'x', y: 'y', xValues: ['a'], yValues: [0.5], textValues: ['A'] })],
      }),
    ).not.toThrow()
    expect(() =>
      plot(host(), {
        scales: { x: linear(), y: linear() },
        marks: [text({ x: 'missing', y: 'y', xValues: [1], yValues: [1], textValues: ['A'] })],
      }),
    ).toThrow(/missing x scale/)
    expect(() =>
      createPolarPlot(host(), {
        scales: { theta: angular(), radius: radial() },
        marks: [
          text({
            x: 'theta',
            y: 'radius',
            xValues: [0],
            yValues: [1],
            textValues: ['A'],
          }),
        ],
      }),
    ).toThrow(/cartesian plots only/)
  })
})

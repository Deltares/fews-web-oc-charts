import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  bandScale,
  createEnsemble,
  createPlot,
  ensemble,
  linearScale,
  type Plot,
} from '../../src/index.js'
import { ensembleStorageDiagnostics } from '../../src/data-store/ensemble.js'

const plots: Plot[] = []
const hosts: HTMLElement[] = []
const fixed = { width: 200, height: 100, margins: { top: 0, right: 0, bottom: 0, left: 0 } }
function plot(config: Parameters<typeof createPlot>[1]) {
  const host = document.createElement('div')
  document.body.append(host)
  hosts.push(host)
  const current = createPlot(host, { ...fixed, directions: { x: 'x' }, ...config })
  plots.push(current)
  return current
}
async function frame() {
  await new Promise(requestAnimationFrame)
  await new Promise(requestAnimationFrame)
}
afterEach(() => {
  plots.splice(0).forEach((current) => current.destroy())
  hosts.splice(0).forEach((host) => host.remove())
  vi.restoreAllMocks()
})

const store = () =>
  createEnsemble(
    {
      x: [0, 1, 2, 3],
      members: [
        [1, 2, NaN, 4],
        [3, 4, 5, 6],
        [5, 6, 7, 8],
      ],
    },
    { metadata: [{ id: 'control' }, { id: 'm1' }, { id: 'm2' }] },
  )
const part = (current: Plot, name: string) =>
  current.element.querySelector<SVGPathElement>(`[data-mark="ensemble"] [data-part="${name}"]`)!

describe('ensemble marks', () => {
  test('renders members, spread bands, median, mean and control as SVG paths', async () => {
    const data = store()
    const mark = ensemble(data, {
      id: 'fc',
      x: 'x',
      y: 'y',
      spread: { bands: [[0, 100]] },
      median: {},
      mean: {},
      control: { member: 'control', stroke: 'red' },
    })
    const current = plot({
      scales: { x: linearScale({ domain: [0, 3] }), y: linearScale({ domain: [0, 10] }) },
      marks: [mark],
    })
    await frame()
    const { x, y } = current.scales
    const p = (a: number, b: number) => `${x.project(a)},${y.project(b)}`
    const group = current.element.querySelector('[data-mark="ensemble"]')!
    expect(group.getAttribute('data-mark-id')).toBe('fc')
    const members = group.querySelectorAll('[data-part="member"]')
    expect([...members].map((node) => node.getAttribute('data-member-id'))).toEqual([
      'control',
      'm1',
      'm2',
    ])
    expect(members[0].getAttribute('d')).toBe(`M${p(0, 1)}L${p(1, 2)}M${p(3, 4)}`)
    expect(members[0].getAttribute('stroke-opacity')).toBe('0.25')
    expect(part(current, 'median').getAttribute('d')).toBe(
      `M${p(0, 3)}L${p(1, 4)}L${p(2, 6)}L${p(3, 6)}`,
    )
    expect(part(current, 'mean').getAttribute('stroke-dasharray')).toBe('6 3')
    expect(part(current, 'control').getAttribute('d')).toBe(members[0].getAttribute('d'))
    expect(part(current, 'control').getAttribute('stroke')).toBe('red')
    const band = part(current, 'band')
    expect(band.dataset.band).toBe('0-100')
    expect(band.getAttribute('d')).toBe(
      `M${p(0, 5)}L${p(1, 6)}L${p(2, 7)}L${p(3, 8)}L${p(3, 4)}L${p(2, 5)}L${p(1, 2)}L${p(0, 1)}Z`,
    )
  })

  test('autoscales over the visible parts and follows live appends', async () => {
    const data = store()
    const mark = ensemble(data, { x: 'x', y: 'y', members: false, median: {} })
    const x = linearScale()
    const y = linearScale()
    const current = plot({ scales: { x, y }, marks: [mark] })
    expect(x.domain.get()).toEqual([0, 3])
    expect(y.domain.get()).toEqual([3, 6])
    mark.update({ members: {} })
    expect(y.domain.get()).toEqual([1, 8])
    mark.update({ members: { max: 1 } })
    expect(y.domain.get()).toEqual([1, 6])
    data.append({ x: [4], members: [[20], [21], [22]] })
    await frame()
    expect(y.domain.get()).toEqual([1, 21])
    expect(part(current, 'median').getAttribute('d')).toContain(
      `L${current.scales.x.project(4)},${current.scales.y.project(21)}`,
    )
    mark.update({ visible: false })
    await frame()
    expect(current.element.querySelector('[data-mark="ensemble"]')!.getAttribute('display')).toBe(
      'none',
    )
  })

  test('adds and removes parts on option updates while keeping the group', async () => {
    const mark = ensemble(store(), { x: 'x', y: 'y', spread: {} })
    const current = plot({
      scales: { x: linearScale({ domain: [0, 3] }), y: linearScale({ domain: [0, 10] }) },
      marks: [mark],
    })
    await frame()
    const group = current.element.querySelector('[data-mark="ensemble"]')!
    expect(group.querySelectorAll('[data-part="band"]')).toHaveLength(2)
    mark.update({ members: false, spread: false, median: { stroke: 'blue' } })
    await frame()
    expect(current.element.querySelector('[data-mark="ensemble"]')).toBe(group)
    expect(group.querySelectorAll('[data-part="member"], [data-part="band"]')).toHaveLength(0)
    expect(part(current, 'median').getAttribute('stroke')).toBe('blue')
  })

  test('computes all drawn quantiles in a single sort pass across autoscale and render', async () => {
    const data = store()
    plot({
      scales: { x: linearScale(), y: linearScale() },
      marks: [ensemble(data, { x: 'x', y: 'y', spread: {}, median: {} })],
    })
    await frame()
    expect(ensembleStorageDiagnostics(data)).toMatchObject({ derivedColumns: 5, sortedSteps: 4 })
  })

  test('decimates large member sets per pixel column', async () => {
    const steps = 20_000
    const values = new Float32Array(steps * 2)
    for (let index = 0; index < values.length; index += 1) values[index] = Math.sin(index)
    const data = createEnsemble({
      x: Float64Array.from({ length: steps }, (_, index) => index),
      members: { memberCount: 2, values },
    })
    const current = plot({
      scales: { x: linearScale({ domain: [0, steps - 1] }), y: linearScale({ domain: [-1, 1] }) },
      marks: [ensemble(data, { x: 'x', y: 'y' })],
    })
    await frame()
    const member = current.element.querySelector('[data-part="member"]')!
    const vertices = member.getAttribute('d')!.match(/[ML]/g)!.length
    expect(vertices).toBeGreaterThan(200)
    expect(vertices).toBeLessThanOrEqual(4 * 200 + 2)
  })

  test('draws members on one canvas with one stroke per member', async () => {
    const stroke = vi.spyOn(CanvasRenderingContext2D.prototype, 'stroke')
    const mark = ensemble(store(), { x: 'x', y: 'y', renderer: 'canvas', median: {} })
    const current = plot({
      scales: { x: linearScale({ domain: [0, 3] }), y: linearScale({ domain: [0, 10] }) },
      marks: [mark],
    })
    await frame()
    const members = current.element.querySelector('[data-part="members"]')!
    expect(members.querySelector('canvas')).not.toBeNull()
    expect(members.querySelectorAll('[data-part="member"]')).toHaveLength(0)
    expect(stroke).toHaveBeenCalledTimes(3)
    expect(part(current, 'median').getAttribute('d')).not.toBe('')
    mark.update({ renderer: 'svg' })
    await frame()
    expect(members.querySelector('canvas')).toBeNull()
    expect(members.querySelectorAll('[data-part="member"]')).toHaveLength(3)
  })

  test('validates options, stores and scales', () => {
    const data = store()
    expect(() => ensemble({} as never, { x: 'x', y: 'y' })).toThrow(/createEnsemble/)
    expect(() => ensemble(data, { x: 'x', y: 'y', spread: { bands: [[60, 40]] } })).toThrow(
      /percentiles/,
    )
    expect(() => ensemble(data, { x: 'x', y: 'y', control: { member: 'missing' } })).toThrow(
      /not a member/,
    )
    expect(() => ensemble(data, { x: 'x', y: 'y', members: { opacity: 2 } })).toThrow(/\[0, 1\]/)
    expect(() => ensemble(data, { x: 'x', y: 'y', renderer: 'webgl' as never })).toThrow(
      /svg or canvas/,
    )
    const mark = ensemble(data, { id: 'a', x: 'x', y: 'y' })
    expect(() => mark.update({ id: 'b' })).toThrow(/immutable/)
    expect(() =>
      plot({
        scales: { x: linearScale(), y: linearScale() },
        marks: [ensemble(data, { x: 'x', y: 'q' })],
      }),
    ).toThrow(/missing x or y scale/)
    expect(() =>
      plot({
        scales: { x: linearScale(), y: bandScale({ domain: ['a'] }) },
        marks: [ensemble(data, { x: 'x', y: 'y' })],
      }),
    ).toThrow(/numeric\/time/)
  })

  test('renders 50 members × 10k steps with spread and median', async () => {
    const steps = 10_000
    const memberCount = 50
    const values = new Float32Array(steps * memberCount)
    for (let index = 0; index < values.length; index += 1)
      values[index] = Math.sin(index * 0.001) + Math.sin(index * 0.37) * 0.1
    for (const renderer of ['svg', 'canvas'] as const) {
      // A fresh store per run, so neither renderer reuses the other's cached quantiles.
      const data = createEnsemble({
        x: Float64Array.from({ length: steps }, (_, index) => index),
        members: { memberCount, values },
      })
      const start = performance.now()
      plot({
        width: 1000,
        height: 400,
        scales: { x: linearScale(), y: linearScale() },
        marks: [
          ensemble(data, {
            x: 'x',
            y: 'y',
            renderer,
            spread: {},
            median: {},
          }),
        ],
      })
      await new Promise(requestAnimationFrame)
      const elapsed = performance.now() - start
      console.info(`ensemble 50×10k initial render (${renderer}): ${elapsed.toFixed(1)} ms`)
      // Loose bound for CI noise; this is a smoke test, not the plan's 50 ms benchmark.
      expect(elapsed).toBeLessThan(1000)
    }
  })
})

import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  createEnsemble,
  createPlot,
  ensemble,
  highlight,
  linearScale,
  tooltip,
  type EnsembleMark,
  type Plot,
} from '../../src/index.js'
import { ensembleDefinition } from '../../src/plot/marks/ensemble/ensemble-mark.js'
import type { EnsembleHit } from '../../src/plot/interaction/ensemble-hit-testing.js'

const plots: Plot[] = []
const hosts: HTMLElement[] = []
async function frame() {
  await new Promise(requestAnimationFrame)
  await new Promise(requestAnimationFrame)
}
afterEach(() => {
  plots.splice(0).forEach((current) => current.destroy())
  hosts.splice(0).forEach((host) => host.remove())
  vi.restoreAllMocks()
})

const data = () =>
  createEnsemble(
    {
      x: [0, 10, 20],
      members: [
        [1, 2, 3],
        [5, 6, NaN],
        [9, 10, 11],
      ],
    },
    { metadata: [{ id: 'a', label: 'Member A' }, { id: 'b' }, { id: 'c', label: 'Member C' }] },
  )

async function setup(mark: EnsembleMark, plugins: Parameters<typeof createPlot>[1]['plugins']) {
  const host = document.createElement('div')
  document.body.append(host)
  hosts.push(host)
  const current = createPlot(host, {
    width: 400,
    height: 200,
    margins: { top: 0, right: 0, bottom: 0, left: 0 },
    directions: { x: 'x' },
    scales: { x: linearScale({ domain: [0, 20] }), y: linearScale({ domain: [0, 12] }) },
    marks: [mark],
    plugins,
  })
  plots.push(current)
  await frame()
  vi.spyOn(current.element, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 400, 200))
  const move = async (x: number, y: number) => {
    current.element.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: current.scales.x.project(x),
        clientY: current.scales.y.project(y),
        isPrimary: true,
      }),
    )
    await frame()
  }
  return { current, move }
}

function hits(current: Plot, mark: EnsembleMark, x: number, y: number, axis: 'x' | 'y' | 'xy') {
  const scales = current.scales as unknown as Parameters<
    NonNullable<typeof ensembleDefinition.hits>
  >[1]['scales']
  return ensembleDefinition.hits!(mark, {
    scales,
    point: { x: current.scales.x.project(x), y: current.scales.y.project(y) },
    axis,
    plot: { x: 0, y: 0, width: 400, height: 200 },
    pathContext: () => undefined,
  }) as readonly EnsembleHit[]
}

describe('ensemble inspection', () => {
  test('hits the nearest step and the nearest drawn line with drawn statistics', async () => {
    const mark = ensemble(data(), {
      x: 'x',
      y: 'y',
      spread: { bands: [[0, 100]] },
      median: {},
      mean: {},
      exceedance: { threshold: 4 },
    })
    const { current } = await setup(mark, [])
    const [hit] = hits(current, mark, 9, 5.4, 'xy')
    expect(hit).toMatchObject({
      index: 1,
      x: 10,
      y: 6,
      member: { id: 'b', label: 'b' },
      exceedance: { threshold: 4, probability: 2 / 3 },
    })
    expect(hit.px).toBe(current.scales.x.project(10))
    expect(hit.distance).toBeCloseTo(
      Math.hypot(
        current.scales.x.project(10) - current.scales.x.project(9),
        current.scales.y.project(6) - current.scales.y.project(5.4),
      ),
    )
    expect(hit.statistics).toEqual([
      { label: 'p0', probability: 0, value: 2 },
      { label: 'median', probability: 0.5, value: 6 },
      { label: 'p100', probability: 1, value: 10 },
      { label: 'mean', probability: undefined, value: 6 },
    ])
    // A missing member is skipped; the median at step 2 is the mean of 3 and 11.
    const [last] = hits(current, mark, 20, 6.8, 'x')
    expect(last).toMatchObject({ index: 2, y: 7, member: undefined })
    expect(last.distance).toBe(0)
  })

  test('omits hidden parts from hits', async () => {
    const mark = ensemble(data(), { x: 'x', y: 'y', median: {}, mean: {} })
    const { current } = await setup(mark, [])
    mark.update({ members: { visible: false }, median: { visible: false } })
    const [hit] = hits(current, mark, 10, 2, 'xy')
    expect(hit.member).toBeUndefined()
    expect(hit.statistics.map(({ label }) => label)).toEqual(['mean'])
  })

  test('reports no hits for hidden marks and steps outside the plot', async () => {
    const mark = ensemble(data(), { x: 'x', y: 'y' })
    const { current } = await setup(mark, [])
    current.scales.x.scale.domain.set([30, 40])
    expect(hits(current, mark, 35, 5, 'xy')).toEqual([])
    current.scales.x.scale.domain.set([0, 20])
    mark.update({ visible: false })
    expect(hits(current, mark, 10, 5, 'xy')).toEqual([])
  })

  test('shows member, quantiles and exceedance in the tooltip', async () => {
    const mark = ensemble(data(), {
      id: 'fc',
      x: 'x',
      y: 'y',
      spread: { bands: [[0, 100]] },
      median: {},
      exceedance: { threshold: 4 },
    })
    const { move } = await setup(mark, [tooltip({ marks: [mark], showX: true, digits: 1 })])
    await move(10, 10.2)
    const rows = [...document.querySelectorAll('[data-tooltip-entry]')].map(
      (row) => row.textContent,
    )
    // A heading with the nearest member, then one row per drawn part and the exceedance.
    expect(rows).toHaveLength(4)
    expect(rows[0]).toContain('fc')
    expect(rows[0]).toContain('Member C: 10')
    expect(rows[1]).toContain('100%')
    expect(rows[1]).toContain('2–10')
    expect(rows[2]).toContain('Median')
    expect(rows[2]).toContain('6')
    expect(rows[3]).toContain('P(>4)')
    expect(rows[3]).toContain('67%')
  })

  test('highlights the hovered member line and point', async () => {
    const mark = ensemble(data(), { x: 'x', y: 'y', median: {} })
    const { current, move } = await setup(mark, [highlight({ marks: [mark], axis: 'xy' })])
    await move(0, 1.2)
    const shapes = [
      ...current.element.querySelectorAll('[data-layer="highlight"] [data-highlight]'),
    ]
    const path = shapes.find((shape) => shape.tagName === 'path')!
    const { x, y } = current.scales
    expect(path.getAttribute('d')).toBe(
      `M${x.project(0)},${y.project(1)}L${x.project(10)},${y.project(2)}L${x.project(20)},${y.project(3)}`,
    )
    expect(shapes.some((shape) => shape.tagName === 'circle')).toBe(true)
    // With members hidden the median is nearest: only the point is highlighted.
    mark.update({ members: false })
    await move(10, 6.4)
    const median = [
      ...current.element.querySelectorAll('[data-layer="highlight"] [data-highlight]'),
    ]
    // Every drawn part is marked at the step, even without a nearest member.
    expect(median.map((shape) => shape.tagName)).toEqual(['circle'])
  })

  test('marks band bounds and statistic lines at the hovered step', async () => {
    const mark = ensemble(data(), {
      x: 'x',
      y: 'y',
      members: false,
      spread: { bands: [[0, 100]] },
      median: {},
    })
    const { current, move } = await setup(mark, [highlight({ marks: [mark], axis: 'xy' })])
    await move(10, 6.4)
    const shapes = [
      ...current.element.querySelectorAll('[data-layer="highlight"] [data-highlight]'),
    ]
    const { x, y } = current.scales
    const px = x.project(10)
    expect(shapes.find((shape) => shape.tagName === 'path')!.getAttribute('d')).toBe(
      `M${px - 5},${y.project(2)}h10M${px - 5},${y.project(10)}h10`,
    )
    expect(shapes.filter((shape) => shape.tagName === 'circle')).toHaveLength(1)
  })

  test('validates the exceedance option', () => {
    expect(() => ensemble(data(), { x: 'x', y: 'y', exceedance: { threshold: Infinity } })).toThrow(
      /threshold must be finite/,
    )
    expect(() => tooltip({ marks: [ensemble(data(), { x: 'x', y: 'y' })] })).not.toThrow()
  })
})

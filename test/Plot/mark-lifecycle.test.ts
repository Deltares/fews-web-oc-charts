import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  bar,
  createPlot,
  createSeries,
  createTable,
  histogram,
  line,
  linearScale,
  range,
  rule,
  series,
  stackedArea,
  text,
  type Plot,
} from '../../src/index.js'
import type { PlotMark } from '../../src/plot/marks/marks.js'

const plots: Plot[] = []
const hosts: HTMLElement[] = []

function plot(marks: readonly PlotMark[]) {
  const host = document.createElement('div')
  document.body.append(host)
  hosts.push(host)
  const current = createPlot(host, {
    width: 400,
    height: 240,
    scales: { x: linearScale({ domain: [0, 10] }), y: linearScale({ domain: [0, 10] }) },
    directions: { x: 'x' },
    marks,
  })
  plots.push(current)
  return current
}

async function frame() {
  await new Promise(requestAnimationFrame)
  await new Promise(requestAnimationFrame)
}

function marksLayer(current: Plot) {
  return current.element.querySelector<SVGGElement>('[data-layer="marks"]')!
}

const kinds: { name: string; create(id?: string): PlotMark }[] = [
  {
    name: 'line',
    create: (id) =>
      line({
        id,
        x: 'x',
        y: 'y',
        xValues: [1, 2],
        yValues: [3, 4],
        markers: true,
        area: { to: 0 },
      }),
  },
  {
    name: 'series',
    create: (id) =>
      series(createSeries({ x: [1, 2], y: [3, 4] }), {
        id,
        x: 'x',
        y: 'y',
        markers: {},
        area: { to: 0 },
      }),
  },
  {
    name: 'band',
    create: (id) => range({ id, x: 'x', y: 'y', xValues: [[1, 2]], yValues: [[3, 4]] }),
  },
  {
    name: 'rule',
    create: (id) => rule({ id, scale: 'y', value: 3 }),
  },
  {
    name: 'text',
    create: (id) => text({ id, x: 'x', y: 'y', xValues: [1], yValues: [3], textValues: ['Label'] }),
  },
  ...(['svg', 'canvas'] as const).flatMap((renderer) =>
    [bar, stackedArea].map((create) => ({
      name: `${create === bar ? 'bar' : 'stackedArea'} (${renderer})`,
      create: (id?: string) =>
        create(createTable({ t: [1, 2], a: [3, 4] }), {
          id,
          renderer,
          x: 't',
          scales: { x: 'x', y: 'y' },
          layers: [{ id: 'a', y: 'a' }],
          ...(create === bar ? { width: 10, layout: 'grouped' as const } : {}),
        }),
    })),
  ),
  ...(['svg', 'canvas'] as const).map((renderer) => ({
    name: `histogram (${renderer})`,
    create: (id?: string) =>
      histogram(createTable({ sample: [1, 2] }), {
        id,
        renderer,
        x: 'sample',
        scales: { x: 'x', y: 'y' },
        bins: [0, 1, 3],
      }),
  })),
]

afterEach(() => {
  plots.splice(0).forEach((current) => current.destroy())
  hosts.splice(0).forEach((host) => host.remove())
  vi.restoreAllMocks()
})

describe('mark renderer identity', () => {
  test.each(kinds)(
    '$name reuses same-ID replacements and anonymous handles across reorder',
    async ({ create }) => {
      const anonymous = create()
      const current = plot([create('keyed'), anonymous])
      await frame()
      const layer = marksLayer(current)
      const keyedNodes = [...layer.children].filter((node) => node.getAttribute('data-mark-id'))
      const anonymousNodes = [...layer.children].filter(
        (node) => !node.getAttribute('data-mark-id'),
      )
      const canvases = [...layer.querySelectorAll('canvas')]

      current.update({ marks: [anonymous, create('keyed')] })
      await frame()
      expect([...layer.children]).toEqual([...anonymousNodes, ...keyedNodes])
      expect([...layer.querySelectorAll('canvas')]).toEqual(canvases.toReversed())

      const nodes = [...layer.children]
      current.destroy()
      current.destroy()
      expect(layer.children).toHaveLength(0)
      for (const node of nodes) expect(node.isConnected).toBe(false)
      for (const canvas of canvases) {
        expect(canvas.width).toBe(0)
        expect(canvas.height).toBe(0)
      }
    },
  )

  test.each(kinds)(
    '$name does not reuse position for new handles or changed IDs',
    async ({ create }) => {
      const current = plot([create()])
      await frame()
      const layer = marksLayer(current)
      for (const replacement of [create(), create('first'), create('second'), create()]) {
        const nodes = [...layer.children]
        const canvases = [...layer.querySelectorAll('canvas')]
        current.update({ marks: [replacement] })
        await frame()
        expect(layer.children.length).toBeGreaterThan(0)
        for (const node of nodes) expect(node.isConnected).toBe(false)
        for (const canvas of canvases) {
          expect(canvas.width).toBe(0)
          expect(canvas.height).toBe(0)
        }
      }
    },
  )

  test.each(kinds)(
    '$name destroys same-ID marks of another kind and removed renderers',
    async ({ name, create }) => {
      const previous =
        name === 'line'
          ? series(createSeries({ x: [1], y: [2] }), { id: 'key', x: 'x', y: 'y' })
          : line({ id: 'key', x: 'x', y: 'y', xValues: [1], yValues: [2] })
      const current = plot([previous])
      await frame()
      const layer = marksLayer(current)
      const oldNode = layer.firstElementChild!
      const replacement = create('key')
      current.update({ marks: [replacement] })
      await frame()
      expect(oldNode.isConnected).toBe(false)
      const nodes = [...layer.children]
      const canvases = [...layer.querySelectorAll('canvas')]
      current.update({ marks: [] })
      await frame()
      expect(layer.children).toHaveLength(0)
      for (const canvas of canvases) {
        expect(canvas.width).toBe(0)
        expect(canvas.height).toBe(0)
      }
      current.update({ marks: [replacement] })
      await frame()
      for (const node of nodes) expect([...layer.children]).not.toContain(node)
    },
  )

  test('same-ID series replacement rebinds tracking and validation to the new handle', async () => {
    const oldData = createSeries({ x: [1, 2], y: [3, 4] })
    const newData = createSeries({ x: [1, 2], y: [5, 6] })
    const oldMark = series(oldData, { id: 'key', x: 'x', y: 'y' })
    const newMark = series(newData, { id: 'key', x: 'x', y: 'y' })
    const current = plot([oldMark])
    await frame()
    const path = marksLayer(current).querySelector('path')!
    current.update({ marks: [newMark] })
    await frame()
    expect(marksLayer(current).querySelector('path')).toBe(path)
    const attributes = vi.spyOn(path, 'setAttribute')
    const geometry = path.getAttribute('d')
    oldData.append({ x: [3], y: [9] })
    expect(() => oldMark.update({ y: 'missing' })).not.toThrow()
    await frame()
    expect(attributes).not.toHaveBeenCalled()
    expect(path.getAttribute('d')).toBe(geometry)
    expect(() => newMark.update({ y: 'missing' })).toThrow(/missing/)
    newData.append({ x: [3], y: [7] })
    await frame()
    expect(path.getAttribute('d')).toContain(
      `L${current.scales.x.project(3)},${current.scales.y.project(7)}`,
    )
    current.update({ marks: [] })
    expect(() => newMark.update({ y: 'missing' })).not.toThrow()
    await frame()
    expect(path.isConnected).toBe(false)
  })
})

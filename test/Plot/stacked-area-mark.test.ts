import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  axis,
  band,
  bar,
  createPlot,
  createPolarPlot,
  createTable,
  linear,
  stackedArea,
  time,
  angular,
  radial,
  type Plot,
  type StackedAreaOptions,
  type OptionPatch,
} from '../../src/index.js'
import { stackedAreaEndpoints } from '../../src/plot/stacked-area.js'
import { stackedAreaExtent } from '../../src/plot/render-stacked-areas.js'
import { barEndpoints } from '../../src/plot/bar.js'

const plots: Plot[] = []
const hosts: HTMLElement[] = []
function host() {
  const node = document.createElement('div')
  document.body.append(node)
  hosts.push(node)
  return node
}
function plot(config: Parameters<typeof createPlot>[1]) {
  const current = createPlot(host(), config)
  plots.push(current)
  return current
}
async function frame() {
  await new Promise(requestAnimationFrame)
  await new Promise(requestAnimationFrame)
}
afterEach(() => {
  plots.splice(0).forEach((current) => current.destroy())
  hosts.splice(0).forEach((node) => node.remove())
  vi.restoreAllMocks()
})

const layers = [
  { id: 'a', y: 'a', fill: 'red' },
  { id: 'b', y: 'b', fill: 'blue' },
]
const options = { x: 't', scales: { x: 't', y: 'q' }, layers }
const fixed = {
  width: 100,
  height: 100,
  margins: { top: 0, right: 0, bottom: 0, left: 0 },
}

describe('stacked areas', () => {
  test('projects exact diverging endpoints and shared boundaries without mutating source columns', async () => {
    const data = createTable({ t: [0, 1, 2], a: [3, -2, 4], b: [4, -3, 2] })
    const mark = stackedArea(data, options)
    const current = plot({
      ...fixed,
      scales: { t: linear({ domain: [0, 2] }), q: linear({ domain: [-5, 10] }) },
      directions: { t: 'x' },
      marks: [mark],
    })
    await frame()
    const paths = current.element.querySelectorAll('[data-mark="stacked-area-layer"]')
    expect(paths).toHaveLength(2)
    expect(paths[0].getAttribute('d')).toBe('M0,46.667L50,66.667L100,40L100,66.667L50,80L0,66.667Z')
    expect(paths[1].getAttribute('d')).toBe('M0,20L50,80L100,26.667L100,40L50,100L0,46.667Z')
    expect(stackedAreaExtent(mark, 'y')).toEqual([-5, 7])
    expect(stackedAreaExtent(mark, 'y', [0, 0.5])).toEqual([-1, 7])
    expect(stackedAreaExtent(mark, 'x')).toEqual([0, 2])
    expect(data.valueAt('b', 0)).toBe(4)
    const bars = bar(data, { ...options, layout: 'stacked', width: 10 })
    expect(stackedAreaEndpoints(mark)).toBe(barEndpoints(bars))
  })

  test('gaps only the affected named stack, orders stacks by first appearance and preserves keyed paths', async () => {
    const data = createTable({ t: [0, 1, 2], a: [3, NaN, 4], b: [2, 2, 2], c: [5, 5, 5] })
    const named = [
      { id: 'a', y: 'a', stack: 'observed' },
      { id: 'c', y: 'c', stack: 'forecast' },
      { id: 'b', y: 'b', stack: 'observed' },
    ]
    const mark = stackedArea(data, { ...options, layers: named })
    const current = plot({
      ...fixed,
      scales: { t: time(), q: linear() },
      marks: [mark],
    })
    await frame()
    const group = current.element.querySelector('[data-mark="stacked-area"]')!
    expect(Array.from(group.children, (node) => node.getAttribute('data-layer-id'))).toEqual([
      'a',
      'b',
      'c',
    ])
    const a = group.querySelector('[data-layer-id="a"]')!
    const b = group.querySelector('[data-layer-id="b"]')!
    const c = group.querySelector('[data-layer-id="c"]')!
    expect(a.getAttribute('d')?.match(/M/g)).toHaveLength(2)
    expect(b.getAttribute('d')?.match(/M/g)).toHaveLength(2)
    expect(c.getAttribute('d')?.match(/M/g)).toHaveLength(1)
    mark.update({ layers: named.map((layer) => ({ ...layer, visible: layer.id !== 'a' })) })
    await frame()
    expect(a.getAttribute('d')).toBe('')
    expect(b.getAttribute('d')?.match(/M/g)).toHaveLength(1)
    expect(group.querySelector('[data-layer-id="a"]')).toBe(a)
    mark.update({ layers: [...named].reverse() })
    expect(mark.options.get().resolved.layers.find((layer) => layer.id === 'a')?.visible).toBe(
      false,
    )
    await frame()
    expect(group.querySelector('[data-layer-id="b"]')).toBe(b)
    expect(Array.from(group.children, (node) => node.getAttribute('data-layer-id'))).toEqual([
      'b',
      'a',
      'c',
    ])
    mark.update({ layers: named.map((layer) => ({ ...layer, visible: undefined })) })
    await frame()
    expect(a.getAttribute('d')).not.toBe('')
    mark.update({ layers: named.map((layer) => ({ ...layer, stack: 'combined' })) })
    await frame()
    expect(c.getAttribute('d')?.match(/M/g)).toHaveLength(2)
    expect(stackedAreaExtent(mark, 'y')).toEqual([0, 11])
    mark.update({ layers: [named[0]] })
    await frame()
    expect(group.children).toHaveLength(1)
    expect(group.firstElementChild).toBe(a)
  })

  test('retains all shared rows, gaps, extrema and viewport neighbours for linear and step curves', async () => {
    const data = createTable({
      t: [-2, -1, 0, 1, 2, 3, 4, 5, 6],
      a: [1, 1, 2, 7, -2, NaN, 1, 3, 1],
      b: [2, 2, 3, 2, -4, 1, 2, 1, 2],
    })
    const mark = stackedArea(data, options)
    const t = linear({ domain: [0.5, 4.5] })
    const current = plot({
      ...fixed,
      scales: { t, q: linear({ domain: [-6, 10] }) },
      directions: { t: 'x' },
      marks: [mark],
    })
    await frame()
    const path = current.element.querySelector('[data-layer-id="b"]')!
    const d = path.getAttribute('d')!
    expect(d.startsWith('M-12.5,31.25')).toBe(true)
    expect(d).toContain('L12.5,6.25')
    expect(d).toContain('L37.5,75')
    expect(d).toContain('L112.5,37.5')
    expect(d.match(/M/g)).toHaveLength(2)
    expect(
      current.element.querySelector('[data-layer="marks"]')?.getAttribute('clip-path'),
    ).toContain('url(')
    mark.update({ curve: 'step' })
    await frame()
    expect(path.getAttribute('d')).toContain('L0,31.25L0,6.25')
    expect(path.getAttribute('d')?.match(/M/g)).toHaveLength(2)
    mark.update({ curve: undefined })
    await frame()
    expect(path.getAttribute('d')).toBe(d)
    t.update({ reverse: true })
    await frame()
    expect(path.getAttribute('d')?.startsWith('M112.5,31.25')).toBe(true)
    t.domain.set([8, 9])
    await frame()
    expect(path.getAttribute('d')).toBe('')
  })

  test('style-only updates reuse endpoints and geometry; resize and data updates redraw retained paths', async () => {
    const data = createTable({ t: [0, 1], a: [3, 4], b: [2, 3] }, { maxPoints: 3 })
    const mark = stackedArea(data, { ...options, id: 'flow' })
    const current = plot({ ...fixed, scales: { t: time(), q: linear() }, marks: [mark] })
    await frame()
    const path = current.element.querySelector('[data-layer-id="a"]')!
    const endpoints = stackedAreaEndpoints(mark)
    const project = vi.spyOn(current.scales.t, 'project')
    const writes = vi.spyOn(path, 'setAttribute')
    mark.update({
      opacity: 0.5,
      layers: layers.map((layer) => ({ ...layer, fill: 'green', stroke: 'black', strokeWidth: 2 })),
    })
    await frame()
    expect(stackedAreaEndpoints(mark)).toBe(endpoints)
    expect(project).not.toHaveBeenCalled()
    expect(writes.mock.calls.some(([key]) => key === 'd')).toBe(false)
    expect(path.getAttribute('fill')).toBe('green')
    expect(path.getAttribute('fill-opacity')).toBe('0.5')
    expect(path.getAttribute('stroke')).toBe('black')
    expect(path.getAttribute('stroke-width')).toBe('2')
    const d = path.getAttribute('d')
    current.update({ width: 200 })
    await frame()
    expect(path.getAttribute('d')).not.toBe(d)
    for (const t of [2, 3]) data.append({ t: [t], a: [t], b: [1] })
    await frame()
    expect(data.valueAt('t', 0)).toBe(1)
    expect(current.element.querySelector('[data-layer-id="a"]')).toBe(path)
    data.prepend({ t: [0], a: [1], b: [1] })
    data.upsert({ from: 3, to: 3, rows: { t: [3], a: [20], b: [-2] } })
    await frame()
    expect(stackedAreaExtent(mark, 'y')).toEqual([-2, 20])
    expect(current.scales.q.scale.domain.get()).toEqual([-2, 20])
    data.clear()
    await frame()
    expect(path.getAttribute('d')).toBe('')
    expect(stackedAreaExtent(mark, 'y')).toBeUndefined()
    data.replace({ t: [0, 1], a: [1, 1], b: [1, 1] })
    await frame()
    expect(path.getAttribute('d')).not.toBe('')
    mark.update({ visible: false })
    await frame()
    expect(path.getAttribute('d')).toBe('')
    expect(stackedAreaExtent(mark, 'x')).toBeUndefined()
    mark.update({ visible: undefined })
    await frame()
    expect(path.getAttribute('d')).not.toBe('')
  })

  test('autoscale unions independent cumulative totals and ignores hidden/missing stacks', async () => {
    const data = createTable({ t: [0, 1, 2], a: [3, 8, NaN], b: [4, -2, 4], c: [5, 5, 5] })
    const named = [
      ...layers.map((layer) => ({ ...layer, stack: 'A' })),
      { id: 'c', y: 'c', stack: 'B' },
    ]
    const mark = stackedArea(data, { ...options, layers: named })
    const t = time({ domain: [0, 0.5] })
    const q = linear({ autoscale: 'visible', defaultDomain: [-1, 1] })
    plot({ ...fixed, scales: { t, q }, marks: [mark] })
    await frame()
    expect(q.domain.get()).toEqual([0, 7])
    t.domain.set([0.5, 1.5])
    await frame()
    expect(q.domain.get()).toEqual([-2, 8])
    mark.update({ layers: named.map((layer) => ({ ...layer, visible: layer.stack === 'B' })) })
    await frame()
    expect(q.domain.get()).toEqual([0, 5])
    mark.update({ layers: named.map((layer) => ({ ...layer, visible: false })) })
    await frame()
    expect(q.domain.get()).toEqual([-1, 1])
    expect(stackedAreaExtent(mark, 'x')).toBeUndefined()
  })

  test('visible extents include interpolated viewport edges without bridging gaps', async () => {
    const data = createTable({ t: [0, 10], a: [2, 8], b: [2, 4] })
    const mark = stackedArea(data, options)
    const t = time({ domain: [2, 4] })
    const q = linear({ autoscale: 'visible', defaultDomain: [-1, 1] })
    plot({ ...fixed, scales: { t, q }, marks: [mark] })
    await frame()
    expect(q.domain.get()[0]).toBe(0)
    expect(q.domain.get()[1]).toBeCloseTo(7.2)
    mark.update({ curve: 'step' })
    await frame()
    expect(q.domain.get()).toEqual([0, 4])
    t.domain.set([4, 6])
    await frame()
    expect(q.domain.get()).toEqual([0, 12])
    data.replace({ t: [0, 10], a: [2, NaN], b: [2, 4] })
    await frame()
    expect(q.domain.get()).toEqual([-1, 1])
    expect(stackedAreaExtent(mark, 'y', [2, 4])).toBeUndefined()
  })

  test('validates options, named stacks and table mutations atomically', () => {
    const data = createTable({ t: [0, 1], a: [1, 2], b: [3, 4] })
    const mark = stackedArea(data, options)
    const snapshot = mark.options.get()
    const invalid: OptionPatch<StackedAreaOptions>[] = [
      { x: 'missing' },
      { layers: [{ id: 'a', y: 'missing' }] },
      { layers: [...layers, layers[0]] },
      { layers: [layers[0], { ...layers[1], stack: 'B' }] },
      { layers: layers.map((layer) => ({ ...layer, stack: ' ' })) },
      { layers: [{ ...layers[0], visible: 'yes' } as never] },
      { layers: [{ ...layers[0], opacity: -1 }] },
      { layers: [{ ...layers[0], label: 1 } as never] },
      { curve: 'basis' as never },
      { opacity: NaN },
      { strokeWidth: -1 },
      { scales: { x: 't', y: 't' } },
      { id: 'changed' },
      { layers: null as never },
      { fill: '' },
      { unknown: 1 } as never,
    ]
    for (const patch of invalid) {
      expect(() => mark.update(patch)).toThrow()
      expect(mark.options.get()).toEqual(snapshot)
    }
    const version = data.version
    expect(() => data.append({ t: [1], a: [2], b: [3] })).toThrow(/Duplicate.*row 2/)
    expect(() => data.replace({ t: [0], a: [Number.MAX_VALUE], b: [Number.MAX_VALUE] })).toThrow(
      /overflow/,
    )
    expect(data.version).toBe(version)
    expect(data.length).toBe(2)
    expect(() => stackedArea(createTable({ t: ['a'], a: [1], b: [2] }), options)).toThrow(/numeric/)
    expect(() => stackedArea({} as never, options)).toThrow(/createTable/)
    expect(() => stackedArea(data, { x: 't', scales: options.scales })).toThrow(/requires layers/)
    const empty = stackedArea(createTable({ t: [], a: [], b: [] }), options)
    expect(stackedAreaExtent(empty, 'y')).toBeUndefined()
    mark.update({ layers: [] })
    expect(stackedAreaExtent(mark, 'y')).toBeUndefined()
    const zero = stackedArea(createTable({ t: [0], a: [0], b: [0] }), options)
    expect(stackedAreaExtent(zero, 'y')).toEqual([0, 0])
  })

  test('rejects incompatible plot scales and live updates; removal and destruction release validators', async () => {
    const data = createTable({ t: [0, 1], a: [1, 2], b: [3, 4] })
    const mark = stackedArea(data, options)
    expect(() => plot({ scales: { t: band(), q: linear() }, marks: [mark] })).toThrow(/continuous/)
    expect(() => plot({ scales: { t: time(), q: time() }, marks: [mark] })).toThrow(/linear value/)
    expect(() =>
      createPolarPlot(host(), {
        scales: { t: angular(), q: radial() },
        marks: [mark],
      }),
    ).toThrow(/cartesian/)
    const current = plot({
      ...fixed,
      scales: { t: time(), q: linear(), other: time() },
      marks: [mark],
    })
    await frame()
    const snapshot = mark.options.get()
    expect(() => mark.update({ scales: { y: 'other' } })).toThrow(/linear value/)
    expect(mark.options.get()).toEqual(snapshot)
    expect(() => current.update({ axes: [axis('t', { position: 'left' })] })).toThrow(/directions/)
    const path = current.element.querySelector('[data-layer-id="a"]')!
    const replacement = stackedArea(data, { ...options, id: 'stable' })
    mark.update({ opacity: 0.4 })
    current.update({ marks: [replacement] })
    await frame()
    const retained = current.element.querySelector('[data-layer-id="a"]')!
    const sameId = stackedArea(data, { ...options, id: 'stable' })
    current.update({ marks: [sameId] })
    await frame()
    expect(current.element.querySelector('[data-layer-id="a"]')).toBe(retained)
    expect(path.isConnected).toBe(false)
    current.update({ marks: [] })
    await frame()
    expect(current.element.querySelector('[data-mark="stacked-area"]')).toBeNull()
    expect(() => sameId.update({ scales: { y: 'other' } })).not.toThrow()
    current.update({ marks: [mark] })
    await frame()
    const writes = vi.spyOn(current.element, 'setAttribute')
    current.destroy()
    mark.update({ scales: { y: 'other' } })
    data.append({ t: [2], a: [3], b: [4] })
    await frame()
    expect(writes).not.toHaveBeenCalled()
  })
})

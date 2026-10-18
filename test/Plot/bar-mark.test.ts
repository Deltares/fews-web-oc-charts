import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  axis,
  band,
  bar,
  createPlot,
  createPolarPlot,
  createTable,
  linear,
  line,
  time,
  angular,
  radial,
  type Plot,
  type BarOptions,
  type OptionPatch,
} from '../../src/index.js'
import { bindScale, type ScaleHandle, type ScaleRange } from '../../src/scales/scale.js'
import { reactive } from '../../src/core/runtime.js'
import { barExtent, barRectangles } from '../../src/plot/bar-geometry.js'
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
  const result = createPlot(host(), config)
  plots.push(result)
  return result
}
async function frame() {
  await new Promise(requestAnimationFrame)
  await new Promise(requestAnimationFrame)
}
function binding(scale: ScaleHandle, range: ScaleRange) {
  return bindScale(scale, reactive.signal(range))
}
afterEach(() => {
  plots.splice(0).forEach((current) => current.destroy())
  hosts.splice(0).forEach((node) => node.remove())
  vi.restoreAllMocks()
})

describe('grouped and stacked bars', () => {
  const layers = [
    { id: 'a', y: 'a', fill: 'red' },
    { id: 'b', y: 'b', fill: 'blue' },
  ]
  const options = {
    x: 't',
    scales: { x: 't', y: 'q' },
    layers,
    layout: 'grouped' as const,
    groupPadding: 0,
    layerPadding: 0,
  }

  test('exact band slots, group/inner padding, reversed categories and horizontal geometry', () => {
    const data = createTable({ t: ['one'], a: [3], b: [-2] })
    const mark = bar(data, { ...options, groupPadding: 0.2, layerPadding: 0.4 })
    const category = band({ domain: ['one'] })
    const scales = {
      t: binding(category, [0, 100]),
      q: binding(linear({ domain: [-2, 3] }), [100, 0]),
    }
    const shape = () =>
      barRectangles(mark, scales).map(({ x, y, width, height }) => [x, y, width, height])
    expect(shape()).toEqual([
      [10, 0, 30, 60],
      [60, 60, 30, 40],
    ])
    category.update({ reverse: true })
    expect(shape()).toEqual([
      [60, 0, 30, 60],
      [10, 60, 30, 40],
    ])
    mark.update({ orientation: 'horizontal' })
    expect(shape()).toEqual([
      [0, 60, 60, 30],
      [60, 10, 40, 30],
    ])
    category.update({ reverse: false })
    scales.t = binding(category, [100, 0])
    scales.q = binding(linear({ domain: [-2, 3] }), [0, 100])
    expect(shape()).toEqual([
      [40, 60, 60, 30],
      [0, 10, 40, 30],
    ])
    mark.update({ layers: layers.map((layer) => ({ ...layer, visible: layer.id === 'b' })) })
    expect(shape()).toEqual([[0, 10, 40, 30]])
  })

  test('explicit irregular intervals and pixel widths cull without changing slots, extents or sample IDs', () => {
    const data = createTable({ t: [0, 2, 9], end: [1, 8, 12], a: [3, 4, 5], b: [1, 2, 3] })
    const mark = bar(data, { ...options, layout: 'stacked', interval: { start: 't', end: 'end' } })
    const t = time({ domain: [3, 7] })
    const scales = { t: binding(t, [0, 400]), q: binding(linear({ domain: [0, 8] }), [80, 0]) }
    const rectangles = barRectangles(mark, scales)
    expect(
      rectangles.map(({ row, sampleId, x, y, width, height }) => [
        row,
        sampleId,
        x,
        y,
        width,
        height,
      ]),
    ).toEqual([
      [1, data.sampleId(1), -100, 40, 600, 40],
      [1, data.sampleId(1), -100, 20, 600, 20],
    ])
    expect(barExtent(mark, 'category')).toEqual([0, 12])
    expect(barExtent(mark, 'value', [3, 7])).toEqual([0, 6])
    expect(barExtent(mark, 'value', [8.1, 8.9])).toBeUndefined()
    t.update({ reverse: true })
    expect(barRectangles(mark, scales)[0].x).toBe(-100)
    scales.t = binding(t, [0, 800])
    expect(barRectangles(mark, scales)[0].width).toBe(1200)
    mark.update({ interval: undefined, width: 20, layout: 'grouped' })
    t.domain.set([0, 12])
    const pixels = barRectangles(mark, scales)
    expect(pixels).toHaveLength(6)
    expect(pixels[0].width).toBe(10)
    expect(pixels[0].sampleId).toBe(data.sampleId(0))
  })

  test('named stacks share widths, retain hidden slots and use independent gaps', () => {
    const data = createTable({ t: ['one'], a: [3], b: [4], c: [5], d: [NaN] })
    const named = [
      { id: 'a', y: 'a', stack: 'A' },
      { id: 'b', y: 'b', stack: 'A' },
      { id: 'c', y: 'c', stack: 'B' },
      { id: 'd', y: 'd', stack: 'B' },
    ]
    const mark = bar(data, { ...options, layers: named, layout: 'stacked' })
    const scales = {
      t: binding(band({ domain: ['one'] }), [0, 100]),
      q: binding(linear({ domain: [0, 10] }), [100, 0]),
    }
    expect(
      barRectangles(mark, scales).map(({ layerId, x, width, height }) => [
        layerId,
        x,
        width,
        height,
      ]),
    ).toEqual([
      ['a', 0, 50, 30],
      ['b', 0, 50, 40],
    ])
    mark.update({ layers: named.map((layer) => ({ ...layer, visible: layer.id !== 'd' })) })
    expect(barRectangles(mark, scales).map(({ layerId, x, width }) => [layerId, x, width])).toEqual(
      [
        ['a', 0, 50],
        ['b', 0, 50],
        ['c', 50, 50],
      ],
    )
    mark.update({
      layers: named.map((layer) => ({
        ...layer,
        visible: layer.stack === 'B' && layer.id !== 'd',
      })),
    })
    expect(barRectangles(mark, scales).map(({ layerId, x, width }) => [layerId, x, width])).toEqual(
      [['c', 50, 50]],
    )
  })

  test('renders keyed SVG rectangles, visible interval autoscale, live updates and style-only changes', async () => {
    const data = createTable({ t: [0, 2], end: [1, 8], a: [3, 4], b: [-2, 6] })
    const mark = bar(data, {
      ...options,
      id: 'flows',
      layout: 'stacked',
      interval: { start: 't', end: 'end' },
    })
    const t = time({ domain: [3, 7] })
    const q = linear({ autoscale: 'visible' })
    const current = plot({ width: 400, height: 200, scales: { t, q }, marks: [mark] })
    await frame()
    expect(q.domain.get()).toEqual([0, 10])
    expect(current.element.querySelectorAll('[data-mark="bar-segment"]')).toHaveLength(2)
    expect(
      current.element.querySelector('[data-layer="marks"]')?.getAttribute('clip-path'),
    ).toContain('url(')
    const rect = current.element.querySelector('[data-layer-id="a"]')!
    const read = vi.spyOn(current.scales.t, 'project')
    const writes = vi.spyOn(rect, 'setAttribute')
    const endpoints = barEndpoints(mark)
    mark.update({ layers: layers.map((layer) => ({ ...layer, fill: 'green' })) })
    await frame()
    expect(barEndpoints(mark)).toBe(endpoints)
    expect(read).not.toHaveBeenCalled()
    expect(writes.mock.calls.some(([key]) => key === 'width')).toBe(false)
    expect(rect.getAttribute('fill')).toBe('green')
    mark.update({ layers: layers.map((layer) => ({ ...layer, visible: layer.id === 'a' })) })
    await frame()
    expect(q.domain.get()).toEqual([0, 4])
    expect(current.element.querySelector('[data-layer-id="a"]')).toBe(rect)
    data.upsert({ from: 2, to: 2, rows: { t: [2], end: [8], a: [8], b: [1] } })
    await frame()
    expect(q.domain.get()).toEqual([0, 8])
    t.update({ domain: undefined })
    await frame()
    expect(t.domain.get()).toEqual([0, 8])
    const retained = current.element.querySelector('[data-layer-id="a"]')!
    data.append({ t: [8], end: [12], a: [12], b: [1] })
    await frame()
    expect(t.domain.get()).toEqual([0, 12])
    expect(q.domain.get()).toEqual([0, 12])
    expect(current.element.contains(retained)).toBe(true)
    current.update({ width: 800 })
    await frame()
    expect(Number(retained.getAttribute('width'))).toBeGreaterThan(0)
    data.clear()
    await frame()
    expect(current.element.querySelectorAll('rect[data-mark="bar-segment"]')).toHaveLength(0)
    expect(q.domain.get()).toEqual([0, 1])
  })

  test('rejects unsupported bindings and invalid patches synchronously, without mutating live options', async () => {
    const data = createTable({ t: [0], a: [1], b: [2] })
    const mark = bar(data, { ...options, width: 20 })
    expect(() => plot({ scales: { t: time(), q: time() }, marks: [mark] })).toThrow('linear value')
    expect(() => plot({ scales: { t: band(), q: linear() }, marks: [mark] })).toThrow('scale kind')
    const noWidth = bar(data, options)
    expect(() => plot({ scales: { t: time(), q: linear() }, marks: [noWidth] })).toThrow(
      'explicit interval',
    )
    expect(() =>
      createPolarPlot(host(), { scales: { t: angular(), q: radial() }, marks: [mark] }),
    ).toThrow('cartesian')
    const current = plot({
      width: 400,
      height: 200,
      scales: { t: time(), q: linear() },
      marks: [mark],
    })
    await frame()
    const snapshot = mark.options.get()
    for (const patch of [
      { scales: { y: 'missing' } },
      { orientation: 'horizontal' },
      { width: undefined },
      { layerPadding: -1 },
    ] satisfies OptionPatch<BarOptions>[]) {
      expect(() => mark.update(patch)).toThrow()
      expect(mark.options.get()).toEqual(snapshot)
    }
    current.destroy()
    mark.update({ scales: { y: 'missing' } })
    expect(mark.options.get().resolved.scales.y).toBe('missing')
  })

  test('supports horizontal band autoscale, reversed values, single bars and cleanup', async () => {
    const diagnostics = reactive.getDiagnostics()
    const data = createTable({ t: ['one', 'two'], a: [3, -2] })
    const mark = bar(data, {
      x: 't',
      y: 'a',
      orientation: 'horizontal',
      scales: { x: 'category', y: 'value' },
    })
    const category = band()
    const value = linear({ reverse: true })
    const current = plot({
      width: 400,
      height: 200,
      scales: { category, value },
      axes: [axis('category', { position: 'left' }), axis('value', { position: 'bottom' })],
      marks: [mark],
    })
    await frame()
    expect(category.domain.get()).toEqual(['one', 'two'])
    expect(value.domain.get()).toEqual([-2, 3])
    expect(current.element.querySelectorAll('[data-mark="bar-segment"]')).toHaveLength(2)
    current.update({ marks: [] })
    await frame()
    expect(current.element.querySelector('[data-mark="bar"]')).toBeNull()
    current.destroy()
    expect(reactive.getDiagnostics().activeEffects).toBe(diagnostics.activeEffects)
    expect(reactive.getDiagnostics().activeScopes).toBe(diagnostics.activeScopes)
  })

  test('reconciles keyed bar replacements and mixed mark order without repainting unrelated bars', async () => {
    const data = createTable({ t: [0, 1], a: [1, 2], b: [3, 4] }, { maxPoints: 2 })
    const otherData = createTable({ t: [0, 1], a: [2, 1], b: [4, 3] })
    const first = bar(data, { ...options, id: 'first', width: 10 })
    const second = bar(otherData, { ...options, id: 'second', width: 10 })
    const staticLine = line({ x: 't', y: 'q', xValues: [0, 1], yValues: [1, 2] })
    const current = plot({
      width: 400,
      height: 200,
      scales: { t: time({ domain: [0, 4] }), q: linear({ domain: [0, 10] }) },
      marks: [first, staticLine, second],
    })
    await frame()
    const firstGroup = current.element.querySelector('[data-mark-id="first"]')!
    const secondGroup = current.element.querySelector('[data-mark-id="second"]')!
    const stable = firstGroup.querySelectorAll('[data-layer-id="a"]')[1]
    const unrelated = vi.spyOn(secondGroup.querySelector('rect')!, 'setAttribute')
    data.append({ t: [2], a: [3], b: [5] })
    await frame()
    expect(firstGroup.contains(stable)).toBe(true)
    expect(unrelated).not.toHaveBeenCalled()
    const replacement = bar(data, { ...options, id: 'first', width: 10, layout: 'stacked' })
    current.update({ marks: [second, replacement, staticLine] })
    await frame()
    expect(current.element.querySelector('[data-mark-id="first"]')).toBe(firstGroup)
    expect(firstGroup.contains(stable)).toBe(true)
    expect(current.element.querySelector('[data-mark-id="second"]')).toBe(secondGroup)
    expect(current.element.querySelector('[data-layer="marks"]')!.firstElementChild).toBe(
      secondGroup,
    )
    expect(current.element.querySelectorAll('[data-mark="bar-segment"]')).toHaveLength(8)
    data.prepend({ t: [0], a: [0], b: [0] })
    await frame()
    expect(firstGroup.querySelectorAll('rect')).toHaveLength(4)
  })
})

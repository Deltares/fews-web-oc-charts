import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  axis,
  bandScale,
  createPlot,
  createTable,
  histogram,
  linearScale,
  timeScale,
  type HistogramOptions,
  type OptionPatch,
  type Plot,
} from '../../src/index.js'
import { histogramBar } from '../../src/plot/histogram.js'
import { barExtent, barRectangles } from '../../src/plot/bar-geometry.js'
import { bindScale } from '../../src/scales/scale.js'
import { reactive } from '../../src/core/runtime.js'

const plots: Plot[] = []
const hosts: HTMLElement[] = []
const options = { x: 'sample', scales: { x: 'x', y: 'y' }, bins: [0, 1, 3] }
function samples(values: number[]) {
  return createTable({ row: values.map((_, index) => index), sample: values })
}
function plot(mark: ReturnType<typeof histogram>, visible = false) {
  const host = document.createElement('div')
  document.body.append(host)
  hosts.push(host)
  const current = createPlot(host, {
    width: 400,
    height: 240,
    scales: {
      x: linearScale(visible ? { domain: [1.1, 2.9] } : {}),
      y: linearScale({ autoscale: visible ? 'visible' : 'data' }),
    },
    axes: [axis('x', { position: 'bottom' }), axis('y', { position: 'left' })],
    marks: [mark],
  })
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

describe('histogram bin semantics', () => {
  test('counts unsorted samples, duplicates and exact boundaries without including outliers or NaN', () => {
    const data = samples([3, 1, 0, NaN, 0.5, 1, -1, 4])
    const mark = histogram(data, options)
    expect(mark.bins).toEqual([
      { start: 0, end: 1, count: 2, value: 2 },
      { start: 1, end: 3, count: 3, value: 3 },
    ])
    expect(Object.isFrozen(mark.bins)).toBe(true)
    expect(Object.isFrozen(mark.bins[0])).toBe(true)
    const original = mark.bins
    mark.update({ fill: 'red' })
    expect(mark.bins).toBe(original)
    expect(data.valueAt('sample', 0)).toBe(3)
  })

  test('normalizes using included samples and actual irregular widths', () => {
    const mark = histogram(samples([0, 1, 2, 3, -1, 9, NaN]), options)
    mark.update({ normalization: 'probability' })
    expect(mark.bins.map((bin) => bin.value)).toEqual([0.25, 0.75])
    mark.update({ normalization: 'density' })
    expect(mark.bins.map((bin) => bin.value)).toEqual([0.25, 0.375])
    expect(mark.bins.reduce((sum, bin) => sum + bin.value * (bin.end - bin.start), 0)).toBe(1)
  })

  test('uses exact equal-width counts, inferred extents, constant expansion and explicit empty domains', () => {
    const mark = histogram(samples([4, 0, 2, 1, 3]), { ...options, bins: 2 })
    expect(mark.bins).toEqual([
      { start: 0, end: 2, count: 2, value: 2 },
      { start: 2, end: 4, count: 3, value: 3 },
    ])
    mark.update({ domain: [0, 6], bins: 3 })
    expect(mark.bins.map((bin) => bin.count)).toEqual([2, 2, 1])
    const constant = histogram(samples([0, 0]), { ...options, bins: 2 })
    expect(constant.bins).toEqual([
      { start: -0.5, end: 0, count: 0, value: 0 },
      { start: 0, end: 0.5, count: 2, value: 2 },
    ])
    const empty = histogram(samples([NaN]), { ...options, bins: 2 })
    expect(empty.bins).toEqual([])
    empty.update({ domain: [0, 2], normalization: 'density' })
    expect(empty.bins.map((bin) => bin.value)).toEqual([0, 0])
    expect(histogram(samples([]), options).bins.map((bin) => bin.count)).toEqual([0, 0])
  })

  test('rejects invalid options atomically and handles nonrepresentable numeric bins explicitly', () => {
    const mark = histogram(samples([0, 1]), options)
    const invalid: OptionPatch<HistogramOptions>[] = [
      { bins: 0 },
      { bins: 1.5 },
      { bins: NaN },
      { bins: [] },
      { bins: [0] },
      { bins: [1, 1] },
      { bins: [1, 0] },
      { bins: [0, Infinity] },
      { bins: [0, NaN] },
      { domain: [0, 3] },
      { bins: 2, domain: [3, 0] },
      { bins: 2, domain: [0, Infinity] },
      { bins: 2, domain: [1, 1 + Number.EPSILON] },
      { x: 'missing' },
      { x: '' },
      { opacity: -1 },
      { scales: { x: 'y' } },
      { id: 'changed' },
    ]
    const before = mark.options.get()
    for (const patch of invalid) {
      expect(() => mark.update(patch)).toThrow()
      expect(mark.options.get()).toEqual(before)
    }
    expect(() => histogram(createTable({ key: ['a'], sample: ['bad'] }), options)).toThrow(
      /numeric/,
    )
    expect(() => histogram(samples([Number.MAX_VALUE]), { ...options, bins: 1 })).toThrow(/width/)
    expect(() =>
      histogram(samples([0]), { ...options, bins: [-Number.MAX_VALUE, Number.MAX_VALUE] }),
    ).toThrow(/width/)
    const large = histogram(samples([1e20]), { ...options, bins: [0, 1e21] })
    expect(large.bins[0].count).toBe(1)
  })

  test('reads non-key time columns, copies edge options and follows source replacement and retention', () => {
    const edges = [0, 1, 3]
    const data = createTable({ row: [0, 1], sample: [new Date(3), new Date(0)] }, { maxPoints: 3 })
    const mark = histogram(data, { ...options, bins: edges })
    edges[1] = 2
    expect(mark.bins.map((bin) => bin.count)).toEqual([1, 1])
    data.append({ row: [2, 3], sample: [1, 2] })
    expect(mark.bins.map((bin) => bin.count)).toEqual([1, 2])
    data.replace({ row: [0], sample: [0.5] })
    expect(mark.bins.map((bin) => bin.count)).toEqual([1, 0])
    data.clear()
    expect(mark.bins.map((bin) => bin.count)).toEqual([0, 0])
  })

  test('restores defaults and rejects source mutations that cannot produce finite densities atomically', () => {
    const data = samples([0, 1])
    const mark = histogram(data, {
      ...options,
      bins: 2,
      domain: [0, 2],
      normalization: 'probability',
      renderer: 'canvas',
    })
    mark.update({
      bins: undefined,
      domain: undefined,
      normalization: undefined,
      renderer: undefined,
    })
    expect(mark.bins).toHaveLength(10)
    expect(mark.options.get().resolved.normalization).toBe('count')
    expect(mark.options.get().resolved.renderer).toBe('svg')
    const tiny = samples([])
    const density = histogram(tiny, {
      ...options,
      bins: [0, Number.MIN_VALUE],
      normalization: 'density',
    })
    const version = tiny.version
    expect(() => tiny.append({ row: [0], sample: [0] })).toThrow(/density/)
    expect(tiny.length).toBe(0)
    expect(tiny.version).toBe(version)
    expect(density.bins[0].value).toBe(0)
  })
})

describe('histogram bar integration', () => {
  test('reuses exact interval geometry, zero baselines, reversed scales and horizontal orientation', () => {
    const mark = histogram(samples([0, 1, 2, 3]), options)
    const x = linearScale({ domain: [0, 3] })
    const scales = {
      x: bindScale(x, reactive.signal([0, 300] as const)),
      y: bindScale(linearScale({ domain: [0, 3] }), reactive.signal([90, 0] as const)),
    }
    const shape = () =>
      barRectangles(histogramBar(mark), scales).map(({ x, y, width, height }) => [
        x,
        y,
        width,
        height,
      ])
    const expected = [
      [0, 60, 100, 30],
      [100, 0, 200, 90],
    ]
    shape().forEach((rectangle, row) =>
      rectangle.forEach((value, column) => expect(value).toBeCloseTo(expected[row][column])),
    )
    expect(barExtent(histogramBar(mark), 'category')).toEqual([0, 3])
    expect(barExtent(histogramBar(mark), 'value', [1.1, 2.9])).toEqual([0, 3])
    x.update({ reverse: true })
    const reversed = shape()
    expect(reversed[0][0]).toBeCloseTo(200)
    expect(reversed[0][2]).toBeCloseTo(100)
    mark.update({ orientation: 'horizontal' })
    expect(shape()).toEqual(reversed.map(([x, y, width, height]) => [y, x, height, width]))
    mark.update({ visible: false })
    expect(shape()).toEqual([])
    expect(barExtent(histogramBar(mark), 'value')).toBeUndefined()
  })

  test.each(['svg', 'canvas'] as const)(
    'renders %s, autoscales visible bins and reacts to mutations',
    async (renderer) => {
      const data = samples([0, 0.5, 1, 2, 3])
      const mark = histogram(data, { ...options, renderer })
      const current = plot(mark, true)
      await frame()
      expect(current.options.get().resolved.scales.y.domain.get()).toEqual([0, 3])
      const group = current.element.querySelector('[data-mark="histogram"]')!
      expect(group).not.toBeNull()
      expect(group.querySelectorAll(renderer === 'svg' ? 'rect' : 'canvas')).toHaveLength(1)
      data.append({ row: [5], sample: [2] })
      await frame()
      expect(current.options.get().resolved.scales.y.domain.get()).toEqual([0, 4])
      mark.update({ bins: [0, 2, 3] })
      await frame()
      expect(mark.bins.map((bin) => bin.count)).toEqual([3, 3])
      mark.update({ renderer: renderer === 'svg' ? 'canvas' : 'svg' })
      await frame()
      expect(group.querySelectorAll(renderer === 'svg' ? 'canvas' : 'rect')).toHaveLength(
        renderer === 'svg' ? 1 : 2,
      )
      mark.update({ visible: false })
      await frame()
      expect(group.querySelectorAll('rect')).toHaveLength(0)
      const canvas = group.querySelector('canvas')
      if (canvas) {
        const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
        expect(pixels.every((value) => value === 0)).toBe(true)
      }
    },
  )

  test('style-only changes reuse geometry and inferred bin edges contribute to autoscale', async () => {
    const mark = histogram(samples([0, 1, 3]), options)
    const current = plot(mark)
    await frame()
    expect(current.options.get().resolved.scales.x.domain.get()).toEqual([0, 3])
    const rect = current.element.querySelector('[data-mark="bar-segment"]')!
    const project = vi.spyOn(current.scales.x, 'project')
    const bins = mark.bins
    mark.update({ fill: 'red', opacity: 0.5 })
    await frame()
    expect(mark.bins).toBe(bins)
    expect(project).not.toHaveBeenCalled()
    expect(current.element.querySelector('[data-mark="bar-segment"]')).toBe(rect)
    expect(rect.getAttribute('fill')).toBe('red')
    expect(rect.getAttribute('fill-opacity')).toBe('0.5')
    expect(() => mark.update({ scales: { x: 'missing' } })).toThrow(/missing/)
    expect(mark.x).toBe('x')
    expect(() => current.options.get().resolved.scales.x.update({ reverse: true })).not.toThrow()
    const host = document.createElement('div')
    expect(() =>
      createPlot(host, {
        scales: { x: bandScale({ domain: ['a'] }), y: linearScale() },
        marks: [mark],
      }),
    ).toThrow(/linear or time/)
    const timePlot = createPlot(host, {
      width: 400,
      height: 240,
      scales: { x: timeScale(), y: linearScale() },
      marks: [mark],
    })
    timePlot.destroy()
  })
})

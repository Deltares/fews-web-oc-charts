import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  bar,
  bandScale,
  createPlot,
  createTable,
  histogram,
  linearScale,
  stackedArea,
  type Plot,
} from '../../src/index.js'
import { barEndpoints } from '../../src/plot/marks/bar/bar.js'
import { stackedAreaEndpoints } from '../../src/plot/marks/stacked-area/stacked-area.js'
import { resolveMarkColor } from '../../src/theme/color-contrast.js'

const plots: Plot[] = []
const hosts: HTMLElement[] = []
const fixed = {
  width: 160,
  height: 100,
  margins: { top: 0, right: 0, bottom: 0, left: 0 },
}
const layers = [
  { id: 'a', y: 'a', fill: '#ff0000' },
  { id: 'b', y: 'b', fill: '#0000ff' },
  { id: 'c', y: 'c', fill: '#00ff00' },
]
function plot(config: Parameters<typeof createPlot>[1]) {
  const host = document.createElement('div')
  document.body.append(host)
  hosts.push(host)
  const current = createPlot(host, { ...fixed, ...config })
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
  vi.unstubAllGlobals()
})

function canvasFor(current: Plot) {
  const canvas = current.element.querySelector('canvas')
  if (!canvas) throw new Error('Expected a canvas mark.')
  return canvas
}

function expectParity(svg: Plot, canvasPlot: Plot) {
  const actual = canvasFor(canvasPlot)
  const expected = document.createElement('canvas')
  expected.width = actual.width
  expected.height = actual.height
  const context = expected.getContext('2d')!
  context.scale(devicePixelRatio, devicePixelRatio)
  for (const node of svg.element.querySelectorAll(
    '[data-mark="bar-segment"],[data-mark="stacked-area-layer"]',
  )) {
    const path = new Path2D(node.getAttribute('d') ?? '')
    if (node instanceof SVGRectElement) {
      path.rect(
        node.x.baseVal.value,
        node.y.baseVal.value,
        node.width.baseVal.value,
        node.height.baseVal.value,
      )
    }
    const style = getComputedStyle(node)
    if (style.fill !== 'none') {
      context.fillStyle = style.fill
      context.globalAlpha = Number(style.fillOpacity)
      context.fill(path)
    }
    if (style.stroke !== 'none' && Number.parseFloat(style.strokeWidth) > 0) {
      context.globalAlpha = 1
      context.strokeStyle = style.stroke
      context.lineWidth = Number.parseFloat(style.strokeWidth)
      context.stroke(path)
    }
  }
  const pixels = actual.getContext('2d')!.getImageData(0, 0, actual.width, actual.height).data
  const reference = context.getImageData(0, 0, expected.width, expected.height).data
  expect(pixels).toEqual(reference)
  expect(
    canvasPlot.element.querySelectorAll('rect[data-layer-id],path[data-layer-id]'),
  ).toHaveLength(0)
}

describe('composite canvas parity', () => {
  test.each(['bar', 'stacked-area', 'histogram'] as const)(
    '%s shares contrast-adjusted colors across SVG and canvas after theme and option changes',
    async (kind) => {
      const data = createTable({ t: [0, 1, 2], end: [1, 2, 3], a: [1, 2, 3] })
      const mark = (renderer: 'svg' | 'canvas') => {
        const options = {
          scales: { x: 't', y: 'q' },
          renderer,
          fill: '#111',
          stroke: '#222',
          strokeWidth: 1,
          opacity: 0.4,
        }
        if (kind === 'histogram') {
          return histogram(data, { ...options, x: 'a', bins: [0, 2, 4] })
        }
        const layers = [{ id: 'a', y: 'a' }]
        return kind === 'bar'
          ? bar(data, {
              ...options,
              x: 't',
              layers,
              layout: 'grouped',
              interval: { start: 't', end: 'end' },
            })
          : stackedArea(data, { ...options, x: 't', layers })
      }
      const config = {
        scales: { t: linearScale({ domain: [0, 4] }), q: linearScale({ domain: [0, 4] }) },
        directions: { t: 'x' as const, q: 'y' as const },
        theme: 'dark' as const,
        colorContrast: 'auto' as const,
      }
      const svg = plot({ ...config, marks: [mark('svg')] })
      const canvas = plot({ ...config, marks: [mark('canvas')] })
      await frame()
      const check = () => {
        expectParity(svg, canvas)
        const node = svg.element.querySelector('[data-layer-id]')!
        expect(node.getAttribute('fill')).toBe(resolveMarkColor('#111', svg.theme.get()))
        expect(node.getAttribute('stroke')).toBe(resolveMarkColor('#222', svg.theme.get()))
        expect(node.getAttribute('fill-opacity')).toBe('0.4')
      }
      check()
      for (const current of [svg, canvas]) current.update({ theme: 'light' })
      await frame()
      check()
      for (const current of [svg, canvas]) current.update({ theme: 'dark', colorContrast: 'none' })
      await frame()
      check()
    },
  )

  test.each(['vertical', 'horizontal'] as const)(
    'histogram %s intervals share pixels through normalization, rebinning and reversal',
    async (orientation) => {
      const data = createTable({ row: [0, 1, 2, 3, 4], sample: [3, NaN, 0, 1, 1] })
      const options = {
        x: 'sample',
        scales: { x: 'x', y: 'y' },
        bins: [0, 1, 3],
        fill: '#ff0000',
        opacity: 0.5,
        stroke: '#222222',
        strokeWidth: 1,
        orientation,
      }
      const svgMark = histogram(data, options)
      const canvasMark = histogram(data, { ...options, renderer: 'canvas' })
      const x = linearScale({ domain: [0, 3] })
      const y = linearScale({ domain: [0, 3] })
      const directions =
        orientation === 'vertical'
          ? { x: 'x' as const, y: 'y' as const }
          : { x: 'y' as const, y: 'x' as const }
      const svg = plot({ scales: { x, y }, directions, marks: [svgMark] })
      const canvas = plot({ scales: { x, y }, directions, marks: [canvasMark] })
      await frame()
      expectParity(svg, canvas)
      for (const mark of [svgMark, canvasMark])
        mark.update({ bins: [0, 0.5, 1, 3], normalization: 'density', fill: '#0000ff' })
      data.append({ row: [5], sample: [2] })
      await frame()
      expectParity(svg, canvas)
      x.update({ reverse: true })
      await frame()
      expectParity(svg, canvas)
    },
  )

  test.each(['grouped', 'stacked', 'named'] as const)(
    '%s bars share exact geometry through visibility, reverse, resize, retention and renderer resets',
    async (kind) => {
      const data = createTable(
        {
          t: [0, 1, 3],
          end: [1, 3, 4],
          a: [3, -2, 0],
          b: [2, NaN, 4],
          c: [5, -3, 1],
        },
        { maxPoints: 3 },
      )
      const descriptors = layers.map((layer) => ({
        ...layer,
        ...(kind === 'named' ? { stack: layer.id === 'c' ? 'forecast' : 'observed' } : {}),
      }))
      const options = {
        x: 't',
        scales: { x: 't', y: 'q' },
        layout: kind === 'grouped' ? ('grouped' as const) : ('stacked' as const),
        interval: { start: 't', end: 'end' },
        layers: descriptors,
        stroke: '#222222',
        strokeWidth: 1,
        opacity: 0.4,
      }
      const svgMark = bar(data, options)
      const canvasMark = bar(data, { ...options, renderer: 'canvas' })
      const t = linearScale({ domain: [0, 4] })
      const q = linearScale({ domain: [-6, 8] })
      const config = { scales: { t, q }, directions: { t: 'x' as const } }
      const svg = plot({ ...config, marks: [svgMark] })
      const canvas = plot({ ...config, marks: [canvasMark] })
      await frame()
      expect(barEndpoints(canvasMark)).toBe(barEndpoints(svgMark))
      expectParity(svg, canvas)
      const retained = canvasFor(canvas)
      for (const mark of [svgMark, canvasMark])
        mark.update({
          layers: descriptors.map((layer) => ({ ...layer, visible: layer.id !== 'b' })),
        })
      t.update({ reverse: true })
      svg.update({ width: 210 })
      canvas.update({ width: 210 })
      data.append({ t: [4], end: [5], a: [2], b: [1], c: [-2] })
      await frame()
      expect(canvasFor(canvas)).toBe(retained)
      expectParity(svg, canvas)
      expect(data.sampleId(0)).toBe(1)
      expect(data.valueAt('a', 0)).toBe(-2)
      canvasMark.update({ renderer: undefined })
      await frame()
      expect(canvas.element.querySelector('canvas')).toBeNull()
      expect(canvas.element.querySelector('[data-mark="bar-segment"]')).not.toBeNull()
      canvasMark.update({ renderer: 'canvas' })
      await frame()
      expectParity(svg, canvas)
    },
  )

  test('categorical horizontal bars preserve slots and style-only updates reuse paths', async () => {
    const data = createTable({ category: ['A', 'B'], a: [3, -2], b: [1, 2], c: [0, 0] })
    const options = {
      x: 'category',
      scales: { x: 'category', y: 'q' },
      layout: 'grouped' as const,
      orientation: 'horizontal' as const,
      layers,
    }
    const svgMark = bar(data, options)
    const canvasMark = bar(data, { ...options, renderer: 'canvas' })
    const config = {
      scales: { category: bandScale(), q: linearScale() },
      directions: { category: 'y' as const, q: 'x' as const },
    }
    const svg = plot({ ...config, marks: [svgMark] })
    const canvas = plot({ ...config, marks: [canvasMark] })
    await frame()
    expectParity(svg, canvas)
    const rect = vi.spyOn(Path2D.prototype, 'rect')
    for (const mark of [svgMark, canvasMark])
      mark.update({ layers: layers.map((layer) => ({ ...layer, fill: '#aa44ff', opacity: 0.3 })) })
    await frame()
    expect(rect).not.toHaveBeenCalled()
    expectParity(svg, canvas)
  })

  test.each(['linear', 'step'] as const)(
    '%s named areas share LOD, gaps, paint order, restacking and viewport neighbours',
    async (curve) => {
      const t = Array.from({ length: 5000 }, (_, index) => index)
      const data = createTable({
        t,
        a: t.map((i) => (i === 2000 ? NaN : i === 1000 ? -4 : 2)),
        b: t.map((i) => (i === 3000 ? 8 : 1)),
        c: t.map(() => 5),
      })
      const descriptors = layers.map((layer) => ({
        ...layer,
        stack: layer.id === 'c' ? 'forecast' : 'observed',
      }))
      const options = {
        x: 't',
        scales: { x: 't', y: 'q' },
        layers: descriptors,
        curve,
        opacity: 0.5,
      }
      const svgMark = stackedArea(data, options)
      const canvasMark = stackedArea(data, { ...options, renderer: 'canvas' })
      const x = linearScale({ domain: [100.5, 4500.5] })
      const config = {
        scales: { t: x, q: linearScale({ domain: [-5, 12] }) },
        directions: { t: 'x' as const },
      }
      const svg = plot({ ...config, marks: [svgMark] })
      const canvas = plot({ ...config, marks: [canvasMark] })
      await frame()
      expect(stackedAreaEndpoints(canvasMark)).toBe(stackedAreaEndpoints(svgMark))
      expectParity(svg, canvas)
      for (const mark of [svgMark, canvasMark])
        mark.update({
          layers: [...descriptors].reverse().map((layer) => ({
            ...layer,
            visible: layer.id !== 'a',
          })),
        })
      x.update({ reverse: true })
      await frame()
      expectParity(svg, canvas)
      canvasMark.update({ renderer: undefined })
      await frame()
      expect(canvas.element.querySelectorAll('[data-mark="stacked-area-layer"]')).toHaveLength(3)
      canvasMark.update({ renderer: 'canvas' })
      await frame()
      expectParity(svg, canvas)
    },
  )

  test('canvas resolves CSS colours, preserves transparent fill/stroke semantics and cleans up', async () => {
    const data = createTable({ t: [0, 1], a: [2, 2] })
    const mark = bar(data, {
      renderer: 'canvas',
      x: 't',
      y: 'a',
      scales: { x: 't', y: 'q' },
      width: 20,
    })
    const current = plot({
      scales: { t: linearScale({ domain: [0, 1] }), q: linearScale({ domain: [0, 4] }) },
      directions: { t: 'x' },
      marks: [mark],
    })
    hosts[0].style.setProperty('--fews-chart-accent', '#ff0000')
    await frame()
    const context = canvasFor(current).getContext('2d')!
    expect([...context.getImageData(2, 60, 1, 1).data]).toEqual([255, 0, 0, 255])
    mark.update({ fill: 'none', stroke: '#0000ff', strokeWidth: 2, opacity: 0 })
    await frame()
    expect([...context.getImageData(2, 60, 1, 1).data]).toEqual([0, 0, 0, 0])
    mark.update({ visible: false })
    await frame()
    expect(context.getImageData(0, 0, 160, 100).data.every((value) => value === 0)).toBe(true)
    current.update({ marks: [] })
    await frame()
    expect(current.element.querySelector('canvas')).toBeNull()
    current.update({ marks: [mark] })
    await frame()
    current.destroy()
    data.append({ t: [2], a: [3] })
    mark.update({ visible: true })
    await frame()
    expect(hosts[0].children).toHaveLength(0)
  })

  test('invalid renderer updates are atomic', () => {
    const data = createTable({ t: [0, 1], a: [2, 3] })
    const options = { x: 't', scales: { x: 't', y: 'q' }, layers: [layers[0]] }
    const marks = [bar(data, { ...options, layout: 'stacked' }), stackedArea(data, options)]
    for (const mark of marks) {
      const before = mark.options.get()
      // @ts-expect-error invalid runtime renderer must also be rejected
      expect(() => mark.update({ renderer: 'auto' })).toThrow('renderer')
      expect(mark.options.get()).toEqual(before)
    }
  })

  test('repaints watched CSS colours and high-DPI surfaces without changing endpoints', async () => {
    const queries = vi.spyOn(window, 'matchMedia')
    const data = createTable({ t: [0, 1], a: [2, 2] })
    const mark = stackedArea(data, {
      renderer: 'canvas',
      x: 't',
      scales: { x: 't', y: 'q' },
      layers: [{ id: 'a', y: 'a', fill: 'var(--area-color)' }],
    })
    const themeElement = document.createElement('div')
    themeElement.style.setProperty('--area-color', '#ff0000')
    const current = plot({
      themeElement,
      scales: { t: linearScale({ domain: [0, 1] }), q: linearScale({ domain: [0, 4] }) },
      directions: { t: 'x' },
      marks: [mark],
    })
    hosts[0].append(themeElement)
    hosts[0].style.setProperty('--area-color', '#ff0000')
    await frame()
    const canvas = canvasFor(current)
    const context = canvas.getContext('2d')!
    expect([...context.getImageData(10, 60, 1, 1).data]).toEqual([255, 0, 0, 255])
    const endpoints = stackedAreaEndpoints(mark)
    hosts[0].style.setProperty('--area-color', '#0000ff')
    themeElement.style.setProperty('--area-color', '#0000ff')
    await frame()
    expect([...context.getImageData(10, 60, 1, 1).data]).toEqual([0, 0, 255, 255])
    vi.stubGlobal('devicePixelRatio', 2)
    const resolution = queries.mock.results.find(
      (result) => result.type === 'return' && result.value.media.startsWith('(resolution:'),
    )
    if (resolution?.type !== 'return') throw new Error('Expected a device scale observer.')
    resolution.value.dispatchEvent(new Event('change'))
    await frame()
    expect(canvas.width).toBe(320)
    expect(canvas.height).toBe(200)
    expect([...context.getImageData(20, 120, 1, 1).data]).toEqual([0, 0, 255, 255])
    mark.update({ opacity: 0.5 })
    await frame()
    expect([...context.getImageData(20, 120, 1, 1).data]).toEqual([0, 0, 255, 128])
    expect(stackedAreaEndpoints(mark)).toBe(endpoints)
    current.update({ marks: [] })
    await frame()
    expect(canvas.width).toBe(0)
    expect(canvas.height).toBe(0)
  })

  test('keeps mixed renderer paint order and releases same-ID replacements', async () => {
    const data = createTable({ t: [0, 1], a: [2, 3] })
    const options = {
      x: 't',
      scales: { x: 't', y: 'q' },
      layers: [{ id: 'a', y: 'a' }],
    }
    const back = stackedArea(data, { ...options, id: 'back', renderer: 'canvas' })
    const front = bar(data, { ...options, id: 'front', layout: 'stacked', width: 10 })
    const current = plot({
      scales: { t: linearScale(), q: linearScale() },
      directions: { t: 'x' },
      marks: [back, front],
    })
    await frame()
    const group = current.element.querySelector('[data-layer="marks"]')!
    const surface = canvasFor(current)
    expect([...group.children].map((node) => node.getAttribute('data-mark-id'))).toEqual([
      'back',
      'front',
    ])
    current.update({ marks: [front, back] })
    await frame()
    expect([...group.children].map((node) => node.getAttribute('data-mark-id'))).toEqual([
      'front',
      'back',
    ])
    expect(canvasFor(current)).toBe(surface)
    const replacement = stackedArea(data, { ...options, id: 'back' })
    current.update({ marks: [replacement] })
    await frame()
    expect(current.element.querySelector('canvas')).toBeNull()
    expect(surface.width).toBe(0)
    expect(group.querySelectorAll('[data-mark="stacked-area-layer"]')).toHaveLength(1)
    current.destroy()
    expect(group.children).toHaveLength(0)
  })
})

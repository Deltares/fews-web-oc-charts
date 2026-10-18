import { afterEach, expect, test, vi } from 'vitest'
import {
  axis,
  bandScale,
  colorScale,
  createGrid,
  createPlot,
  createPolarPlot,
  heatmap,
  linearScale,
  timeScale,
  type GridInput,
  type Plot,
} from '../../src/index.js'
import { heatmapDefinition } from '../../src/plot/heatmap-mark.js'
import { markExtents } from '../../src/plot/mark-extents.js'
import { reactive } from '../../src/core/runtime.js'

const plots: Plot[] = []
const hosts: HTMLElement[] = []
const input = (): GridInput => ({
  xEdges: new Float64Array([0, 1, 4]),
  yEdges: [10, 12, 18],
  values: [0, 1, NaN, 0.5],
})
const colors = () => colorScale({ colors: ['black', 'white'] })
const frame = async () => {
  await new Promise(requestAnimationFrame)
  await new Promise(requestAnimationFrame)
}
function setup(renderer: 'svg' | 'canvas' = 'svg') {
  const host = document.createElement('div')
  document.body.append(host)
  hosts.push(host)
  const data = createGrid(input())
  const color = colors()
  const mark = heatmap(data, { id: 'grid', scales: { x: 'x', y: 'y' }, color, renderer })
  const x = linearScale()
  const y = linearScale()
  const plot = createPlot(host, {
    width: 400,
    height: 300,
    scales: { x, y },
    axes: [axis('x', { position: 'bottom' }), axis('y', { position: 'left' })],
    marks: [mark],
  })
  plots.push(plot)
  return { host, plot, data, color, mark, x, y }
}
afterEach(() => {
  plots.splice(0).forEach((plot) => plot.destroy())
  hosts.splice(0).forEach((host) => host.remove())
  vi.restoreAllMocks()
})

test('copies grid ownership, keeps row-major values and replaces atomically', () => {
  const source = input()
  const values = [0, 1, NaN, 0.5]
  source.values = values
  const grid = createGrid(source)
  values[0] = 99
  const view = grid.snapshot()
  expect([view.columns, view.rows]).toEqual([2, 2])
  expect(view.valueAt(0)).toBe(0)
  expect(view.valueAt(2)).toBeNaN()
  expect(Object.isFrozen(view.xEdges)).toBe(true)
  expect(() => view.valueAt(-1)).toThrow(/index/)
  const invalid: GridInput[] = [
    { ...input(), xEdges: [] },
    { ...input(), xEdges: [0, 0, 4] },
    { ...input(), xEdges: [0, 4, 1] },
    { ...input(), xEdges: [-Number.MAX_VALUE, 0, Number.MAX_VALUE] },
    { ...input(), yEdges: [10, NaN, 18] },
    { ...input(), values: [1] },
    { ...input(), values: [0, 1, Infinity, 2] },
  ]
  for (const candidate of invalid) {
    expect(() => grid.replace(candidate)).toThrow()
    expect(grid.snapshot()).toBe(view)
    expect(grid.version).toBe(0)
  }
  grid.replace({ xEdges: [1], yEdges: [2], values: [] })
  expect(grid.version).toBe(1)
  expect(grid.snapshot().columns).toBe(0)
  expect(view.valueAt(0)).toBe(0)
})

test('shared colour mapping interpolates stops, clamps, handles gaps and rejects invalid updates', () => {
  const color = colors()
  expect(color.map(0)).toBe('rgb(0, 0, 0)')
  expect(color.map(0.5)).toBe('rgb(128, 128, 128)')
  expect(color.map(2)).toBe(color.map(1))
  expect(color.map(NaN)).toBe('transparent')
  color.update({ domain: [-1, 1], colors: ['blue', 'white', 'red'], unknown: 'pink' })
  expect(color.map(0)).toBe('rgb(255, 255, 255)')
  expect(color.map(NaN)).toBe('pink')
  const before = color.options.get()
  for (const domain of [
    [1, -1],
    [0, Infinity],
    [-Number.MAX_VALUE, Number.MAX_VALUE],
  ] as const) {
    expect(() => color.update({ domain })).toThrow()
    expect(color.options.get()).toEqual(before)
  }
  expect(() => color.update({ colors: ['not-a-color', 'red'] })).toThrow()
  color.update({ domain: [2, 2], colors: ['black', 'white'] })
  expect(color.map(2)).toBe('rgb(128, 128, 128)')
  color.update({ domain: [0, 1], clamp: false, colors: ['#444444', '#888888'] })
  expect(color.map(2)).toBe('rgb(204, 204, 204)')
})

test('grid versions react to replacements and colour options restore defaults', async () => {
  const grid = createGrid(input())
  const versions: number[] = []
  const effect = reactive.effect(() => {
    versions.push(grid.version)
  })
  try {
    await frame()
    grid.replace(input())
    await frame()
    expect(versions).toEqual([0, 1])
  } finally {
    effect.dispose()
  }
  const color = colors()
  const palette = ['red', 'blue']
  color.update({ colors: palette, domain: [2, 4] })
  palette[0] = 'green'
  expect(color.map(2)).toBe('rgb(255, 0, 0)')
  color.update({ colors: undefined, domain: undefined })
  expect(color.options.get().resolved.domain).toEqual([0, 1])
  expect(color.options.get().resolved.colors).toEqual(['#f7fbff', '#08306b'])
})

test('projects irregular cells exactly, including reversed axes and missing-cell colour', async () => {
  const { host, x, y, plot } = setup()
  await frame()
  expect(x.domain.get()).toEqual([0, 4])
  expect(y.domain.get()).toEqual([10, 18])
  const cells = () => [...host.querySelectorAll<SVGRectElement>('[data-mark="heatmap-cell"]')]
  expect(cells()).toHaveLength(4)
  expect(cells().map((cell) => cell.getAttribute('fill'))).toEqual([
    'rgb(0, 0, 0)',
    'rgb(255, 255, 255)',
    'transparent',
    'rgb(128, 128, 128)',
  ])
  const region = plot.regions.get().plot
  const first = cells()[0]
  expect(Number(first.getAttribute('width'))).toBeCloseTo(region.width / 4)
  expect(Number(first.getAttribute('height'))).toBeCloseTo(region.height / 4)
  expect(Number(first.getAttribute('x'))).toBeCloseTo(region.x)
  expect(Number(first.getAttribute('y'))).toBeCloseTo(region.y + region.height * 0.75)
  x.update({ reverse: true })
  y.update({ reverse: true })
  await frame()
  expect(Number(cells()[0].getAttribute('x'))).toBeCloseTo(region.x + region.width * 0.75)
  expect(Number(cells()[0].getAttribute('y'))).toBeCloseTo(region.y)
})

test('colour-only updates reuse geometry and shared handles invalidate all plots', async () => {
  const a = setup()
  const b = setup()
  b.mark.update({ color: a.color })
  await frame()
  const cell = a.host.querySelector('[data-mark="heatmap-cell"]')
  const snapshot = a.data.snapshot()
  a.color.update({ colors: ['red', 'blue'] })
  await frame()
  expect(a.host.querySelector('[data-mark="heatmap-cell"]')).toBe(cell)
  expect(a.data.snapshot()).toBe(snapshot)
  expect(cell?.getAttribute('fill')).toBe('rgb(255, 0, 0)')
  expect(b.host.querySelector('[data-mark="heatmap-cell"]')?.getAttribute('fill')).toBe(
    'rgb(255, 0, 0)',
  )
  a.data.replace({ xEdges: [0, 2], yEdges: [0, 4], values: [1] })
  await frame()
  expect(a.host.querySelectorAll('[data-mark="heatmap-cell"]')).toHaveLength(1)
  expect(a.y.domain.get()).toEqual([0, 4])
  a.mark.update({ visible: false })
  await frame()
  expect(a.host.querySelectorAll('[data-mark="heatmap-cell"]')).toHaveLength(0)
  expect(markExtents([a.mark], { x: a.x, y: a.y }, 'x', 'data')).toBeUndefined()
})

test('canvas pixels match SVG colours and renderer switches remove obsolete surfaces', async () => {
  const { host, mark, color } = setup('canvas')
  await frame()
  const canvas = host.querySelector('canvas')!
  const context = canvas.getContext('2d')!
  const plot = plots.at(-1)!.regions.get().plot
  const pixel = () =>
    Array.from(
      context.getImageData(
        Math.round((plot.x + plot.width / 8) * devicePixelRatio),
        Math.round((plot.y + plot.height * 0.875) * devicePixelRatio),
        1,
        1,
      ).data,
    )
  expect(pixel()).toEqual([0, 0, 0, 255])
  color.update({ colors: ['red', 'blue'] })
  await frame()
  expect(pixel()).toEqual([255, 0, 0, 255])
  mark.update({ renderer: 'svg', opacity: 0.5 })
  await frame()
  expect(host.querySelector('canvas')).toBeNull()
  expect(host.querySelectorAll('[data-mark="heatmap-cell"]')).toHaveLength(4)
  expect(host.querySelector('[data-mark="heatmap-cell"]')?.getAttribute('fill-opacity')).toBe('0.5')
  mark.update({ renderer: 'canvas' })
  await frame()
  expect(host.querySelectorAll('canvas')).toHaveLength(1)
  expect(host.querySelectorAll('[data-mark="heatmap-cell"]')).toHaveLength(0)
})

test('grid footprints include missing cells and visible autoscaling uses interval overlap', () => {
  const data = createGrid({ ...input(), values: [NaN, NaN, NaN, NaN] })
  const mark = heatmap(data, { scales: { x: 'x', y: 'y' }, color: colors() })
  const scales = { x: linearScale({ domain: [1, 2] }), y: linearScale({ autoscale: 'visible' }) }
  expect(markExtents([mark], scales, 'y', 'visible')).toEqual([10, 18])
  scales.x.update({ domain: [5, 6] })
  expect(markExtents([mark], scales, 'y', 'visible')).toBeUndefined()
  data.replace({ xEdges: [0], yEdges: [0], values: [] })
  expect(markExtents([mark], scales, 'x', 'data')).toBeUndefined()
})

test('SVG and canvas retain exact pixel parity through grid, palette, reversal and DPR changes', async () => {
  const svg = setup()
  const canvas = setup('canvas')
  function parity() {
    const actual = canvas.host.querySelector('canvas')!
    const reference = document.createElement('canvas')
    reference.width = actual.width
    reference.height = actual.height
    const context = reference.getContext('2d')!
    context.scale(devicePixelRatio, devicePixelRatio)
    for (const node of svg.host.querySelectorAll<SVGRectElement>('[data-mark="heatmap-cell"]')) {
      const style = getComputedStyle(node)
      context.fillStyle = style.fill
      context.globalAlpha = Number(style.fillOpacity)
      context.fillRect(
        node.x.baseVal.value,
        node.y.baseVal.value,
        node.width.baseVal.value,
        node.height.baseVal.value,
      )
    }
    expect(actual.getContext('2d')!.getImageData(0, 0, actual.width, actual.height).data).toEqual(
      context.getImageData(0, 0, reference.width, reference.height).data,
    )
  }
  await frame()
  parity()
  vi.stubGlobal('devicePixelRatio', 2)
  try {
    for (const current of [svg, canvas]) {
      current.x.update({ reverse: true })
      current.y.update({ reverse: true })
      current.mark.update({ opacity: 0.6 })
      current.color.update({ colors: ['blue', 'white', 'red'], unknown: 'orange' })
      current.plot.update({ width: 480 })
    }
    await frame()
    expect(canvas.host.querySelector('canvas')!.width).toBe(960)
    parity()
    for (const current of [svg, canvas])
      current.data.replace({ xEdges: [0, 2], yEdges: [1, 3], values: [0.5] })
    await frame()
    parity()
  } finally {
    vi.unstubAllGlobals()
  }
})

test('culls offscreen cells, clips partial cells and reuses keyed renderer groups', async () => {
  const { plot, host, mark, color, data, x } = setup()
  await frame()
  const group = host.querySelector('[data-mark="heatmap"]')
  x.update({ domain: [2, 3] })
  await frame()
  expect(
    [...host.querySelectorAll<SVGRectElement>('[data-mark="heatmap-cell"]')].map(
      (cell) => cell.dataset.index,
    ),
  ).toEqual(['1', '3'])
  const region = plot.regions.get().plot
  const cell = host.querySelector<SVGRectElement>('[data-mark="heatmap-cell"]')!
  expect(cell.x.baseVal.value).toBeLessThan(region.x)
  expect(cell.x.baseVal.value + cell.width.baseVal.value).toBeGreaterThan(region.x + region.width)
  expect(group?.closest('[clip-path]')).not.toBeNull()
  const replacement = heatmap(data, {
    id: mark.id,
    scales: { x: 'x', y: 'y' },
    color,
    renderer: 'canvas',
  })
  plot.update({ marks: [replacement] })
  await frame()
  expect(host.querySelector('[data-mark="heatmap"]')).toBe(group)
  expect(host.querySelectorAll('canvas')).toHaveLength(1)
  plot.update({ marks: [] })
  await frame()
  expect(host.querySelector('[data-mark="heatmap"]')).toBeNull()
})

test('validates scale kinds, time boundaries, updates and lifecycle cleanup', async () => {
  const { mark, data, plot } = setup()
  const validate = (scales: Parameters<typeof heatmapDefinition.validate>[1]['scales']) =>
    heatmapDefinition.validate(mark, {
      scales,
      coordinateSystem: 'cartesian',
      direction: (name) => (name === 'x' ? 'x' : 'y'),
    })
  expect(() => validate({ x: bandScale(), y: linearScale() })).toThrow(/linear or time/)
  expect(() => validate({ x: timeScale() })).toThrow()
  const host = document.createElement('div')
  expect(() => createPolarPlot(host, { scales: {}, marks: [mark] })).toThrow(/cartesian/)
  const before = mark.options.get()
  expect(() => mark.update({ opacity: -1 })).toThrow()
  expect(() => mark.update({ scales: { x: 'missing' } })).toThrow()
  expect(mark.options.get()).toEqual(before)
  plot.update({ scales: { x: timeScale(), y: linearScale() } })
  await frame()
  expect(() => data.replace({ xEdges: [0, 9e15], yEdges: [0, 1], values: [1] })).toThrow(
    /Date range/,
  )
  const beforeDestroy = reactive.getDiagnostics()
  plot.destroy()
  data.replace({ xEdges: [0, 9e15], yEdges: [0, 1], values: [1] })
  expect(reactive.getDiagnostics().activeEffects).toBeLessThan(beforeDestroy.activeEffects)
})

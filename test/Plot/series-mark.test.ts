import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  axis,
  bandScale,
  batch,
  createPlot,
  createSeries,
  fromObjects,
  linearScale,
  series,
  timeScale,
  type Plot,
} from '../../src/index.js'
import { reactive } from '../../src/core/runtime.js'

const plots: Plot[] = []
const hosts: HTMLElement[] = []
function host() {
  const element = document.createElement('div')
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
const path = (current: Plot, id: string) =>
  current.element.querySelector<SVGPathElement>(`path[data-mark="line"][data-mark-id="${id}"]`)!

afterEach(() => {
  plots.splice(0).forEach((current) => current.destroy())
  hosts.splice(0).forEach((element) => element.remove())
  vi.restoreAllMocks()
})

describe('data-backed series marks', () => {
  test('accepts every FEWS marker symbol in data-backed series options', () => {
    const symbols = [
      'circle',
      'cross',
      'square',
      'diamond',
      'star',
      'wye',
      'triangle',
      'triangle-up',
      'triangle-down',
      'triangle-left',
      'triangle-right',
      'x',
      'plus',
      'rectangle',
    ] as const
    const data = createSeries({ x: [0], y: [1] })
    for (const symbol of symbols) {
      const mark = series(data, { x: 'x', y: 'y', markers: { symbol } })
      expect(mark.markers?.symbol).toBe(symbol)
    }
  })

  test('renders shared store line/markers/area with gaps and live mutations without replacing handles', async () => {
    const data = fromObjects(
      [
        { t: new Date(0), value: 1 },
        { t: new Date(1), value: NaN },
        { t: new Date(2), value: 3 },
      ],
      { x: 't', y: 'value' },
    )
    const mark = series(data, {
      id: 'obs',
      x: 't',
      y: 'q',
      line: { stroke: 'red', width: 2 },
      markers: { symbol: 'circle' },
      area: { to: 0 },
    })
    const current = plot(host(), {
      width: 640,
      height: 360,
      scales: { t: timeScale({ domain: [0, 4] }), q: linearScale({ domain: [0, 5] }) },
      axes: [axis('t', { position: 'bottom' }), axis('q')],
      marks: [mark],
    })
    await frame()
    const line = path(current, 'obs')
    expect(line.getAttribute('d')).toBe(
      `M${current.scales.t.project(0)},${current.scales.q.project(1)}M${current.scales.t.project(2)},${current.scales.q.project(3)}`,
    )
    expect(current.element.querySelectorAll('circle')).toHaveLength(2)
    expect(mark.data).toBe(data)
    data.append([{ t: new Date(3), value: 4 }])
    await frame()
    expect(path(current, 'obs')).toBe(line)
    expect(line.getAttribute('d')).toContain(
      `L${current.scales.t.project(3)},${current.scales.q.project(4)}`,
    )
    expect(current.element.querySelectorAll('circle')).toHaveLength(3)
    expect(current.element.querySelector('[data-mark="area"]')?.getAttribute('d')).toContain('Z')
    data.clear()
    await frame()
    expect(line.getAttribute('d')).toBe('')
    expect(current.element.querySelectorAll('circle')).toHaveLength(0)
  })

  test('renders unretained line-only appends from the tail and rebuilds after replacement', async () => {
    const data = createSeries({ x: [0, 1], y: [1, 2] })
    const mark = series(data, { id: 'tail', x: 'x', y: 'y' })
    const current = plot(host(), {
      width: 400,
      height: 200,
      directions: { x: 'x' },
      scales: { x: linearScale({ domain: [0, 5] }), y: linearScale({ domain: [0, 5] }) },
      marks: [mark],
    })
    await frame()
    const line = path(current, 'tail')
    const projectX = vi.spyOn(current.scales.x, 'project')
    const projectY = vi.spyOn(current.scales.y, 'project')

    data.append({ x: [2, 3, 4], y: [3, NaN, 4] })
    await frame()

    expect(projectX).toHaveBeenCalledTimes(2)
    expect(projectY).toHaveBeenCalledTimes(2)
    expect(line.getAttribute('d')).toBe(
      `M${current.scales.x.project(0)},${current.scales.y.project(1)}` +
        `L${current.scales.x.project(1)},${current.scales.y.project(2)}` +
        `L${current.scales.x.project(2)},${current.scales.y.project(3)}` +
        `M${current.scales.x.project(4)},${current.scales.y.project(4)}`,
    )

    projectX.mockClear()
    projectY.mockClear()
    data.replace({ x: [0, 1, 2, 3], y: [1, 2, 3, 4] })
    await frame()
    expect(projectX).toHaveBeenCalledTimes(4)
    expect(projectY).toHaveBeenCalledTimes(4)
  })

  test('uses bounded cached LOD for dense line-only series without losing extrema or gaps', async () => {
    const x = Array.from({ length: 10_000 }, (_, index) => index)
    const y = x.map((value) => {
      if (value === 5_000 || value === 5_001) return NaN
      if (value === 5_042) return 100
      if (value === 5_073) return -100
      return Math.sin(value / 100)
    })
    const data = createSeries({ x, y })
    const current = plot(host(), {
      width: 200,
      height: 160,
      directions: { x: 'x' },
      scales: {
        x: linearScale({ domain: [4_900, 5_100] }),
        y: linearScale({ domain: [-110, 110] }),
      },
      marks: [series(data, { id: 'lod', x: 'x', y: 'y' })],
    })
    await frame()

    const line = path(current, 'lod')
    const pathData = line.getAttribute('d') ?? ''
    expect(pathData.match(/[ML]/g)?.length).toBeLessThan(200)
    expect(pathData).toContain(`,${current.scales.y.project(100)}`)
    expect(pathData).toContain(`,${current.scales.y.project(-100)}`)
    expect(pathData.match(/M/g)?.length).toBeGreaterThan(1)
    expect(data.lodCacheEntries).toBe(1)
    expect(data.lodCacheByteLength).toBeLessThanOrEqual(2 * 1024 * 1024)
  })

  test('only changed store consumers repaint, coalesces mutations, and releases removed/destroyed consumers', async () => {
    const baseline = reactive.getDiagnostics()
    const data = createSeries({ x: [0, 1], y: [1, 2] })
    const other = createSeries({ x: [0, 1], y: [2, 1] })
    const first = series(data, { id: 'first', x: 'x', y: 'y' })
    const second = series(other, { id: 'second', x: 'x', y: 'y' })
    const config = {
      width: 400,
      height: 200,
      directions: { x: 'x' as const },
      scales: { x: linearScale({ domain: [0, 4] }), y: linearScale({ domain: [0, 4] }) },
      marks: [first, second],
    }
    const a = plot(host(), config)
    const b = plot(host(), config)
    await frame()
    const firstWrite = vi.spyOn(path(a, 'first'), 'setAttribute')
    const secondWrite = vi.spyOn(path(a, 'second'), 'setAttribute')
    const axes = vi.spyOn(a.element.querySelector('[data-layer="axes"]')!, 'replaceChildren')
    batch(() => {
      data.append({ x: [2], y: [3] })
      data.append({ x: [3], y: [4] })
    })
    await frame()
    expect(firstWrite.mock.calls.filter(([key]) => key === 'd')).toHaveLength(1)
    expect(secondWrite).not.toHaveBeenCalled()
    expect(axes).not.toHaveBeenCalled()
    expect(path(b, 'first').getAttribute('d')).toBe(path(a, 'first').getAttribute('d'))

    a.update({ marks: [second] })
    await frame()
    expect(a.element.querySelector('[data-mark-id="first"]')).toBeNull()
    a.destroy()
    data.replace({ x: [0, 4], y: [1, 3] })
    await frame()
    expect(path(b, 'first').getAttribute('d')).toContain(
      `L${b.scales.x.project(4)},${b.scales.y.project(3)}`,
    )
    b.destroy()
    expect(reactive.getDiagnostics().activeEffects).toBe(baseline.activeEffects)
    expect(reactive.getDiagnostics().activeScopes).toBe(baseline.activeScopes)
  })

  test.each(['circle', 'square'] as const)(
    'option updates reset nested overrides without ingesting data or recomputing style-only geometry (%s markers)',
    async (symbol) => {
      const data = createSeries({ x: [0, 1], y: [1, 2] })
      const mark = series(data, {
        id: 'obs',
        x: 'x',
        y: 'y',
        line: { stroke: 'red', width: 3 },
        markers: { symbol },
      })
      const current = plot(host(), {
        width: 400,
        height: 200,
        directions: { x: 'x' },
        scales: { x: linearScale(), y: linearScale() },
        marks: [mark],
      })
      await frame()
      const line = path(current, 'obs')
      const marker = current.element.querySelector<SVGGraphicsElement>('[data-mark="marker"]')!
      const markerPath = marker.getAttribute('d')
      const writes = vi.spyOn(line, 'setAttribute')
      const read = vi.spyOn(current.scales.x, 'project')
      mark.update({ line: { stroke: undefined }, markers: { size: 7 } })
      await frame()
      expect(line.getAttribute('stroke')).not.toBe('red')
      expect(line.getAttribute('stroke-width')).toBe('3')
      expect(current.element.querySelector('[data-mark="marker"]')).toBe(marker)
      if (symbol === 'circle') {
        expect(Number(marker.getAttribute('r'))).toBeCloseTo(Math.sqrt(7 / Math.PI))
      } else {
        expect(marker.getBBox().width).toBeCloseTo(Math.sqrt(7))
        expect(marker.getBBox().height).toBeCloseTo(Math.sqrt(7))
        expect(marker.getAttribute('d')).not.toBe(markerPath)
      }
      expect(writes.mock.calls.some(([key]) => key === 'd')).toBe(false)
      expect(read).not.toHaveBeenCalled()
      expect(data.version).toBe(0)
      mark.update({ visible: false })
      await frame()
      expect(line.getAttribute('d')).toBe('')
      mark.update({ visible: undefined, line: false, markers: false, area: { to: 0 } })
      await frame()
      expect(line.getAttribute('display')).toBe('none')
      expect(current.element.querySelectorAll('[data-mark="marker"]')).toHaveLength(0)
      mark.update({ line: undefined, area: undefined })
      await frame()
      expect(line.getAttribute('display')).toBe('')
      expect(line.getAttribute('stroke-width')).toBe('1.5')
      expect(current.element.querySelector('[data-mark="area"]')).toBeNull()
    },
  )

  test('updates the marker symbol on a series without retaining the previous SVG element type', async () => {
    const mark = series(createSeries({ x: [0, 1], y: [1, 2] }), {
      id: 'obs',
      x: 'x',
      y: 'y',
      markers: { symbol: 'x' },
    })
    const current = plot(host(), {
      directions: { x: 'x' },
      scales: { x: linearScale(), y: linearScale() },
      marks: [mark],
    })
    await frame()
    const group = current.element.querySelector('[data-mark="markers"]')!
    expect(group.querySelector('[data-mark="marker"]')?.tagName).toBe('path')

    mark.update({ markers: { symbol: 'circle' } })
    await frame()
    expect(group.querySelectorAll('[data-mark="marker"]')).toHaveLength(2)
    expect(group.querySelector('[data-mark="marker"]')?.tagName).toBe('circle')

    mark.update({ markers: { symbol: 'rectangle' } })
    await frame()
    expect(group.querySelectorAll('[data-mark="marker"]')).toHaveLength(2)
    expect(group.querySelector('[data-mark="marker"]')?.tagName).toBe('path')
  })

  test('validates rebindings atomically across every plot, rejects categorical scales and immutable IDs', async () => {
    const data = createSeries({ x: [0, 1], y: [1, 2] })
    const mark = series(data, { id: 'obs', x: 'x', y: 'y' })
    const current = plot(host(), {
      directions: { x: 'x' },
      scales: {
        x: linearScale(),
        y: linearScale(),
        y2: linearScale({ domain: [0, 10] }),
        categories: bandScale({ domain: ['a'] }),
      },
      marks: [mark],
    })
    await frame()
    expect(() => mark.update({ y: 'missing' })).toThrow(/missing/)
    expect(() => mark.update({ y: 'categories' })).toThrow()
    expect(() => mark.update({ id: 'new' })).toThrow(/immutable/)
    expect(mark.y).toBe('y')
    mark.update({ y: 'y2' })
    await frame()
    expect(path(current, 'obs').getAttribute('d')).toContain(String(current.scales.y2.project(2)))
    const second = plot(host(), {
      directions: { x: 'x' },
      scales: { x: linearScale(), y2: linearScale() },
      marks: [mark],
    })
    expect(() => mark.update({ y: 'y' })).toThrow(/missing/)
    expect(mark.y).toBe('y2')
    second.destroy()
    mark.update({ y: 'y' })
    expect(mark.y).toBe('y')
  })

  test('preserves DOM resources by explicit ID when reordered/replaced and removes every owned component', async () => {
    const data = createSeries({ x: [0, 1], y: [1, 2] })
    const a = series(data, { id: 'a', x: 'x', y: 'y', markers: {}, area: { to: 0 } })
    const b = series(data, { id: 'b', x: 'x', y: 'y', markers: {}, area: { to: 0 } })
    const config = {
      directions: { x: 'x' as const },
      scales: { x: linearScale(), y: linearScale() },
      marks: [a, b],
    }
    const current = plot(host(), config)
    await frame()
    const aPath = path(current, 'a')
    const bPath = path(current, 'b')
    current.update({ marks: [b, a] })
    await frame()
    expect([...current.element.querySelectorAll('[data-mark="line"]')]).toEqual([bPath, aPath])
    current.setConfig({ ...config, marks: [series(data, { id: 'a', x: 'x', y: 'y' })] })
    await frame()
    expect(path(current, 'a')).toBe(aPath)
    expect(
      current.element.querySelectorAll('[data-mark="area"],[data-mark="markers"]'),
    ).toHaveLength(0)
    current.update({ marks: [] })
    await frame()
    expect(current.element.querySelector('[data-layer="marks"]')?.children).toHaveLength(0)
  })
})

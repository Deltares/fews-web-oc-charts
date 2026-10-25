import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  angularScale,
  axis,
  bandScale,
  createPlot,
  createPolarPlot,
  line,
  linearScale,
  radialScale,
  timeScale,
  type Plot,
} from '../../src/index.js'

const plots: Plot[] = []
const hosts: HTMLElement[] = []

function host(width = 640, height = 360) {
  const element = document.createElement('div')
  element.style.width = `${width}px`
  element.style.height = `${height}px`
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
  vi.restoreAllMocks()
})

describe('static line marks', () => {
  test('normalizes every FEWS marker symbol and keeps open symbols visible by default', () => {
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
    for (const symbol of symbols) {
      const mark = line({
        x: 'x',
        y: 'y',
        xValues: [0],
        yValues: [1],
        markers: { symbol },
      })
      expect(mark.markers?.symbol).toBe(symbol)
      expect(mark.markers?.size).toBe(10)
      if (symbol === 'x' || symbol === 'plus') {
        expect(mark.markers?.strokeWidth).toBeGreaterThan(0)
      }
    }
  })

  test('normalizes and validates the line visibility flag', () => {
    const options = { x: 'x', y: 'y', xValues: [0, 1], yValues: [1, 2] }
    expect(line(options).line).toBe(true)
    expect(line({ ...options, line: undefined }).line).toBe(true)
    expect(line({ ...options, line: true }).line).toBe(true)
    expect(line({ ...options, line: false }).line).toBe(false)
    for (const value of [null, 0, 'false', {}]) {
      // @ts-expect-error Invalid flags must also fail for JavaScript callers.
      expect(() => line({ ...options, line: value })).toThrow(/line.line must be a boolean/)
    }
  })

  test('updates theme and colour attributes without projecting points or rewriting paths', async () => {
    const element = host()
    const current = plot(element, {
      theme: 'light',
      themeElement: element,
      scales: { x: linearScale(), y: linearScale() },
      directions: { x: 'x' },
      marks: [
        line({ x: 'x', y: 'y', xValues: [0, 1], yValues: [0, 1] }),
        line({
          x: 'x',
          y: 'y',
          xValues: [0, 1],
          yValues: [1, 0],
          stroke: '#1677a6',
          strokeWidth: 3,
        }),
      ],
    })
    await frame()
    const paths = [...current.element.querySelectorAll<SVGPathElement>('[data-mark="line"]')]
    const geometry = paths.map((path) => path.getAttribute('d'))
    const attributes = paths.map((path) => vi.spyOn(path, 'setAttribute'))
    const projectX = vi.spyOn(current.scales.x, 'project')
    const projectY = vi.spyOn(current.scales.y, 'project')

    current.update({ theme: 'dark' })
    await frame()
    expect(paths[0].getAttribute('stroke')).toContain('#66c2ff')
    expect(paths[1].getAttribute('stroke')).toBe('#1677a6')
    expect(paths[1].getAttribute('stroke-width')).toBe('3')

    element.style.setProperty('--fews-chart-accent', '#ff0000')
    await vi.waitFor(() => expect(paths[0].getAttribute('stroke')).toContain('#ff0000'))
    expect(paths[1].getAttribute('stroke')).toBe('#1677a6')
    expect(projectX).not.toHaveBeenCalled()
    expect(projectY).not.toHaveBeenCalled()
    expect(paths.map((path) => path.getAttribute('d'))).toEqual(geometry)
    paths.forEach((path, index) => {
      expect(current.element.querySelectorAll('[data-mark="line"]')[index]).toBe(path)
      expect(
        attributes[index].mock.calls.every(
          ([name]) => name === 'stroke' || name === 'stroke-width',
        ),
      ).toBe(true)
    })
  })

  test('rebuilds geometry and applies styles for layout and coalesced scale/theme changes', async () => {
    const element = host()
    const x = linearScale()
    const current = plot(element, {
      theme: 'light',
      themeElement: element,
      scales: { x, y: linearScale() },
      axes: [axis('x', { position: 'bottom' }), axis('y')],
      marks: [line({ x: 'x', y: 'y', xValues: [0, 1], yValues: [0, 1] })],
    })
    await frame()
    const path = current.element.querySelector<SVGPathElement>('[data-mark="line"]')!
    const original = path.getAttribute('d')
    const attributes = vi.spyOn(path, 'setAttribute')
    const projectX = vi.spyOn(current.scales.x, 'project')

    element.style.setProperty('--fews-chart-font-size', '24px')
    await vi.waitFor(() => expect(path.getAttribute('d')).not.toBe(original))
    expect(projectX).toHaveBeenCalled()
    expect(attributes.mock.calls.some(([name]) => name === 'd')).toBe(true)

    attributes.mockClear()
    x.domain.set([0, 2])
    current.update({ theme: 'dark' })
    await frame()
    expect(path.getAttribute('d')).toBe(
      `M${current.scales.x.project(0)},${current.scales.y.project(0)}` +
        `L${current.scales.x.project(1)},${current.scales.y.project(1)}`,
    )
    expect(attributes.mock.calls.filter(([name]) => name === 'd')).toHaveLength(1)
    expect(path.getAttribute('stroke')).toContain('#66c2ff')

    current.update({
      marks: [
        line({
          id: 'replacement',
          x: 'x',
          y: 'y',
          xValues: [0, 2],
          yValues: [1, 0],
          stroke: '#1677a6',
          strokeWidth: 3,
        }),
      ],
    })
    await frame()
    const replacement = current.element.querySelector<SVGPathElement>('[data-mark="line"]')!
    expect(replacement).not.toBe(path)
    expect(path.isConnected).toBe(false)
    expect(replacement.getAttribute('data-mark-id')).toBe('replacement')
    expect(replacement.getAttribute('stroke')).toBe('#1677a6')
    expect(replacement.getAttribute('stroke-width')).toBe('3')
    expect(replacement.getAttribute('d')).toBe(
      `M${current.scales.x.project(0)},${current.scales.y.project(1)}` +
        `L${current.scales.x.project(2)},${current.scales.y.project(0)}`,
    )
  })

  test('renders named time/value scales, a secondary axis, and missing-value gaps', async () => {
    const t = timeScale({ domain: [0, 3], timeZone: 'UTC' })
    const q = linearScale({ domain: [0, 100] })
    const rain = linearScale({ domain: [0, 10] })
    const discharge = line({
      id: 'discharge',
      x: 't',
      y: 'q',
      xValues: [0, 1, 2, 3],
      yValues: [0, 50, Number.NaN, 100],
      stroke: '#1677a6',
    })
    const rainfall = line({
      id: 'rainfall',
      x: 't',
      y: 'rain',
      xValues: [0, 3],
      yValues: [2, 8],
      stroke: '#d17b0f',
    })
    const current = plot(host(), {
      scales: { t, q, rain },
      axes: [
        axis('t', { position: 'bottom', tickCount: 3 }),
        axis('q', { position: 'left' }),
        axis('rain', { position: 'right' }),
      ],
      marks: [discharge, rainfall],
    })
    await frame()

    const paths = current.element.querySelectorAll<SVGPathElement>(
      '[data-layer="marks"] path[data-mark="line"]',
    )
    const first = paths[0]
    const second = paths[1]
    if (!first || !second) throw new Error('Expected both line marks to render.')
    expect(first.getAttribute('data-mark-id')).toBe('discharge')
    expect(first.getAttribute('display')).toBe('')
    expect(first.getAttribute('stroke')).toBe('#1677a6')
    expect(first.getAttribute('d')).toBe(
      `M${current.scales.t.project(0)},${current.scales.q.project(0)}` +
        `L${current.scales.t.project(1)},${current.scales.q.project(50)}` +
        `M${current.scales.t.project(3)},${current.scales.q.project(100)}`,
    )
    expect(second.getAttribute('data-mark-id')).toBe('rainfall')
    expect(second.getAttribute('d')).toContain('L')
    expect(current.element.querySelectorAll('[data-layer="axes"] > g')).toHaveLength(3)
    expect(
      current.element.querySelector('[data-layer="marks"]')?.getAttribute('clip-path'),
    ).toMatch(/^url\(#fews-plot-clip-/)

    t.domain.set([0, 6])
    await frame()
    expect(first.getAttribute('d')).toContain(`${current.scales.t.project(1)}`)
  })

  test('renders line, baseline area and markers together while preserving data gaps', async () => {
    const current = plot(host(), {
      scales: {
        x: linearScale({ domain: [0, 4] }),
        y: linearScale({ domain: [0, 10] }),
      },
      directions: { x: 'x' },
      marks: [
        line({
          id: 'observed',
          x: 'x',
          y: 'y',
          xValues: [0, 1, 2, 3, 4],
          yValues: [1, 2, Number.NaN, 4, 5],
          stroke: '#1677a6',
          markers: { size: 5, fill: '#ffffff', stroke: '#1677a6', strokeWidth: 1 },
          area: { to: 0, opacity: 0.3 },
        }),
      ],
    })
    await frame()

    const linePath = current.element.querySelector<SVGPathElement>('[data-mark="line"]')!
    const areaPath = current.element.querySelector<SVGPathElement>('[data-mark="area"]')!
    const markerGroup = current.element.querySelector<SVGGElement>('[data-mark="markers"]')!
    const x0 = current.scales.x.project(0)
    const x1 = current.scales.x.project(1)
    const x3 = current.scales.x.project(3)
    const x4 = current.scales.x.project(4)
    const baseline = current.scales.y.project(0)

    expect(linePath.getAttribute('d')).toBe(
      `M${x0},${current.scales.y.project(1)}L${x1},${current.scales.y.project(2)}` +
        `M${x3},${current.scales.y.project(4)}L${x4},${current.scales.y.project(5)}`,
    )
    expect(areaPath.getAttribute('d')).toBe(
      `M${x0},${baseline}L${x0},${current.scales.y.project(1)}` +
        `L${x1},${current.scales.y.project(2)}L${x1},${baseline}Z` +
        `M${x3},${baseline}L${x3},${current.scales.y.project(4)}` +
        `L${x4},${current.scales.y.project(5)}L${x4},${baseline}Z`,
    )
    expect(areaPath.getAttribute('fill-opacity')).toBe('0.3')
    expect(markerGroup.querySelectorAll('circle')).toHaveLength(4)
    expect(Number(markerGroup.querySelector('circle')?.getAttribute('r'))).toBeCloseTo(
      Math.sqrt(5 / Math.PI),
    )
    expect(markerGroup.querySelector('circle')?.getAttribute('fill')).toBe('#ffffff')
    expect(markerGroup.querySelector('circle')?.getAttribute('stroke')).toBe('#1677a6')
  })

  test('renders the FEWS marker symbol set with oriented triangles and open x/plus glyphs', async () => {
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
    const current = plot(host(), {
      scales: { x: linearScale({ domain: [0, 1] }), y: linearScale({ domain: [0, 1] }) },
      directions: { x: 'x' },
      marks: symbols.map((symbol) =>
        line({
          id: symbol,
          x: 'x',
          y: 'y',
          xValues: [0.5],
          yValues: [0.5],
          markers: { symbol },
        }),
      ),
    })
    await frame()

    for (const shape of symbols) {
      const group = current.element.querySelector<SVGGElement>(
        `[data-mark="markers"][data-mark-id="${shape}"]`,
      )!
      const marker = group.querySelector<SVGElement>('[data-mark="marker"]')!
      expect(marker.tagName).toBe(shape === 'circle' ? 'circle' : 'path')
      if (shape !== 'circle') expect(marker.getAttribute('d')).not.toBe('')
      if (shape === 'triangle-down') expect(marker.getAttribute('transform')).toContain('180')
      if (shape === 'triangle-left') expect(marker.getAttribute('transform')).toContain('-90')
      if (shape === 'triangle-right') expect(marker.getAttribute('transform')).toContain('90')
      if (shape === 'x' || shape === 'plus') {
        expect(marker.getAttribute('fill')).toBe('none')
        expect(marker.getAttribute('stroke')).not.toBe('none')
        expect(Number(marker.getAttribute('stroke-width'))).toBeGreaterThan(0)
      }
    }
  })

  test('removes optional series layers when replacing a marked line', async () => {
    const current = plot(host(), {
      scales: { x: linearScale({ domain: [0, 1] }), y: linearScale({ domain: [0, 1] }) },
      directions: { x: 'x' },
      marks: [
        line({
          id: 'series',
          x: 'x',
          y: 'y',
          xValues: [0, 1],
          yValues: [0, 1],
          markers: true,
          area: { to: 0 },
        }),
      ],
    })
    await frame()
    expect(current.element.querySelector('[data-mark="area"]')).not.toBeNull()
    expect(current.element.querySelector('[data-mark="markers"]')).not.toBeNull()

    current.update({
      marks: [line({ id: 'series', x: 'x', y: 'y', xValues: [0, 1], yValues: [1, 0] })],
    })
    await frame()
    expect(current.element.querySelectorAll('[data-mark="line"]')).toHaveLength(1)
    expect(current.element.querySelector('[data-mark="area"]')).toBeNull()
    expect(current.element.querySelector('[data-mark="markers"]')).toBeNull()
  })

  test('can hide the line while retaining markers and area', async () => {
    const current = plot(host(), {
      scales: { x: linearScale({ domain: [0, 1] }), y: linearScale({ domain: [0, 1] }) },
      directions: { x: 'x' },
      marks: [
        line({
          id: 'series',
          x: 'x',
          y: 'y',
          xValues: [0, 1],
          yValues: [0, 1],
          line: false,
          markers: true,
          area: { to: 0 },
        }),
      ],
    })
    await frame()

    expect(current.element.querySelector('[data-mark="line"]')?.getAttribute('display')).toBe(
      'none',
    )
    expect(current.element.querySelectorAll('[data-mark="marker"]')).toHaveLength(2)
    expect(current.element.querySelector('[data-mark="area"]')?.getAttribute('d')).not.toBe('')
  })

  test('updates and removes marks atomically with plot configuration', async () => {
    const mark = line({ id: 'one', x: 'x', y: 'y', xValues: [0, 1], yValues: [1, 2] })
    const current = plot(host(), {
      scales: { x: linearScale({ domain: [0, 1] }), y: linearScale({ domain: [0, 2] }) },
      directions: { x: 'x' },
      marks: [mark],
    })
    await frame()
    expect(current.element.querySelectorAll('[data-mark="line"]')).toHaveLength(1)

    expect(() =>
      current.update({
        marks: [line({ x: 'missing', y: 'y', xValues: [0], yValues: [1] })],
      }),
    ).toThrow(/missing x or y scale/)
    expect(current.options.get().resolved.marks).toEqual([mark])

    current.update({ marks: [] })
    await frame()
    expect(current.element.querySelectorAll('[data-mark="line"]')).toHaveLength(0)
  })

  test('synchronously rejects values that do not match their bound scale kind', async () => {
    const mark = line({ id: 'one', x: 'x', y: 'y', xValues: [0, 1], yValues: [1, 2] })
    const current = plot(host(), {
      scales: { x: linearScale({ domain: [0, 1] }), y: linearScale({ domain: [0, 2] }) },
      directions: { x: 'x' },
      marks: [mark],
    })
    await frame()
    const path = current.element.querySelector('[data-mark="line"]')!
    const rendered = path.getAttribute('d')

    expect(() =>
      current.update({
        marks: [line({ id: 'bad', x: 'x', y: 'y', xValues: [0, 1], yValues: [1, 'high'] })],
      }),
    ).toThrow(/line "bad" yValues\[1\] must be a number for linear scale "y"/)
    expect(current.options.get().resolved.marks).toEqual([mark])
    await frame()
    expect(path.getAttribute('d')).toBe(rendered)

    expect(() => current.update({ scales: { x: bandScale({ domain: ['a', 'b'] }) } })).toThrow(
      /xValues\[0\] must be a string for band scale "x"/,
    )
    expect(() =>
      plot(host(), {
        scales: { x: timeScale({ domain: [0, 1] }), y: linearScale() },
        directions: { x: 'x' },
        marks: [line({ x: 'x', y: 'y', xValues: ['2024-01-01'], yValues: [1] })],
      }),
    ).toThrow(/xValues\[0\] must be a number for time scale "x"/)

    current.update({
      scales: { x: bandScale({ domain: ['a', 'b'] }) },
      marks: [line({ x: 'x', y: 'y', xValues: ['a', null, 'b'], yValues: [1, 2, Number.NaN] })],
    })
    await frame()
    expect(path.isConnected).toBe(false)
    expect(current.element.querySelector('[data-mark="line"]')?.getAttribute('d')).toMatch(
      /^M[^L]+$/,
    )
  })

  test('validates line values and rejects polar areas', () => {
    expect(() => line({ x: 'x', y: 'y', xValues: [0], yValues: [] })).toThrow(/equal lengths/)
    expect(() => line({ x: 'x', y: 'y', xValues: [0], yValues: [1], strokeWidth: 0 })).toThrow(
      /positive finite/,
    )
    const invalid = {
      x: 'x',
      y: 'y',
      xValues: [0],
      yValues: [1],
      unexpected: true,
    }
    expect(() => line(invalid)).toThrow(/line.unexpected/)
    expect(
      line({ x: 'x', y: 'y', xValues: [0], yValues: [1], markers: { size: 0 } }).markers?.size,
    ).toBe(0)
    expect(() =>
      line({ x: 'x', y: 'y', xValues: [0], yValues: [1], markers: { size: -1 } }),
    ).toThrow(/nonnegative finite/)
    expect(() =>
      line({ x: 'x', y: 'y', xValues: [0], yValues: [1], area: { to: 0, opacity: 2 } }),
    ).toThrow(/area.opacity/)

    const element = host()
    expect(() =>
      createPolarPlot(element, {
        scales: { theta: angularScale(), radius: radialScale() },
        marks: [line({ x: 'theta', y: 'radius', xValues: [0], yValues: [1], area: { to: 0 } })],
      }),
    ).toThrow(/Polar series areas require band/)
  })
})

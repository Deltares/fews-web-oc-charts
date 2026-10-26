import { afterEach, describe, expect, test } from 'vitest'
import {
  angularScale,
  band,
  bandScale,
  createPlot,
  createPolarPlot,
  linearScale,
  radialScale,
  range,
  type Plot,
} from '../../src/index.js'
import { bandDefinition } from '../../src/plot/marks/band/band-mark.js'
import { markExtents } from '../../src/plot/marks/mark-extents.js'
import { isStaticMarkVisible, staticLegend } from '../../src/plot/marks/static-legend.js'

const plots: Plot[] = []
const hosts: HTMLElement[] = []

function create(host: HTMLElement, config: Parameters<typeof createPlot>[1]) {
  const plot = createPlot(host, config)
  plots.push(plot)
  return plot
}

function host() {
  const element = document.createElement('div')
  element.style.width = '400px'
  element.style.height = '240px'
  document.body.append(element)
  hosts.push(element)
  return element
}

async function frame() {
  await new Promise(requestAnimationFrame)
  await new Promise(requestAnimationFrame)
}

afterEach(() => {
  plots.splice(0).forEach((plot) => plot.destroy())
  hosts.splice(0).forEach((element) => element.remove())
})

describe('band marks', () => {
  test('validates binding consumers before publishing data or legend state', () => {
    const mark = band({
      x: 'x',
      y: 'y',
      label: 'Original',
      xValues: [[0, 1]],
      yValues: [[2, 4]],
    })
    const scales = { x: linearScale(), y: linearScale(), next: linearScale() }
    const stopFirst = bandDefinition.validateUpdates!(mark, () => ({
      coordinateSystem: 'cartesian',
      scales,
      direction: (name) => (name === 'x' ? 'x' : 'y'),
    }))
    const stopSecond = bandDefinition.validateUpdates!(mark, () => ({
      coordinateSystem: 'cartesian',
      scales: { x: scales.x, y: scales.y },
      direction: (name) => (name === 'x' ? 'x' : 'y'),
    }))
    try {
      expect(() =>
        mark.update({ y: 'next', label: 'Rejected', visible: false, yValues: [[10, 20]] }),
      ).toThrow(/missing x or y scale/)
      expect(mark.y).toBe('y')
      expect(mark.label).toBe('Original')
      expect(isStaticMarkVisible(mark)).toBe(true)
      expect(mark.yValues).toEqual([[2, 4]])
      stopSecond()
      mark.update({ y: 'next', label: 'Accepted', legendGroup: 'Group' })
      expect(markExtents([mark], scales, 'y', 'data')).toBeUndefined()
      expect(markExtents([mark], scales, 'next', 'data')).toEqual([2, 4])
      const legend = staticLegend(mark, { type: 'area', fill: 'red', opacity: 1 })!
      expect(legend.label).toBe('Accepted')
      expect(legend.group).toBe('Group')
      legend.setVisible(false)
      mark.update({ label: 'Still hidden', legendGroup: undefined })
      expect(legend.visible()).toBe(false)
      expect(mark.visible).toBe(false)
      expect(markExtents([mark], scales, 'next', 'data')).toBeUndefined()
      mark.update({ visible: undefined, label: undefined })
      expect(isStaticMarkVisible(mark)).toBe(true)
      expect(staticLegend(mark, { type: 'area', fill: 'red', opacity: 1 })).toBeUndefined()
      expect(markExtents([mark], scales, 'next', 'data')).toEqual([2, 4])
    } finally {
      stopFirst()
      stopSecond()
    }
  })

  test('rebinds scales reactively and moves autoscale contributions without replacing nodes', async () => {
    const mark = band({
      id: 'rebound',
      x: 'x',
      y: 'y',
      xValues: [[2, 4]],
      yValues: [[10, 20]],
    })
    const plot = create(host(), {
      width: 400,
      height: 240,
      scales: {
        x: linearScale({ domain: [0, 10] }),
        x2: linearScale({ domain: [0, 20] }),
        y: linearScale(),
        y2: linearScale(),
      },
      directions: { x: 'x', x2: 'x' },
      marks: [mark, band({ x: 'x', y: 'y', xValues: [[0, 1]], yValues: [[0, 1]] })],
    })
    await frame()
    const group = plot.element.querySelector('[data-mark-id="rebound"]')!
    const rect = group.firstElementChild!
    const original = rect.getAttribute('x')
    expect(plot.scales.y.scale.domain.get()).toEqual([0, 20])
    mark.update({ x: 'x2', y: 'y2' })
    await frame()
    expect(mark.x).toBe('x2')
    expect(mark.y).toBe('y2')
    expect(plot.scales.y.scale.domain.get()).toEqual([0, 1])
    expect(plot.scales.y2.scale.domain.get()).toEqual([10, 20])
    expect(plot.element.querySelector('[data-mark-id="rebound"]')).toBe(group)
    expect(group.firstElementChild).toBe(rect)
    expect(rect.getAttribute('x')).not.toBe(original)
    expect(rect.getAttribute('x')).toBe(String(plot.scales.x2.project(2)))
  })

  test('rejects binding changes atomically against all plots and releases validators on destroy', () => {
    const mark = band({
      x: 'x',
      y: 'y',
      label: 'Original',
      xValues: [[0, 1]],
      yValues: [[0, 1]],
    })
    create(host(), {
      scales: { x: linearScale(), y: linearScale(), other: linearScale(), category: bandScale() },
      directions: { x: 'x', category: 'y' },
      marks: [mark],
    })
    const second = create(host(), {
      scales: { x: linearScale(), y: linearScale() },
      directions: { x: 'x' },
      marks: [mark],
    })
    expect(() => mark.update({ y: 'other', label: 'Rejected', visible: false })).toThrow(
      /missing x or y scale/,
    )
    expect(mark.y).toBe('y')
    expect(mark.label).toBe('Original')
    expect(mark.visible).toBe(true)
    expect(() => mark.update({ x: 'y' })).toThrow(/x-direction/)
    expect(() => mark.update({ y: 'category' })).toThrow(/numeric or time scales/)
    second.destroy()
    expect(() => mark.update({ y: 'other', label: 'Accepted' })).not.toThrow()
    expect(mark.y).toBe('other')
    expect(mark.label).toBe('Accepted')
  })

  test('updates, clears and restores legend metadata and visibility', async () => {
    const mark = band({
      id: 'legend-band',
      x: 'x',
      y: 'y',
      xValues: [[0, 1]],
      yValues: [[2, 4]],
    })
    const plot = create(host(), {
      scales: { x: linearScale(), y: linearScale() },
      directions: { x: 'x' },
      marks: [mark],
    })
    await frame()
    expect(plot.legend.entries.get()).toHaveLength(0)
    mark.update({ label: 'Forecast', visible: false })
    await frame()
    expect(plot.legend.entries.get()[0]).toMatchObject({
      id: 'legend-band',
      label: 'Forecast',
      visibility: 'hidden',
    })
    const group = plot.element.querySelector('[data-mark="band"]')!
    expect(group.getAttribute('display')).toBe('none')
    mark.update({ label: 'New forecast', legendGroup: 'Forecasts', visible: undefined })
    await frame()
    const entry = plot.legend.entries.get()[0]!
    expect(entry.label).toBe('Forecasts')
    expect(entry.children[0]).toMatchObject({ label: 'New forecast', visibility: 'visible' })
    expect(group.hasAttribute('display')).toBe(false)
    plot.legend.setVisible('legend-band', false)
    mark.update({ legendGroup: undefined })
    await frame()
    expect(mark.visible).toBe(false)
    expect(plot.legend.entries.get()[0]).toMatchObject({
      label: 'New forecast',
      visibility: 'hidden',
      children: [],
    })
    mark.update({ label: undefined })
    await frame()
    expect(plot.legend.entries.get()).toHaveLength(0)
    expect(group.getAttribute('display')).toBe('none')
    mark.update({ label: 'Restored', visible: true })
    await frame()
    expect(plot.legend.entries.get()[0]).toMatchObject({
      label: 'Restored',
      visibility: 'visible',
    })
  })

  test('updates data, autoscale and legend styling without replacing the mark or SVG nodes', async () => {
    const mark = band({
      id: 'live-band',
      label: 'Live band',
      x: 'x',
      y: 'y',
      xValues: [[1, 2]],
      yValues: [[3, 4]],
    })
    const plot = create(host(), {
      width: 400,
      height: 240,
      scales: { x: linearScale(), y: linearScale() },
      directions: { x: 'x' },
      marks: [mark],
    })
    await frame()
    const group = plot.element.querySelector('[data-mark="band"]')!
    const rect = group.firstElementChild!
    mark.update({
      xValues: [
        [2, 5],
        [6, 8],
      ],
      yValues: [
        [10, 20],
        [30, 40],
      ],
      fill: '#1677a6',
      opacity: 0.4,
      shapeRendering: 'crispEdges',
    })
    await frame()
    expect(plot.scales.x.scale.domain.get()).toEqual([2, 8])
    expect(plot.scales.y.scale.domain.get()).toEqual([10, 40])
    expect(plot.element.querySelector('[data-mark="band"]')).toBe(group)
    expect(group.firstElementChild).toBe(rect)
    expect(group.children).toHaveLength(2)
    expect(rect.getAttribute('x')).toBe(String(plot.scales.x.project(2)))
    expect(rect.getAttribute('width')).toBe(
      String(plot.scales.x.project(5) - plot.scales.x.project(2)),
    )
    expect(group.getAttribute('fill')).toBe('#1677a6')
    expect(group.getAttribute('fill-opacity')).toBe('0.4')
    expect(group.getAttribute('shape-rendering')).toBe('crispEdges')
    expect(plot.legend.entries.get()[0]?.symbol).toMatchObject({
      fill: '#1677a6',
      opacity: 0.4,
    })

    const values = mark.xValues
    mark.update({ fill: undefined, opacity: undefined, shapeRendering: undefined })
    await frame()
    expect(mark.xValues).toBe(values)
    expect(mark.fill).toBeUndefined()
    expect(mark.opacity).toBe(1)
    expect(group.getAttribute('fill-opacity')).toBe('1')
    expect(group.hasAttribute('shape-rendering')).toBe(false)
    expect(group.firstElementChild).toBe(rect)
    mark.update({ xValues: [[4, 5]], yValues: [[12, 18]] })
    await frame()
    expect(group.children).toHaveLength(1)
    expect(group.firstElementChild).toBe(rect)
  })

  test('reuses curved paths and switches between curve and interval geometry', async () => {
    const mark = range({
      x: 'x',
      y: 'y',
      xValues: [
        [0, 0],
        [1, 1],
      ],
      yValues: [
        [0, 1],
        [1, 2],
      ],
      curve: 'linear',
      opacity: 0.3,
    })
    const plot = create(host(), {
      scales: { x: linearScale({ domain: [0, 2] }), y: linearScale({ domain: [0, 5] }) },
      directions: { x: 'x' },
      marks: [mark],
    })
    await frame()
    const group = plot.element.querySelector('[data-mark="band"]')!
    const path = group.firstElementChild!
    const original = path.getAttribute('d')
    mark.update({
      yValues: [
        [1, 3],
        [2, 4],
      ],
      curve: 'step',
    })
    await frame()
    expect(group.firstElementChild).toBe(path)
    expect(path.getAttribute('d')).not.toBe(original)
    expect(group.getAttribute('opacity')).toBe('0.3')
    expect(group.getAttribute('fill-opacity')).toBe('1')

    mark.update({
      curve: undefined,
      xValues: [
        [0, 1],
        [1, 2],
      ],
    })
    await frame()
    expect([...group.children].map((node) => node.localName)).toEqual(['rect', 'rect'])
    expect(group.getAttribute('opacity')).toBe('1')
    expect(group.getAttribute('fill-opacity')).toBe('0.3')
    mark.update({
      curve: 'basis',
      xValues: [
        [0, 0],
        [1, 1],
      ],
    })
    await frame()
    expect(group.children).toHaveLength(1)
    expect(group.firstElementChild?.getAttribute('data-mark')).toBe('band-area')
  })

  test('validates updates atomically and copies incoming ranges', () => {
    const mark = range({ x: 'x', y: 'y', xValues: [[0, 1]], yValues: [[0, 1]] })
    const original = mark.xValues
    expect(() => mark.update({ xValues: [[2, 1]], fill: 'red' })).toThrow(/ascending pair/)
    expect(() => mark.update({ yValues: [] })).toThrow(/equal lengths/)
    expect(() => mark.update({ opacity: 2 })).toThrow(/between 0 and 1/)
    expect(() => mark.update({ fill: '' })).toThrow(/non-empty string/)
    expect(() => mark.update({ curve: 'basis' })).toThrow(/equal x endpoints/)
    expect(() => mark.update({ x: '' })).toThrow(/must name a plot scale/)
    expect(() => mark.update({ y: undefined })).toThrow(/must name a plot scale/)
    expect(() => mark.update({ label: '' })).toThrow(/non-empty string/)
    expect(() => mark.update({ legendGroup: '' })).toThrow(/non-empty string/)
    // @ts-expect-error Visibility must be boolean.
    expect(() => mark.update({ visible: 'yes' })).toThrow(/must be boolean/)
    // @ts-expect-error Identity cannot be updated.
    expect(() => mark.update({ id: 'other' })).toThrow(/Unknown option/)
    // @ts-expect-error Invalid curve values are also rejected at runtime.
    expect(() => mark.update({ curve: 'invalid' })).toThrow(/band.curve/)
    // @ts-expect-error Invalid shape-rendering values are also rejected at runtime.
    expect(() => mark.update({ shapeRendering: 'invalid' })).toThrow(/band.shapeRendering/)
    // @ts-expect-error Updates must be objects.
    expect(() => mark.update(null)).toThrow(/must be an object/)
    expect(mark.xValues).toBe(original)
    expect(mark.fill).toBeUndefined()
    const values: [number, number][] = [[2, 3]]
    mark.update({ xValues: values })
    values[0][0] = 100
    expect(mark.xValues).toEqual([[2, 3]])
    expect(Object.isFrozen(mark.xValues[0])).toBe(true)
  })

  test('updates polar sectors and releases plot-specific validation when removed', async () => {
    const mark = range({
      x: 'theta',
      y: 'distance',
      xValues: [[30, 30]],
      yValues: [[2, 4]],
    })
    const plot = createPolarPlot(host(), {
      scales: {
        theta: angularScale({ domain: [0, 360] }),
        distance: radialScale({ domain: [0, 10] }),
      },
      marks: [mark],
    })
    plots.push(plot)
    await frame()
    const path = plot.element.querySelector('[data-mark="band-range"]')!
    const original = path.getAttribute('d')
    expect(() => mark.update({ curve: 'linear', fill: 'red' })).toThrow(/cartesian plots only/)
    expect(mark.curve).toBeUndefined()
    expect(mark.fill).toBeUndefined()
    mark.update({ xValues: [[30, 90]], yValues: [[3, 6]] })
    await frame()
    expect(plot.element.querySelector('[data-mark="band-range"]')).toBe(path)
    expect(path.getAttribute('d')).not.toBe(original)
    plot.update({ marks: [] })
    expect(() => mark.update({ xValues: [[30, 30]], curve: 'linear' })).not.toThrow()
  })

  test('retains legend visibility through updates and renders the latest data when shown', async () => {
    const mark = range({
      id: 'hidden-band',
      label: 'Band',
      x: 'x',
      y: 'y',
      xValues: [[0, 1]],
      yValues: [[0, 1]],
    })
    const plot = create(host(), {
      scales: { x: linearScale(), y: linearScale() },
      directions: { x: 'x' },
      marks: [mark],
    })
    await frame()
    plot.legend.setVisible('hidden-band', false)
    mark.update({ xValues: [[2, 4]], yValues: [[5, 8]], fill: 'red' })
    await frame()
    const group = plot.element.querySelector('[data-mark="band"]')!
    expect(group.getAttribute('display')).toBe('none')
    expect(plot.legend.entries.get()[0]?.visibility).toBe('hidden')
    plot.legend.setVisible('hidden-band', true)
    await frame()
    expect(group.hasAttribute('display')).toBe(false)
    expect(group.getAttribute('fill')).toBe('red')
    expect(plot.scales.x.scale.domain.get()).toEqual([2, 4])
    expect(plot.scales.y.scale.domain.get()).toEqual([5, 8])
  })

  test('replaces curved paths with interval rectangles for the same mark ID', async () => {
    const config = {
      id: 'changing',
      x: 'x',
      y: 'y',
      xValues: [
        [0, 0],
        [1, 1],
      ] as [number, number][],
      yValues: [
        [0, 1],
        [1, 2],
      ] as [number, number][],
    }
    const current = create(host(), {
      scales: { x: linearScale(), y: linearScale() },
      directions: { x: 'x' },
      axisLayout: 'inset',
      marks: [range({ ...config, curve: 'basis', opacity: 0.3 })],
    })
    await frame()
    const group = current.element.querySelector('[data-mark="band"]')!
    expect(group.querySelector('[data-mark="band-area"]')?.localName).toBe('path')
    expect(group.getAttribute('opacity')).toBe('0.3')
    current.update({ marks: [range(config)] })
    await frame()
    expect(group.querySelector('[data-mark="band-area"]')).toBeNull()
    expect([...group.children].map((node) => node.localName)).toEqual(['rect', 'rect'])
  })

  test('renders x/y intervals as clipped rectangles and contributes their bounds to autoscale', async () => {
    const mark = range({
      id: 'intervals',
      x: 'x',
      y: 'y',
      xValues: [[1, 2], [3, 5], null],
      yValues: [
        [4, 8],
        [0, 2],
        [100, 200],
      ],
      fill: '#1677a6',
      opacity: 0.4,
    })
    const plot = create(host(), {
      width: 400,
      height: 240,
      scales: { x: linearScale(), y: linearScale() },
      directions: { x: 'x' },
      marks: [mark],
    })
    await frame()

    expect(plot.scales.x.scale.domain.get()).toEqual([1, 5])
    expect(plot.scales.y.scale.domain.get()).toEqual([0, 8])
    const group = plot.element.querySelector<SVGGElement>('[data-mark="band"]')
    expect(group?.dataset.markId).toBe('intervals')
    expect(group?.getAttribute('fill')).toBe('#1677a6')
    expect(group?.getAttribute('fill-opacity')).toBe('0.4')
    const rects = [...plot.element.querySelectorAll<SVGRectElement>('[data-mark="band-range"]')]
    expect(rects).toHaveLength(2)
    expect(rects[0]?.getAttribute('x')).toBe(String(plot.scales.x.project(1)))
    expect(rects[0]?.getAttribute('y')).toBe(String(plot.scales.y.project(8)))
    expect(rects[0]?.getAttribute('width')).toBe(
      String(plot.scales.x.project(2) - plot.scales.x.project(1)),
    )
    expect(rects[0]?.getAttribute('height')).toBe(
      String(plot.scales.y.project(4) - plot.scales.y.project(8)),
    )
    expect(plot.element.querySelector('[data-layer="marks"]')?.getAttribute('clip-path')).toMatch(
      /^url\(#fews-plot-clip-/,
    )
  })

  test('reprojects ranges when a scale changes and reuses the SVG nodes', async () => {
    const plot = create(host(), {
      width: 400,
      height: 240,
      scales: {
        x: linearScale({ domain: [0, 10] }),
        y: linearScale({ domain: [0, 10] }),
      },
      directions: { x: 'x' },
      marks: [
        range({
          x: 'x',
          y: 'y',
          xValues: [[2, 4]],
          yValues: [[3, 7]],
        }),
      ],
    })
    await frame()

    const rect = plot.element.querySelector<SVGRectElement>('[data-mark="band-range"]')!
    const original = rect.getAttribute('x')
    plot.scales.x.scale.domain.set([0, 20])
    await frame()
    expect(rect.getAttribute('x')).not.toBe(original)
    expect(plot.element.querySelector('[data-mark="band-range"]')).toBe(rect)
  })

  test('renders polar ranges as annular sectors', async () => {
    const element = host()
    const plot = createPolarPlot(element, {
      width: 400,
      height: 240,
      scales: {
        theta: angularScale({ domain: [0, 360] }),
        distance: radialScale({ domain: [0, 10] }),
      },
      marks: [
        range({
          x: 'theta',
          y: 'distance',
          xValues: [[30, 90]],
          yValues: [[2, 4]],
        }),
      ],
    })
    plots.push(plot)
    await frame()

    const path = plot.element.querySelector<SVGPathElement>('[data-mark="band-range"]')
    const region = plot.regions.get().plot
    const group = plot.element.querySelector<SVGGElement>('[data-mark="band"]')
    expect(path?.getAttribute('d')).toContain('A')
    expect(group?.getAttribute('transform')).toBe(
      `translate(${region.x + region.width / 2},${region.y + region.height / 2})`,
    )
  })

  test('validates range values, lengths, and scale bindings', () => {
    expect(() => range({ x: 'x', y: 'y', xValues: [[2, 1]], yValues: [[0, 1]] })).toThrow(
      /ascending pair/,
    )
    expect(() => range({ x: 'x', y: 'y', xValues: [[0, 1]], yValues: [] })).toThrow(/equal lengths/)

    expect(() =>
      create(host(), {
        scales: { x: linearScale(), y: linearScale() },
        directions: { x: 'x', y: 'x' },
        marks: [range({ x: 'x', y: 'y', xValues: [[0, 1]], yValues: [[0, 1]] })],
      }),
    ).toThrow(/y-direction/)

    expect(() =>
      create(host(), {
        scales: { x: linearScale(), y: linearScale() },
        directions: { x: 'x' },
        marks: [range({ x: 'x', y: 'missing', xValues: [[0, 1]], yValues: [[0, 1]] })],
      }),
    ).toThrow(/missing x or y scale/)
  })
})

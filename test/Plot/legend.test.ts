import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  createPlot,
  createSeries,
  createTable,
  linearScale,
  axis,
  series,
  bar,
  stackedArea,
  legendSymbolPrimitives,
  legend,
  type Plot,
} from '../../src/index.js'
import { seriesDefinition } from '../../src/plot/line-mark.js'

const plots: Plot[] = []
const hosts: HTMLElement[] = []

function host() {
  const node = document.createElement('div')
  node.style.width = '500px'
  node.style.height = '300px'
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
  for (const current of plots.splice(0)) current.destroy()
  for (const element of hosts.splice(0)) element.remove()
  vi.restoreAllMocks()
})

describe('headless legend model', () => {
  test('renders the reactive model as SVG with docked and overlay positions', async () => {
    const mark = series(createSeries({ x: [0, 1], y: [2, 3] }), {
      id: 'flow',
      label: 'Flow',
      x: 'x',
      y: 'y',
    })
    const handle = legend()
    const current = plot({
      scales: { x: linearScale(), y: linearScale() },
      directions: { x: 'x' },
      title: 'Flow chart',
      axes: [
        axis('x', { position: 'bottom', label: 'Time' }),
        axis('y', { position: 'left', label: 'Flow' }),
      ],
      marks: [mark],
    })
    expect(current.element.parentElement?.querySelector('.fews-chart-legend')).toBeNull()

    current.update({ plugins: [handle] })
    const layout = current.element.closest<HTMLElement>('[data-legend-layout]')!
    const layer = layout.querySelector<SVGGElement>('[data-layer="legend"]')
    expect(current.element.getAttribute('role')).toBe('img')
    expect(layer?.namespaceURI).toBe('http://www.w3.org/2000/svg')
    expect(layer?.dataset.position).toBe('top')
    expect(layer?.textContent).toContain('Flow')
    expect(layer?.querySelector('svg')).toBeNull()

    const changes = vi.fn()
    current.element.addEventListener('legendtoggle', changes)
    const entry = layer!.querySelector<SVGGElement>('[role="button"][data-entry-id="flow"]')!
    expect(layer?.querySelector('[role="checkbox"]')).toBeNull()
    expect(layer?.textContent).not.toMatch(/Isolate|Show all/)
    entry.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(current.legend.entries.get()[0].visibility).toBe('hidden')
    expect(changes.mock.calls[0][0].detail.source).toBe('built-in')
    await expect
      .poll(() => layer!.querySelector('[data-entry-id="flow"]')?.getAttribute('opacity'))
      .toBe('0.5')
    const hidden = layer!.querySelector<SVGGElement>('[data-entry-id="flow"]')!
    hidden.focus()
    hidden.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }))
    expect(current.legend.entries.get()[0].visibility).toBe('visible')
    await expect
      .poll(() => layer!.querySelector('[data-entry-id="flow"]')?.getAttribute('opacity'))
      .toBe('1')
    expect(document.activeElement).toBe(layer!.querySelector('[data-entry-id="flow"]'))
    for (const position of ['top', 'bottom', 'left', 'right'] as const) {
      handle.update({ position })
      await expect
        .poll(() => {
          const chart = current.element.getBoundingClientRect()
          const legend = layout.querySelector('.fews-chart-legend-svg')!.getBoundingClientRect()
          if (position === 'top') return chart.top - legend.bottom
          if (position === 'bottom') return legend.top - chart.bottom
          if (position === 'left') return chart.left - legend.right
          return legend.left - chart.right
        })
        .toBeGreaterThanOrEqual(7.9)
      expect(layer?.dataset.position).toBe(position)
      expect(current.element.contains(layer)).toBe(false)
      expect(layout.clientWidth).toBe(500)
      expect(layout.clientHeight).toBe(300)
      await expect
        .poll(() => {
          const chart = current.element.getBoundingClientRect()
          const legend = layout.querySelector('.fews-chart-legend-svg')!.getBoundingClientRect()
          return Math.abs(
            position === 'top' || position === 'bottom'
              ? chart.width - legend.width
              : chart.height - legend.height,
          )
        })
        .toBeLessThan(0.1)
      await expect
        .poll(() => {
          const transform = layer!
            .querySelector<SVGGElement>('[data-entry-id="flow"]')!
            .transform.baseVal.consolidate()!.matrix
          return Math.abs(
            position === 'top' || position === 'bottom'
              ? transform.e - current.regions.get().plot.x
              : transform.f - current.regions.get().plot.y,
          )
        })
        .toBeLessThan(0.1)
      await expect
        .poll(() => {
          const chart = current.element.getBoundingClientRect()
          const bounds = layout.getBoundingClientRect()
          return chart.right <= bounds.right + 0.1 && chart.bottom <= bounds.bottom + 0.1
        })
        .toBe(true)
    }
    for (const position of ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const) {
      handle.update({ position })
      await expect.poll(() => layer?.dataset.position).toBe(position)
      expect(layer?.dataset.overlay).toBe('true')
      expect(current.element.contains(layer)).toBe(true)
      expect(current.element.getAttribute('role')).toBe('group')
    }

    handle.update({ position: 'top' })
    await expect.poll(() => layer?.dataset.position).toBe('top')
    current.update({ plugins: [] })
    expect(current.element.querySelector('[data-layer="legend"]')).toBeNull()
    expect(current.element.parentElement?.querySelector('[data-legend-layout]')).toBeNull()
    expect(current.element.getAttribute('role')).toBe('img')
    await expect.poll(() => current.size.get()).toEqual({ width: 500, height: 300 })
  })

  test('can omit all parent headings while preserving leaf IDs, visibility and commands', async () => {
    const areas = stackedArea(createTable({ x: [0, 1], a: [2, 3], b: [3, 4] }), {
      id: 'areas',
      label: 'Contributions',
      x: 'x',
      scales: { x: 'x', y: 'y' },
      layers: [
        { id: 'a', y: 'a', label: 'Upstream', stack: 'Observed' },
        { id: 'b', y: 'b', label: 'Lateral', stack: 'Observed' },
      ],
    })
    const handle = legend({ showGroups: false })
    const current = plot({
      scales: { x: linearScale(), y: linearScale() },
      directions: { x: 'x' },
      marks: [areas],
      plugins: [handle],
    })
    const layer = current.element
      .closest('[data-legend-layout]')!
      .querySelector('[data-layer="legend"]')!
    const labels = () =>
      [...layer.querySelectorAll('[data-entry-id]')].map((entry) =>
        entry.getAttribute('aria-label'),
      )
    expect(labels()).toEqual(['Upstream', 'Lateral'])
    const leaf = current.legend.entries.get()[0].children[0].children[0]
    layer.querySelector<SVGGElement>('[data-entry-id]')!.dispatchEvent(new MouseEvent('click'))
    expect(current.legend.entries.get()[0].visibility).toBe('mixed')
    expect(current.legend.entries.get()[0].children[0].children[0].id).toBe(leaf.id)
    handle.update({ showGroups: true })
    await expect.poll(labels).toEqual(['Contributions', 'Observed', 'Upstream', 'Lateral'])
    expect(layer.querySelector('[data-entry-id="areas"]')?.getAttribute('opacity')).toBe('0.75')
    expect(layer.querySelector('[data-entry-id="areas"]')?.getAttribute('aria-pressed')).toBe(
      'mixed',
    )
    handle.update({ showGroups: false })
    await expect.poll(labels).toEqual(['Upstream', 'Lateral'])
    expect(layer.querySelector('[data-entry-id]')?.getAttribute('opacity')).toBe('0.5')
  })

  test('sizes an initially docked legend within explicit dimensions and restores its host on destroy', async () => {
    const node = host()
    const current = createPlot(node, {
      width: 600,
      height: 400,
      marks: [
        series(createSeries({ x: [0, 1], y: [2, 3] }), {
          id: 'flow',
          x: 'x',
          y: 'y',
        }),
      ],
      scales: { x: linearScale(), y: linearScale() },
      directions: { x: 'x' },
      plugins: [legend({ position: 'left' })],
    })
    plots.push(current)
    const layout = node.querySelector<HTMLElement>('[data-legend-layout]')!
    await expect.poll(() => current.size.get().height).toBe(400)
    await expect
      .poll(() => {
        const legend = layout.querySelector('.fews-chart-legend-svg')!.getBoundingClientRect()
        return Math.abs(current.size.get().width + legend.width + 8 - 600)
      })
      .toBeLessThan(0.1)
    current.update({ width: 700, height: 450 })
    await expect.poll(() => current.size.get().height).toBe(450)
    await expect
      .poll(() => {
        const legend = layout.querySelector('.fews-chart-legend-svg')!.getBoundingClientRect()
        return Math.abs(current.size.get().width + legend.width + 8 - 700)
      })
      .toBeLessThan(0.1)
    current.destroy()
    expect(node.children).toHaveLength(0)
  })

  test('separates root groups into sections in docked and overlay layouts', async () => {
    const handle = legend()
    const short = series(createSeries({ x: [0, 1], y: [1, 2] }), { id: 'short', x: 'x', y: 'y' })
    const areas = stackedArea(createTable({ x: [0, 1], a: [2, 3], b: [3, 4] }), {
      id: 'areas',
      label: 'Contributions',
      x: 'x',
      scales: { x: 'x', y: 'y' },
      layers: [
        { id: 'a', y: 'a', label: 'Upstream', stack: 'Observed' },
        { id: 'b', y: 'b', label: 'Lateral', stack: 'Observed' },
        { id: 'c', y: 'a', label: 'Upstream', stack: 'Forecast' },
        { id: 'd', y: 'b', label: 'Lateral', stack: 'Forecast' },
      ],
    })
    const current = plot({
      width: 900,
      scales: { x: linearScale(), y: linearScale() },
      directions: { x: 'x' },
      marks: [areas, short],
      plugins: [handle],
    })
    await expect.poll(() => current.size.get().width).toBe(900)
    await frame()
    const layer = current.element
      .closest('[data-legend-layout]')!
      .querySelector<SVGGElement>('[data-layer="legend"]')!
    const offset = (id: string) => {
      const matrix = layer
        .querySelector<SVGGElement>(`[data-entry-id="${id}"]`)!
        .transform.baseVal.consolidate()!.matrix
      return { x: matrix.e, y: matrix.f }
    }
    const heading = current.legend.entries.get()[0]
    const [observed, forecast] = heading.children
    expect(
      layer.querySelector(`[data-entry-id="${heading.id}"] text`)?.getAttribute('font-weight'),
    ).toBe('600')
    expect(offset(observed.id).y).toBeCloseTo(offset(heading.id).y, 4)
    expect(offset(observed.id).x).toBeGreaterThan(offset(heading.id).x)
    expect(offset(forecast.id).x).toBeCloseTo(offset(observed.id).x, 4)
    expect(offset(forecast.id).y).toBeGreaterThan(offset(observed.id).y)
    for (const group of [observed, forecast]) {
      for (const child of group.children) {
        expect(offset(child.id).y).toBeCloseTo(offset(group.id).y, 4)
        expect(offset(child.id).x).toBeGreaterThan(offset(group.id).x)
      }
    }
    expect(offset('short').x).toBeCloseTo(offset(heading.id).x, 4)
    expect(offset('short').y).toBeGreaterThan(offset(forecast.id).y)
    expect(layer.querySelectorAll('.fews-chart-legend__divider')).toHaveLength(1)
    for (const position of ['left', 'right', 'top-left', 'bottom-right'] as const) {
      handle.update({ position })
      await expect.poll(() => layer.dataset.position).toBe(position)
      const dividers = layer.querySelectorAll<SVGLineElement>('.fews-chart-legend__divider')
      expect(dividers).toHaveLength(1)
      const dividerY = dividers[0].y1.baseVal.value
      expect(dividerY).toBeGreaterThan(offset(forecast.children[forecast.children.length - 1].id).y)
      expect(dividerY).toBeLessThan(offset('short').y)
      expect(
        offset('short').y - offset(forecast.children[forecast.children.length - 1].id).y,
      ).toBeCloseTo(33, 4)
    }
    handle.update({ showGroups: false })
    await expect.poll(() => layer.querySelectorAll('[data-entry-id]').length).toBe(5)
    expect(layer.querySelectorAll('.fews-chart-legend__divider')).toHaveLength(0)
  })

  test('gives every entry equal bounds across positions, grouping and label updates', async () => {
    const short = series(createSeries({ x: [0, 1], y: [1, 2] }), {
      id: 'short',
      label: 'A',
      x: 'x',
      y: 'y',
    })
    const areas = stackedArea(createTable({ x: [0, 1], a: [2, 3], b: [3, 4] }), {
      id: 'areas',
      label: 'Longer parent heading',
      x: 'x',
      scales: { x: 'x', y: 'y' },
      layers: [
        { id: 'a', y: 'a', label: 'Upstream', stack: 'Observed' },
        { id: 'b', y: 'b', label: 'Lateral contributions', stack: 'Observed' },
      ],
    })
    const handle = legend()
    const current = plot({
      scales: { x: linearScale(), y: linearScale() },
      directions: { x: 'x' },
      marks: [short, areas],
      plugins: [handle],
    })
    const layer = current.element
      .closest('[data-legend-layout]')!
      .querySelector<SVGGElement>('[data-layer="legend"]')!
    function expectEqualBounds() {
      const entries = [...layer.querySelectorAll<SVGGElement>('[data-entry-id]')]
      expect(entries.length).toBeGreaterThan(1)
      const bounds = entries.map((entry) => entry.getBBox())
      const hitAreas = entries.map((entry) => entry.querySelector('rect')!)
      for (const [index, area] of hitAreas.entries()) {
        expect(area.width.baseVal.value).toBe(hitAreas[0].width.baseVal.value)
        expect(area.height.baseVal.value).toBe(26)
        expect(bounds[index].width).toBeCloseTo(bounds[0].width, 4)
        expect(bounds[index].height).toBeCloseTo(bounds[0].height, 4)
      }
    }
    for (const position of [
      'top',
      'bottom',
      'left',
      'right',
      'top-left',
      'top-right',
      'bottom-left',
      'bottom-right',
    ] as const) {
      handle.update({ position })
      await expect.poll(() => layer.dataset.position).toBe(position)
      await frame()
      expectEqualBounds()
    }
    handle.update({ showGroups: false })
    await expect.poll(() => layer.querySelectorAll('[data-entry-id]').length).toBe(3)
    expectEqualBounds()
    short.update({ label: 'A much longer series label that changes the common entry width' })
    await expect.poll(() => layer.textContent).toContain('A much longer series label')
    expectEqualBounds()
  })

  test('keeps single-column bar commands in single-column mode', () => {
    const columns = bar(createTable({ x: [0, 1], y: [2, 3] }), {
      id: 'columns',
      x: 'x',
      y: 'y',
      scales: { x: 'x', y: 'y' },
      width: 20,
    })
    const current = plot({
      scales: { x: linearScale(), y: linearScale() },
      directions: { x: 'x' },
      marks: [columns],
    })
    const childId = current.legend.entries.get()[0].children[0].id
    current.legend.toggle('columns')
    expect(current.legend.entries.get()[0].visibility).toBe('hidden')
    expect(columns.options.get().resolved.layers).toBeUndefined()
    current.legend.showAll()
    expect(current.legend.entries.get()[0].visibility).toBe('visible')
    current.legend.setVisible(childId, false)
    expect(current.legend.entries.get()[0].children[0].visibility).toBe('hidden')
    current.legend.setVisible(childId, true)
    expect(current.legend.entries.get()[0].visibility).toBe('visible')
    expect(columns.options.get().resolved.y).toBe('y')
    expect(columns.options.get().resolved.layers).toBeUndefined()
  })

  test('shares resolved defaults and style updates with series rendering without tracking data or pointer movement', async () => {
    const data = createSeries({ x: [0, 1], y: [2, 3] })
    const flow = series(data, { id: 'flow', x: 'x', y: 'y' })
    const current = plot({
      scales: { x: linearScale({ domain: [0, 3] }), y: linearScale({ domain: [0, 4] }) },
      directions: { x: 'x' },
      theme: 'light',
      marks: [flow],
    })
    await frame()
    const legend = vi.spyOn(seriesDefinition, 'legend')
    const events = vi.fn()
    current.element.addEventListener('legendtoggle', events)
    const before = current.legend.entries.get()
    const path = current.element.querySelector('[data-mark="line"]')!
    const [primitive] = legendSymbolPrimitives(before[0].symbol)
    expect(primitive).toMatchObject({
      type: 'line',
      attributes: {
        stroke: path.getAttribute('stroke'),
        'stroke-width': Number(path.getAttribute('stroke-width')),
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
      },
    })
    data.append({ x: [2], y: [3] })
    current.element.dispatchEvent(new PointerEvent('pointermove', { clientX: 10, clientY: 10 }))
    await frame()
    expect(legend).not.toHaveBeenCalled()
    expect(current.legend.entries.get()).toBe(before)

    flow.update({
      line: { strokeDasharray: '7 2', strokeLinecap: 'butt', strokeLinejoin: 'bevel' },
    })
    await frame()
    expect(path.getAttribute('stroke-dasharray')).toBe('7 2')
    expect(path.getAttribute('stroke-linecap')).toBe('butt')
    expect(path.getAttribute('stroke-linejoin')).toBe('bevel')
    expect(current.legend.entries.get()[0].symbol).toMatchObject({
      parts: [{ strokeDasharray: '7 2', strokeLinecap: 'butt', strokeLinejoin: 'bevel' }],
    })
    current.update({ theme: 'dark' })
    await frame()
    expect(current.legend.entries.get()[0].symbol).toMatchObject({
      parts: [{ stroke: `var(--fews-chart-accent, ${current.theme.get().accent})` }],
    })
    expect(path.getAttribute('stroke')).toBe(
      `var(--fews-chart-accent, ${current.theme.get().accent})`,
    )
    expect(events).not.toHaveBeenCalled()
  })

  test('shares area and marker defaults, including symbol-area sizing, with the renderer', async () => {
    const flow = series(createSeries({ x: [0, 1], y: [2, 3] }), {
      id: 'flow',
      x: 'x',
      y: 'y',
      area: { to: 0, opacity: 0.25 },
      markers: { symbolSize: 16, stroke: 'black' },
    })
    const current = plot({
      scales: { x: linearScale({ domain: [0, 1] }), y: linearScale({ domain: [0, 4] }) },
      directions: { x: 'x' },
      marks: [flow],
    })
    await frame()
    const area = current.element.querySelector('[data-mark="area"]')!
    const marker = current.element.querySelector('[data-mark="markers"] > path')!
    expect(current.legend.entries.get()[0].symbol).toMatchObject({
      parts: [
        {
          type: 'area',
          fill: area.getAttribute('fill'),
          opacity: Number(area.getAttribute('fill-opacity')),
        },
        { type: 'line', strokeWidth: 1.5 },
        {
          type: 'marker',
          fill: marker.getAttribute('fill'),
          stroke: 'black',
          strokeWidth: 1,
          size: Math.sqrt(16 / Math.PI),
        },
      ],
    })
    const symbol = current.legend.entries.get()[0].symbol
    current.legend.toggle('flow')
    expect(current.legend.entries.get()[0].symbol).toEqual(symbol)
  })

  test.each(['svg', 'canvas'] as const)(
    'resolves inherited composite styles and multicolour stack/group symbols with %s marks',
    async (renderer) => {
      const data = createTable({ t: [0, 1], a: [1, 2], b: [3, 4], c: [2, 1] })
      const layers = [
        { id: 'a', y: 'a', stack: 'observed', fill: 'red' },
        { id: 'b', y: 'b', stack: 'observed', opacity: 0.7 },
        { id: 'c', y: 'c', stack: 'forecast', fill: 'green', stroke: 'purple', strokeWidth: 3 },
      ]
      const mark = stackedArea(data, {
        id: 'areas',
        x: 't',
        scales: { x: 't', y: 'q' },
        renderer,
        fill: 'blue',
        opacity: 0.4,
        stroke: 'black',
        strokeWidth: 2,
        layers,
      })
      const columns = bar(data, {
        id: 'bars',
        x: 't',
        scales: { x: 't', y: 'q' },
        renderer,
        width: 20,
        layout: 'stacked',
        fill: 'blue',
        opacity: 0.4,
        stroke: 'black',
        strokeWidth: 2,
        layers,
      })
      const current = plot({
        scales: { t: linearScale({ domain: [0, 1] }), q: linearScale({ domain: [0, 10] }) },
        directions: { t: 'x' },
        marks: [mark, columns],
      })
      await frame()
      for (const [index, type] of ['area', 'bar'].entries()) {
        const entry = current.legend.entries.get()[index]
        const parts = [
          { type, fill: 'red', opacity: 0.4, stroke: 'black', strokeWidth: 2 },
          { type, fill: 'blue', opacity: 0.7, stroke: 'black', strokeWidth: 2 },
          { type, fill: 'green', opacity: 0.4, stroke: 'purple', strokeWidth: 3 },
        ]
        expect(entry.symbol).toEqual({ type: 'stack', parts })
        expect(entry.children[0].symbol).toEqual({ type: 'stack', parts: parts.slice(0, 2) })
        expect(entry.children[1].symbol).toEqual({ type: 'stack', parts: parts.slice(2) })
        expect(entry.children[0].children[1].symbol).toEqual(parts[1])
        expect(
          legendSymbolPrimitives(entry.symbol).map(({ attributes }) => attributes.fill),
        ).toEqual(['red', 'blue', 'green'])
      }
      if (renderer === 'svg') {
        const node = current.element.querySelector(
          '[data-mark="stacked-area-layer"][data-layer-id="b"]',
        )!
        expect(node.getAttribute('fill')).toBe('blue')
        expect(node.getAttribute('fill-opacity')).toBe('0.7')
        expect(node.getAttribute('stroke')).toBe('black')
        expect(node.getAttribute('stroke-width')).toBe('2')
      } else {
        expect(current.element.querySelectorAll('canvas')).toHaveLength(2)
      }
      const before = current.legend.entries.get()[0]
      current.legend.setVisible(before.children[0].children[0].id, false)
      expect(current.legend.entries.get()[0]).toMatchObject({
        visibility: 'mixed',
        symbol: before.symbol,
        children: [
          { visibility: 'mixed', symbol: before.children[0].symbol },
          { visibility: 'visible' },
        ],
      })
      mark.update({ fill: 'orange', opacity: 0.2 })
      await frame()
      expect(current.legend.entries.get()[0].children[0].children[1].symbol).toMatchObject({
        fill: 'orange',
        opacity: 0.7,
        stroke: 'black',
        strokeWidth: 2,
      })
      expect(current.legend.entries.get()[0].children[0].children[0].symbol).toMatchObject({
        fill: 'red',
        opacity: 0.2,
      })
    },
  )

  test('accepts commands immediately after creation without waiting for a reactive effect', async () => {
    const flow = series(createSeries({ x: [0], y: [2] }), {
      id: 'flow',
      x: 'x',
      y: 'y',
    })
    const current = plot({
      scales: {
        x: linearScale({ domain: [0, 1] }),
        y: linearScale({ domain: [0, 4] }),
      },
      directions: { x: 'x' },
      marks: [flow],
    })
    const event = vi.fn()
    current.element.addEventListener('legendtoggle', event)

    current.legend.toggle('flow')

    expect(flow.visible).toBe(false)
    expect(current.legend.entries.get()[0].visibility).toBe('hidden')
    expect(event).toHaveBeenCalledOnce()
    await frame()
    expect(current.legend.entries.get()[0].visibility).toBe('hidden')
    expect(event).toHaveBeenCalledOnce()
  })

  test('exposes immutable series entries and drives visibility without a renderer', async () => {
    const data = createSeries({ x: [0, 1], y: [2, 3] })
    const flow = series(data, {
      id: 'flow',
      x: 'x',
      y: 'y',
      label: 'Flow',
      line: { stroke: 'navy', width: 2 },
      markers: { fill: 'white' },
    })
    const current = plot({
      scales: {
        x: linearScale({ domain: [0, 1] }),
        y: linearScale({ domain: [0, 4] }),
      },
      directions: { x: 'x', y: 'y' },
      marks: [flow],
    })

    const [entry] = current.legend.entries.get()
    expect(entry).toMatchObject({
      id: 'flow',
      markId: 'flow',
      label: 'Flow',
      visibility: 'visible',
      symbol: {
        type: 'composite',
        parts: [
          { type: 'line', stroke: 'navy', strokeWidth: 2 },
          { type: 'marker', shape: 'circle', fill: 'white' },
        ],
      },
    })
    expect(Object.isFrozen(entry)).toBe(true)
    expect(current.element.querySelector('[data-layer="legend"]')).toBeNull()

    const event = vi.fn()
    current.element.addEventListener('legendtoggle', event)
    current.legend.toggle('flow')
    expect(flow.visible).toBe(false)
    expect(current.legend.entries.get()[0].visibility).toBe('hidden')
    expect(event).toHaveBeenCalledOnce()
    expect(event.mock.calls[0][0]).toMatchObject({
      detail: {
        action: 'toggle',
        source: 'api',
        changes: [{ id: 'flow', visibility: 'hidden' }],
      },
    })

    current.legend.setVisible('flow', true)
    expect(flow.visible).toBe(true)
    expect(current.legend.entries.get()[0].visibility).toBe('visible')
    expect(() => current.legend.toggle('missing')).toThrow('Unknown legend entry id "missing".')

    flow.update({ label: 'Discharge' })
    await frame()
    expect(current.legend.entries.get()[0].label).toBe('Discharge')
    flow.update({ visible: false })
    await frame()
    expect(event).toHaveBeenCalledTimes(3)
    expect(event.mock.calls[2][0]).toMatchObject({
      detail: {
        action: 'programmatic',
        source: 'programmatic',
        changes: [{ id: 'flow', visibility: 'hidden' }],
      },
    })
  })

  test('supports independent composite-layer visibility and group isolation', () => {
    const data = createTable({ t: [0, 1], low: [1, 2], high: [3, 4] })
    const columns = bar(data, {
      id: 'columns',
      x: 't',
      scales: { x: 't', y: 'q' },
      layers: [
        { id: 'low', y: 'low', stack: 'observed', label: 'Low' },
        { id: 'high', y: 'high', stack: 'observed', label: 'High' },
      ],
      layout: 'stacked',
      label: 'Observed',
      width: 20,
    })
    const current = plot({
      scales: {
        t: linearScale({ domain: [0, 1] }),
        q: linearScale({ domain: [0, 10] }),
      },
      directions: { t: 'x' },
      marks: [columns],
    })
    const [entry] = current.legend.entries.get()
    const group = entry.children[0]
    const [low, high] = group.children

    current.legend.setVisible(low.id, false)
    expect(columns.options.get().resolved.layers?.map((layer) => layer.visible)).toEqual([
      false,
      undefined,
    ])
    expect(current.legend.entries.get()[0]).toMatchObject({
      visibility: 'mixed',
      children: [
        { visibility: 'mixed', children: [{ visibility: 'hidden' }, { visibility: 'visible' }] },
      ],
    })

    current.legend.isolate(low.id)
    expect(columns.options.get().resolved.layers?.map((layer) => layer.visible)).toEqual([
      true,
      false,
    ])
    current.legend.showAll()
    expect(columns.options.get().resolved.visible).toBe(true)
    expect(columns.options.get().resolved.layers?.every((layer) => layer.visible)).toBe(true)
  })
})

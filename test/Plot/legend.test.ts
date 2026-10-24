import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  createPlot,
  createSeries,
  createTable,
  linearScale,
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
  test('renders the reactive model with the optional built-in HTML legend plugin', async () => {
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
      marks: [mark],
    })
    expect(current.element.parentElement?.querySelector('.fews-chart-legend')).toBeNull()

    current.update({ plugins: [handle] })
    const container =
      current.element.parentElement?.querySelector<HTMLElement>('.fews-chart-legend')
    expect(container?.dataset.position).toBe('top')
    expect(container?.textContent).toContain('Flow')
    expect(container?.querySelector('svg')).not.toBeNull()

    const changes = vi.fn()
    current.element.addEventListener('legendtoggle', changes)
    const checkbox = container?.querySelector<HTMLInputElement>('input[data-entry-id="flow"]')
    expect(checkbox).not.toBeNull()
    checkbox!.click()
    expect(current.legend.entries.get()[0].visibility).toBe('hidden')
    expect(changes.mock.calls[0][0].detail.source).toBe('built-in')

    container?.querySelector<HTMLButtonElement>('.fews-chart-legend__show-all')?.click()
    expect(current.legend.entries.get()[0].visibility).toBe('visible')
    handle.update({ position: 'bottom' })
    expect(container?.dataset.position).toBe('bottom')
    expect(current.element.nextElementSibling).toBe(container)

    current.update({ plugins: [] })
    expect(current.element.parentElement?.querySelector('.fews-chart-legend')).toBeNull()
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

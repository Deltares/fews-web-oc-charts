import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  createPlot,
  createSeries,
  createTable,
  linearScale,
  series,
  bar,
  type Plot,
} from '../../src/index.js'

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

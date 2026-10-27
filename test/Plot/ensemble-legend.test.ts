import { afterEach, describe, expect, test } from 'vitest'
import {
  createEnsemble,
  createPlot,
  ensemble,
  legend,
  linearScale,
  type EnsembleMark,
  type Plot,
} from '../../src/index.js'

const plots: Plot[] = []
const hosts: HTMLElement[] = []
async function frame() {
  await new Promise(requestAnimationFrame)
  await new Promise(requestAnimationFrame)
}
afterEach(() => {
  plots.splice(0).forEach((current) => current.destroy())
  hosts.splice(0).forEach((host) => host.remove())
})

const data = () =>
  createEnsemble(
    {
      x: [0, 1, 2],
      members: [
        [1, 2, 3],
        [5, 6, 7],
        [9, 20, 11],
      ],
    },
    { metadata: [{ id: 'ctl', label: 'Control run' }, { id: 'm1' }, { id: 'm2' }] },
  )

function plot(marks: EnsembleMark[], y = linearScale()) {
  const host = document.createElement('div')
  document.body.append(host)
  hosts.push(host)
  const current = createPlot(host, {
    width: 300,
    height: 150,
    directions: { x: 'x' },
    scales: { x: linearScale(), y },
    marks,
  })
  plots.push(current)
  return current
}

const labelled = () =>
  ensemble(data(), {
    id: 'fc',
    label: 'Forecast',
    x: 'x',
    y: 'y',
    members: { stroke: 'red' },
    spread: { bands: [[0, 100]] },
    median: {},
    control: { member: 'ctl' },
  })

describe('ensemble legend', () => {
  test('lists the configured parts under one heading with stable ids and symbols', () => {
    const current = plot([labelled()])
    const [entry] = current.legend.entries.get()
    expect(entry).toMatchObject({ id: 'fc', label: 'Forecast', visibility: 'visible' })
    expect(entry.symbol).toMatchObject({ type: 'composite' })
    expect(entry.children.map(({ id, label }) => [id, label])).toEqual([
      ['fc::layer:members', 'Members'],
      ['fc::layer:spread', '0–100%'],
      ['fc::layer:median', 'Median'],
      ['fc::layer:control', 'Control run'],
    ])
    expect(entry.children[0].symbol).toMatchObject({ type: 'line', opacity: 0.25 })
    expect(entry.children[1].symbol).toMatchObject({ type: 'area', opacity: 0.2 })
  })

  test('toggles parts individually, keeping their options, rendering and autoscale in sync', async () => {
    const mark = labelled()
    const y = linearScale()
    const current = plot([mark], y)
    await frame()
    expect(y.domain.get()).toEqual([1, 20])
    current.legend.toggle('fc::layer:members')
    current.legend.toggle('fc::layer:spread')
    await frame()
    const resolved = mark.options.get().resolved
    expect(resolved.members).toEqual({ stroke: 'red', visible: false })
    expect(current.legend.entries.get()[0].visibility).toBe('mixed')
    expect(
      current.element.querySelectorAll('[data-part="member"], [data-part="band"]'),
    ).toHaveLength(0)
    // Only the median (2, 6, 7) and the control member (1, 2, 3) remain.
    expect(y.domain.get()).toEqual([1, 7])
    current.legend.toggle('fc::layer:members')
    await frame()
    expect(current.element.querySelectorAll('[data-part="member"]')).toHaveLength(3)
    expect(current.element.querySelector('[data-part="member"]')!.getAttribute('stroke')).toBe(
      'red',
    )
  })

  test('the heading hides and shows all parts; showing one part of a hidden mark shows only it', async () => {
    const mark = labelled()
    const current = plot([mark])
    current.legend.toggle('fc')
    expect(mark.visible).toBe(false)
    expect(current.legend.entries.get()[0].visibility).toBe('hidden')
    current.legend.setVisible('fc::layer:median', true)
    expect(mark.visible).toBe(true)
    expect(current.legend.entries.get()[0].children.map(({ visibility }) => visibility)).toEqual([
      'hidden',
      'hidden',
      'visible',
      'hidden',
    ])
    current.legend.toggle('fc')
    expect(current.legend.entries.get()[0].visibility).toBe('visible')
    current.legend.isolate('fc::layer:spread')
    expect(current.legend.entries.get()[0].children.map(({ visibility }) => visibility)).toEqual([
      'hidden',
      'visible',
      'hidden',
      'hidden',
    ])
  })

  test('follows the composite inclusion policy for unlabelled and single-part marks', () => {
    const flat = ensemble(data(), { id: 'flat', x: 'x', y: 'y', median: {} })
    const single = ensemble(data(), { id: 'single', label: 'Members only', x: 'x', y: 'y' })
    const current = plot([flat, single])
    const entries = current.legend.entries.get()
    expect(entries.map(({ id }) => id)).toEqual([
      'flat::layer:members',
      'flat::layer:median',
      'single',
    ])
    expect(entries[2]).toMatchObject({ label: 'Members only', children: [] })
    current.legend.toggle('single')
    expect(single.options.get().resolved.members).toEqual({ visible: false })
    expect(single.visible).toBe(true)
  })

  test('renders entries in the built-in legend', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    hosts.push(host)
    const current = createPlot(host, {
      width: 300,
      height: 150,
      directions: { x: 'x' },
      scales: { x: linearScale(), y: linearScale() },
      marks: [labelled()],
      plugins: [legend()],
    })
    plots.push(current)
    await frame()
    const layer = current.element
      .closest('[data-legend-layout]')!
      .querySelector('[data-layer="legend"]')!
    for (const id of ['fc', 'fc::layer:members', 'fc::layer:median'])
      expect(layer.querySelector(`[data-entry-id="${id}"]`)).not.toBeNull()
  })

  test('rejects a non-boolean part visibility', () => {
    expect(() => ensemble(data(), { x: 'x', y: 'y', median: { visible: 'no' as never } })).toThrow(
      /median.visible must be boolean/,
    )
    expect(() =>
      ensemble(data(), { x: 'x', y: 'y', exceedance: { threshold: 1, visible: true } as never }),
    ).toThrow()
  })
})

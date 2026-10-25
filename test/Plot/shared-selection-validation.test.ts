import { afterEach, describe, expect, test } from 'vitest'
import { brush, createPlot, linearScale, sharedSelection, type Plot } from '../../src/index.js'
import { reactive } from '../../src/core/runtime.js'

const plots: Plot[] = []
const hosts: HTMLElement[] = []
function host() {
  const result = document.createElement('div')
  document.body.append(result)
  hosts.push(result)
  return result
}
afterEach(() => {
  for (const plot of plots.splice(0)) plot.destroy()
  for (const element of hosts.splice(0)) element.remove()
})

describe('shared brush configuration validation', () => {
  test('rejects incompatible peer mappings before mounting resources and preserves the original plot', () => {
    const selection = sharedSelection()
    const x = linearScale()
    const handle = brush({ mode: 'x', persistent: true, selection })
    const first = createPlot(host(), { scales: { x }, directions: { x: 'x' }, plugins: [handle] })
    plots.push(first)
    const baseline = reactive.getDiagnostics()
    expect(() =>
      createPlot(host(), {
        scales: { time: x },
        directions: { time: 'x' },
        plugins: [handle],
      }),
    ).toThrow(/separate brush handles/)
    expect(reactive.getDiagnostics().activeScopes).toBe(baseline.activeScopes)
    expect(reactive.getDiagnostics().activeEffects).toBe(baseline.activeEffects)
    expect(reactive.getDiagnostics().activeComputeds).toBe(baseline.activeComputeds)
    expect(hosts[1].querySelector('svg')).toBeNull()
    first.update({ scales: { x: undefined, time: x }, directions: { x: undefined, time: 'x' } })
    handle.setSelection({ mode: 'x', scales: { time: [0.2, 0.8] } })
    expect(handle.selection.get()?.scales.time).toEqual([0.2, 0.8])
  })

  test('allows identical mappings on two plots, rejects divergent patches atomically and releases constraints', () => {
    const selection = sharedSelection()
    const x = linearScale()
    const handle = brush({ mode: 'x', persistent: true, selection })
    const config = { scales: { x }, directions: { x: 'x' as const }, plugins: [handle] }
    const first = createPlot(host(), config)
    const second = createPlot(host(), config)
    plots.push(first, second)
    handle.setSelection({ mode: 'x', scales: { x: [0.2, 0.8] } })
    const state = selection.selection.get()
    expect(() => first.update({ scales: { x: linearScale() } })).toThrow(/separate brush handles/)
    expect(first.scales.x.scale).toBe(x)
    expect(selection.selection.get()).toBe(state)
    second.destroy()
    first.update({ scales: { x: linearScale() } })
    expect(handle.selection.get()).toBeUndefined()
    expect(selection.selection.get()).toBe(state)
  })
})

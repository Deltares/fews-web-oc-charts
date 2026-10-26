import { describe, expect, test } from 'vitest'
import { createPlot, linearScale, logScale, zoom } from '../../src/index.js'
import { bindScale, registerScaleExtents } from '../../src/scales/scale.js'
import { reactive } from '../../src/core/runtime.js'

describe('positive logarithmic scale', () => {
  test('projects and inverts equal ratios, reverses, and supplies physical ticks', () => {
    const scale = logScale({ domain: [100, 1000] })
    const binding = bindScale(scale, reactive.signal<readonly [number, number]>([0, 600]))
    expect(scale.domain.get()).toEqual([100, 1000])
    expect(binding.project(100)).toBeCloseTo(0)
    expect(binding.project(Math.sqrt(100 * 1000))).toBeCloseTo(300)
    expect(binding.project(1000)).toBeCloseTo(600)
    expect(binding.invert(300)).toBeCloseTo(Math.sqrt(100 * 1000))
    expect(binding.ticks()).toContain(500)
    scale.update({ reverse: true })
    expect(binding.project(100)).toBeCloseTo(600)
    expect(binding.project(1000)).toBeCloseTo(0)
    expect(logScale().domain.get()).toEqual([1, 10])
  })

  test('rejects invalid domains and options without publishing changes', () => {
    const scale = logScale({ domain: [100, 1000] })
    for (const domain of [
      [0, 100],
      [-100, -10],
      [1000, 100],
      [1, Infinity],
    ] as const) {
      expect(() => scale.update({ domain })).toThrow()
      expect(scale.domain.get()).toEqual([100, 1000])
    }
    expect(() => logScale({ includeZero: true })).toThrow(/linear/)
    expect(() => logScale({ symmetric: true })).toThrow(/linear/)
    const binding = bindScale(scale, reactive.signal<readonly [number, number]>([0, 100]))
    expect(() => binding.project(0)).toThrow(/positive log/)
    expect(() => binding.project(-1)).toThrow(/positive log/)
  })

  test('pads in log space, supports nice domains and expands single-valued automatic extents positively', () => {
    const scale = logScale({ domain: [10, 100], padding: 0.1 })
    expect(scale.domain.get()[0]).toBeCloseTo(10 / 10 ** 0.1)
    expect(scale.domain.get()[1]).toBeCloseTo(100 * 10 ** 0.1)
    expect(logScale({ domain: [125, 875], nice: true }).domain.get()).toEqual([100, 1000])
    const automatic = logScale()
    const stop = registerScaleExtents(automatic, () => [0.001, 0.001])
    expect(Number(automatic.domain.get()[0])).toBeGreaterThan(0)
    expect(Number(automatic.domain.get()[0])).toBeLessThan(0.001)
    expect(Number(automatic.domain.get()[1])).toBeGreaterThan(0.001)
    stop()
    expect(automatic.domain.get()).toEqual([1, 10])
    expect(linearScale({ domain: [-10, 10] }).domain.get()).toEqual([-10, 10])
  })

  test('zooms Cartesian log domains multiplicatively around the pointer and resets them', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const x = logScale({ domain: [1, 1000] })
    const plot = createPlot(host, {
      width: 500,
      height: 300,
      scales: { x },
      directions: { x: 'x' },
      plugins: [zoom({ mode: 'x', wheel: 'x' })],
    })
    try {
      await new Promise(requestAnimationFrame)
      await new Promise(requestAnimationFrame)
      const bounds = plot.element.getBoundingClientRect()
      const region = plot.regions.get().plot
      const clientX = bounds.left + ((region.x + region.width / 2) * bounds.width) / 500
      const clientY = bounds.top + ((region.y + region.height / 2) * bounds.height) / 300
      const event = new WheelEvent('wheel', {
        clientX,
        clientY,
        deltaY: -100,
        cancelable: true,
      })
      plot.element.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(true)
      const domain = x.domain.get().map(Number)
      const factor = Math.exp(-0.2)
      expect(domain[0]).toBeCloseTo(Math.exp((Math.log(1000) * (1 - factor)) / 2))
      expect(domain[1]).toBeCloseTo(Math.exp((Math.log(1000) * (1 + factor)) / 2))
      expect(domain[0] * domain[1]).toBeCloseTo(1000)
      plot.element.dispatchEvent(new MouseEvent('dblclick', { clientX, clientY, button: 0 }))
      expect(x.domain.get()).toEqual([1, 1000])
    } finally {
      plot.destroy()
      host.remove()
    }
  })
})

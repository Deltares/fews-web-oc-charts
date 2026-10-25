import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  bandScale,
  batch,
  createPlot,
  createSeries,
  degreesScale,
  line,
  linearScale,
  range,
  series,
  timeScale,
  type AutoscaleContext,
  type Plot,
  type PlotConfig,
} from '../../src/index.js'
import { reactive } from '../../src/core/runtime.js'

const plots: Plot[] = []
const hosts: HTMLElement[] = []
function plot(config: PlotConfig) {
  const host = document.createElement('div')
  document.body.append(host)
  hosts.push(host)
  const result = createPlot(host, { width: 400, height: 200, ...config })
  plots.push(result)
  return result
}
async function frame() {
  await new Promise(requestAnimationFrame)
  await new Promise(requestAnimationFrame)
}
afterEach(() => {
  plots.splice(0).forEach((current) => current.destroy())
  hosts.splice(0).forEach((host) => host.remove())
  vi.restoreAllMocks()
})

describe('autoscale policies', () => {
  test('static lines contribute only when their line, markers or area are enabled', () => {
    const x = linearScale()
    const y = linearScale()
    const options = { x: 'x', y: 'y', xValues: [2, 4], yValues: [10, 20], line: false }
    const current = plot({
      scales: { x, y },
      directions: { x: 'x' },
      marks: [line(options)],
    })
    expect(x.domain.get()).toEqual([0, 1])
    expect(y.domain.get()).toEqual([0, 1])

    current.update({ marks: [line({ ...options, markers: true })] })
    expect(x.domain.get()).toEqual([2, 4])
    expect(y.domain.get()).toEqual([10, 20])

    current.update({ marks: [line({ ...options, area: { to: -5 } })] })
    expect(x.domain.get()).toEqual([2, 4])
    expect(y.domain.get()).toEqual([-5, 20])

    current.update({ marks: [line({ ...options, line: undefined })] })
    expect(x.domain.get()).toEqual([2, 4])
    expect(y.domain.get()).toEqual([10, 20])
  })

  test('unions eligible series and static lines, ignores gaps and includes area baselines', () => {
    const x = timeScale()
    const y = linearScale()
    const data = createSeries({ x: [0, 1, 2, 3], y: [NaN, 20, 30, NaN] })
    const mark = series(data, { x: 'x', y: 'y', area: { to: -10 } })
    plot({
      scales: { x, y },
      marks: [mark, line({ x: 'x', y: 'y', xValues: [4, null, 6], yValues: [40, 500, 60] })],
    })
    expect(x.domain.get()).toEqual([1, 6])
    expect(y.domain.get()).toEqual([-10, 60])
    mark.update({ visible: false })
    expect(x.domain.get()).toEqual([4, 6])
    expect(y.domain.get()).toEqual([40, 60])
    mark.update({ visible: undefined, area: false, line: false })
    expect(y.domain.get()).toEqual([40, 60])
    mark.update({ markers: {} })
    expect(y.domain.get()).toEqual([20, 60])
  })

  test('visible x autoscale filters data-backed series by the y viewport', () => {
    const x = linearScale({ autoscale: 'visible' })
    const y = linearScale({ domain: [0, 10] })
    const data = createSeries({
      x: [1, 2, 3, 4],
      y: [5, 50, 8, 80],
    })
    plot({
      directions: { x: 'x' },
      scales: { x, y },
      marks: [series(data, { x: 'x', y: 'y' })],
    })

    expect(x.domain.get()).toEqual([1, 3])
  })

  test('explicit domains override policies until unset; fixed uses the configured fallback', () => {
    const x = timeScale()
    const y = linearScale({ domain: [0, 100], defaultDomain: [-5, 5] })
    const mark = series(createSeries({ x: [0, 1], y: [20, 40] }), { x: 'x', y: 'y' })
    const current = plot({ scales: { x, y }, marks: [mark] })
    expect(y.domain.get()).toEqual([0, 100])
    y.update({ domain: undefined })
    expect(y.domain.get()).toEqual([20, 40])
    y.domain.update(([low, high]) => [Number(low) - 1, Number(high) + 1])
    expect(y.domain.get()).toEqual([19, 41])
    y.update({ domain: undefined, autoscale: 'fixed' })
    expect(y.domain.get()).toEqual([-5, 5])
    y.update({ autoscale: undefined })
    expect(y.domain.get()).toEqual([20, 40])
    current.update({ marks: [] })
    expect(y.domain.get()).toEqual([-5, 5])
    expect(degreesScale().options.get().resolved.autoscale).toBe('fixed')
  })

  test('applies includeZero, symmetry, padding and nice once after the union', () => {
    const x = timeScale()
    const y = linearScale({ includeZero: true, symmetric: true, padding: 0.1, nice: true })
    plot({
      scales: { x, y },
      marks: [series(createSeries({ x: [0, 1], y: [2, 7] }), { x: 'x', y: 'y' })],
    })
    expect(y.domain.get()).toEqual([-10, 10])
    y.update({ symmetric: undefined, padding: undefined, nice: undefined })
    expect(y.domain.get()).toEqual([0, 7])
  })

  test('supports visible windows on either axis, inclusive duplicates and empty fallbacks', () => {
    const x = timeScale({ domain: [1, 2] })
    const y = linearScale({ autoscale: 'visible', defaultDomain: [-1, 1] })
    const data = createSeries({ x: [0, 1, 1, 2, 3], y: [100, 10, 30, 20, 200] })
    plot({ scales: { x, y }, marks: [series(data, { x: 'x', y: 'y' })] })
    expect(y.domain.get()).toEqual([10, 30])
    x.domain.set([0, 1])
    expect(y.domain.get()).toEqual([10, 100])
    x.domain.set([10, 11])
    expect(y.domain.get()).toEqual([-1, 1])
    batch(() => {
      y.update({ domain: [20, 100], autoscale: 'fixed' })
      x.update({ domain: undefined, autoscale: 'visible' })
    })
    expect(x.domain.get()).toEqual([0, 2])
    batch(() => {
      y.update({ domain: undefined, autoscale: 'visible' })
      x.update({ autoscale: 'visible' })
    })
    expect(x.domain.get()).toEqual([0, 3])
    expect(y.domain.get()).toEqual([10, 200])
  })

  test('custom policies receive immutable data/visible unions and may use the fallback', () => {
    const x = timeScale({ domain: [1, 2] })
    const contexts: AutoscaleContext[] = []
    const y = linearScale({
      autoscale(context) {
        contexts.push(context)
        return context.visible
      },
      defaultDomain: [-10, 10],
    })
    plot({
      scales: { x, y },
      marks: [series(createSeries({ x: [0, 1, 2], y: [100, 10, 20] }), { x: 'x', y: 'y' })],
    })
    expect(y.domain.get()).toEqual([10, 20])
    expect(contexts.at(-1)?.data).toEqual([10, 100])
    expect(Object.isFrozen(contexts.at(-1))).toBe(true)
    expect(Object.isFrozen(contexts.at(-1)?.visible)).toBe(true)
    x.domain.set([5, 6])
    expect(y.domain.get()).toEqual([-10, 10])
    expect(() => y.update({ autoscale: () => [2, 1] })).toThrow(/ascending pair/)
    y.update({ autoscale: 'data' })
    expect(y.domain.get()).toEqual([10, 100])
  })

  test('band domains preserve first-seen order and visible-window membership', () => {
    const x = bandScale()
    const y = linearScale({ autoscale: 'visible' })
    plot({
      scales: { x, y },
      marks: [
        line({ x: 'x', y: 'y', xValues: ['b', 'a', 'b', 'gap'], yValues: [2, 10, 4, NaN] }),
        line({ x: 'x', y: 'y', xValues: ['c', 'a'], yValues: [30, 20] }),
      ],
    })
    expect(x.domain.get()).toEqual(['b', 'a', 'c'])
    expect(y.domain.get()).toEqual([2, 30])
    x.domain.set(['a'])
    expect(y.domain.get()).toEqual([10, 20])
  })

  test('range mark extents include both interval endpoints and visible overlaps', () => {
    const x = linearScale({ domain: [0, 1] })
    const y = linearScale({ autoscale: 'visible' })
    plot({
      scales: { x, y },
      directions: { x: 'x' },
      marks: [
        range({
          x: 'x',
          y: 'y',
          xValues: [
            [-1, 0.5],
            [0.5, 2],
            [3, 4],
          ],
          yValues: [
            [100, 200],
            [10, 20],
            [1000, 2000],
          ],
        }),
      ],
    })
    expect(x.domain.get()).toEqual([0, 1])
    expect(y.domain.get()).toEqual([10, 200])
  })

  test('empty/all-gap data uses defaults; singleton data stays projectable and time-safe', () => {
    const data = createSeries({ x: [8.64e15], y: [5] })
    const x = timeScale()
    const y = linearScale({ defaultDomain: [-2, 2] })
    const current = plot({ scales: { x, y }, marks: [series(data, { x: 'x', y: 'y' })] })
    expect(y.domain.get()).toEqual([4, 6])
    expect(x.domain.get()).toEqual([8.64e15 - 1, 8.64e15])
    expect(Number.isFinite(current.scales.y.project(5))).toBe(true)
    data.replace({ x: [1, 2], y: [NaN, NaN] })
    expect(y.domain.get()).toEqual([-2, 2])
    expect(x.domain.get()).toEqual([0, 1])
    data.clear()
    expect(y.domain.get()).toEqual([-2, 2])
    // @ts-expect-error Invalid policies must also fail for JavaScript callers.
    expect(() => linearScale({ autoscale: 'invalid' })).toThrow(/autoscale/)
    expect(() => linearScale({ domain: [0, 1], defaultDomain: [NaN, 1] })).toThrow(/finite/)
  })
})

describe('autoscale binding lifecycle', () => {
  test('shared visible domains use each plot window and release replaced scale bindings', () => {
    const y = linearScale({ autoscale: 'visible' })
    const data = createSeries({ x: [0, 1, 2, 3], y: [10, 20, 100, 200] })
    const mark = series(data, { x: 'x', y: 'y' })
    const firstX = timeScale({ domain: [0, 1] })
    const secondX = timeScale({ domain: [2, 3] })
    const a = plot({ scales: { x: firstX, y }, marks: [mark] })
    const b = plot({ scales: { x: secondX, y }, marks: [mark] })
    expect(y.domain.get()).toEqual([10, 200])
    b.destroy()
    expect(y.domain.get()).toEqual([10, 20])
    const replacement = linearScale({ autoscale: 'visible' })
    a.update({ scales: { y: replacement } })
    expect(y.domain.get()).toEqual([0, 1])
    expect(replacement.domain.get()).toEqual([10, 20])
    a.update({ scales: { alternate: timeScale({ domain: [2, 3] }) } })
    mark.update({ x: 'alternate' })
    expect(replacement.domain.get()).toEqual([100, 200])
    a.setConfig({})
    expect(replacement.domain.get()).toEqual([0, 1])
    const version = replacement.domain.version
    data.append({ x: [4], y: [500] })
    expect(replacement.domain.version).toBe(version)
  })

  test('max-age retention shrinks extents, including duplicate cutoff samples', () => {
    const data = createSeries({ x: [0, 1, 1, 2], y: [-100, 10, 50, 20] }, { maxAge: 2 })
    const x = timeScale()
    const y = linearScale()
    plot({ scales: { x, y }, marks: [series(data, { x: 'x', y: 'y' })] })
    expect(y.domain.get()).toEqual([-100, 50])
    data.append({ x: [3], y: [30] })
    expect(x.domain.get()).toEqual([1, 3])
    expect(y.domain.get()).toEqual([10, 50])
    data.append({ x: [4], y: [40] })
    expect(x.domain.get()).toEqual([2, 4])
    expect(y.domain.get()).toEqual([20, 40])
  })

  test('shared domains union plots with independent ranges and shrink on removal/destroy', async () => {
    const x = timeScale()
    const y = linearScale()
    const first = series(createSeries({ x: [0, 1], y: [10, 20] }), { x: 'x', y: 'y' })
    const second = series(createSeries({ x: [2, 3], y: [-30, 40] }), { x: 't', y: 'q' })
    const a = plot({ scales: { x, y }, marks: [first] })
    const b = plot({ width: 800, scales: { t: x, q: y }, marks: [second] })
    expect(y.domain.get()).toEqual([-30, 40])
    await frame()
    expect(a.scales.x.range.get()).not.toEqual(b.scales.t.range.get())
    b.update({ marks: [] })
    expect(y.domain.get()).toEqual([10, 20])
    b.update({ marks: [second] })
    expect(y.domain.get()).toEqual([-30, 40])
    b.destroy()
    expect(y.domain.get()).toEqual([10, 20])
    const version = y.domain.version
    second.data.append({ x: [4], y: [1000] })
    expect(y.domain.version).toBe(version)
    a.destroy()
    expect(y.domain.get()).toEqual([0, 1])
  })

  test('mutations, retention, rebindings and replacement update extents and rendering', async () => {
    const data = createSeries({ x: [0, 1], y: [10, 20] }, { maxPoints: 3 })
    const x = timeScale()
    const y = linearScale()
    const other = linearScale()
    const mark = series(data, { x: 'x', y: 'y' })
    const baseline = reactive.getDiagnostics()
    const current = plot({ scales: { x, y, other }, marks: [mark] })
    await frame()
    const path = current.element.querySelector('[data-mark="line"]')!
    const writes = vi.spyOn(path, 'setAttribute')
    batch(() => {
      data.append({ x: [2], y: [30] })
      data.append({ x: [3], y: [40] })
    })
    expect(y.domain.get()).toEqual([20, 40])
    await frame()
    expect(writes.mock.calls.filter(([key]) => key === 'd')).toHaveLength(1)
    expect(path.getAttribute('d')).toContain(
      `L${current.scales.x.project(3)},${current.scales.y.project(40)}`,
    )
    data.upsert({ from: 1, to: 2, rows: { x: [1, 2], y: [-10, 5] } })
    expect(y.domain.get()).toEqual([-10, 40])
    data.replace({ x: [5, 6], y: [50, 60] })
    expect(y.domain.get()).toEqual([50, 60])
    data.prepend({ x: [4], y: [-5] })
    expect(y.domain.get()).toEqual([-5, 60])
    mark.update({ y: 'other' })
    expect(y.domain.get()).toEqual([0, 1])
    expect(other.domain.get()).toEqual([-5, 60])
    current.setConfig({ scales: { x, y }, marks: [] })
    expect(other.domain.get()).toEqual([0, 1])
    expect(y.domain.get()).toEqual([0, 1])
    current.destroy()
    expect(reactive.getDiagnostics().activeEffects).toBe(baseline.activeEffects)
    expect(reactive.getDiagnostics().activeComputeds).toBe(baseline.activeComputeds)
    expect(reactive.getDiagnostics().activeScopes).toBe(baseline.activeScopes)
  })
})

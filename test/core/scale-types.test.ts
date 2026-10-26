import { afterEach, beforeEach, expect, expectTypeOf, test, vi } from 'vitest'
import {
  angularScale,
  bandScale,
  degreesScale,
  linearScale,
  logScale,
  radialScale,
  sharedScale,
  subscribe,
  timeScale,
  type NumericDomain,
  type PlotConfig,
  type ScaleHandle,
} from '../../src/index.js'
import { bindScale } from '../../src/scales/scale.js'

let pendingFrames: FrameRequestCallback[] = []

function flushFrame() {
  const callbacks = pendingFrames
  pendingFrames = []
  for (const callback of callbacks) callback(0)
}

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    pendingFrames.push(callback)
    return pendingFrames.length
  })
})

afterEach(() => {
  flushFrame()
  vi.unstubAllGlobals()
})

test('continuous constructors expose numeric tuple domains and updater arguments', () => {
  const scales = [
    linearScale(),
    logScale(),
    timeScale(),
    degreesScale(),
    angularScale(),
    radialScale(),
  ]
  for (const scale of scales) {
    expectTypeOf(scale.domain.get()).toEqualTypeOf<NumericDomain>()
    expectTypeOf(scale.options.get().resolved.domain).toEqualTypeOf<NumericDomain | undefined>()
    expectTypeOf(scale.options.get().resolved.defaultDomain).toEqualTypeOf<NumericDomain>()
    scale.domain.update(([from, to]) => {
      expectTypeOf(from).toEqualTypeOf<number>()
      expectTypeOf(to).toEqualTypeOf<number>()
      return [from + 0.25, to + 0.25]
    })
    expect(scale.domain.get().every((value) => typeof value === 'number')).toBe(true)
    const binding = bindScale(scale, { get: () => [0, 100], version: 0 })
    expectTypeOf(binding.ticks()).toEqualTypeOf<readonly number[]>()
    expectTypeOf(binding.project).parameter(0).toEqualTypeOf<number>()
  }
})

test('sharing and subscribing preserve numeric domains and scale kinds', () => {
  const time = sharedScale(timeScale({ domain: [1000.25, 2000.75] }))
  expectTypeOf(time).toEqualTypeOf<ScaleHandle<'time'>>()
  const deliveries: NumericDomain[] = []
  const previousDomains: (NumericDomain | undefined)[] = []
  const stop = subscribe(
    time.domain,
    (domain, previous) => {
      expectTypeOf(domain).toEqualTypeOf<NumericDomain>()
      expectTypeOf(previous).toEqualTypeOf<NumericDomain | undefined>()
      const [from, to] = domain
      deliveries.push([from, to])
      previousDomains.push(previous)
    },
    {
      immediate: true,
      equals: (next, previous) => {
        expectTypeOf(next).toEqualTypeOf<NumericDomain>()
        expectTypeOf(previous).toEqualTypeOf<NumericDomain>()
        return next[0] === previous[0] && next[1] === previous[1]
      },
    },
  )
  try {
    expect(deliveries).toEqual([[1000.25, 2000.75]])
    flushFrame()
    time.domain.update(([from, to]) => [from + 0.125, to + 0.125])
    flushFrame()
    expect(deliveries).toEqual([
      [1000.25, 2000.75],
      [1000.375, 2000.875],
    ])
    expect(previousDomains).toEqual([undefined, [1000.25, 2000.75]])
  } finally {
    stop()
  }
})

test('band scales retain string domains through updates, sharing and subscriptions', () => {
  const categories = sharedScale(bandScale({ domain: ['a', 'b', 'c'] }))
  expectTypeOf(categories).toEqualTypeOf<ScaleHandle<'band'>>()
  expectTypeOf(categories.domain.get()).toEqualTypeOf<readonly string[]>()
  expectTypeOf(categories.options.get().resolved.defaultDomain).toEqualTypeOf<readonly string[]>()
  categories.domain.update((domain) => {
    expectTypeOf(domain).toEqualTypeOf<readonly string[]>()
    return [...domain, 'd']
  })
  const stop = subscribe(
    categories.domain,
    (domain, previous) => {
      expectTypeOf(domain).toEqualTypeOf<readonly string[]>()
      expectTypeOf(previous).toEqualTypeOf<readonly string[] | undefined>()
      expect(domain).toEqual(['a', 'b', 'c', 'd'])
    },
    { immediate: true },
  )
  stop()
  const binding = bindScale(categories, { get: () => [0, 100], version: 0 })
  expectTypeOf(binding.ticks()).toEqualTypeOf<readonly string[]>()
  expectTypeOf(binding.project).parameter(0).toEqualTypeOf<string>()
})

test('specialized scales remain assignable to heterogeneous plot configurations', () => {
  const time = timeScale()
  const categories = bandScale()
  const config: PlotConfig = { scales: { time, categories, value: linearScale() } }
  expect(config.scales?.time).toBe(time)
  expect(config.scales?.categories).toBe(categories)
  const general: ScaleHandle = time
  expectTypeOf(general.domain.get()).toEqualTypeOf<readonly (number | string)[]>()
})

test('invalid domain shapes and element types fail static and runtime validation', () => {
  // @ts-expect-error Continuous domains require exactly two numeric endpoints.
  expect(() => timeScale({ domain: [1] })).toThrow(/ascending pair/)
  // @ts-expect-error Continuous domains cannot contain categories.
  expect(() => linearScale({ defaultDomain: ['a', 'b'] })).toThrow(/finite numbers/)
  // @ts-expect-error Band domains cannot contain numbers.
  expect(() => bandScale({ domain: [1, 2] })).toThrow(/unique strings/)
  const time = timeScale()
  // @ts-expect-error Time domains use numeric epoch milliseconds, not Date objects.
  expect(() => time.domain.set([new Date(0), new Date(1)])).toThrow(/finite numbers/)
  // @ts-expect-error Typed signal writes reject category domains.
  expect(() => time.domain.set(['a', 'b'])).toThrow(/finite numbers/)
  // @ts-expect-error Typed updater callbacks must return a numeric pair.
  expect(() => time.domain.update(() => [1, 2, 3])).toThrow(/ascending pair/)
  // @ts-expect-error Typed option updates reject category domains.
  expect(() => time.update({ domain: ['a', 'b'] })).toThrow(/finite numbers/)
  const categories = bandScale()
  // @ts-expect-error Typed band updates reject numeric default domains.
  expect(() => categories.update({ defaultDomain: [1, 2] })).toThrow(/unique strings/)
})

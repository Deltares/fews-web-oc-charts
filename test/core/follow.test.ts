import { afterEach, expect, test } from 'vitest'
import { createSeries, timeScale } from '../../src/index.js'
import { withSource } from '../../src/core/runtime.js'
import { registerScaleExtents } from '../../src/scales/scale.js'

const cleanups: (() => void)[] = []

afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
})

function connectData(scale: ReturnType<typeof timeScale>, store: ReturnType<typeof createSeries>) {
  const disconnect = registerScaleExtents(scale, () => {
    store.version
    return store.length ? [store.xAt(0), store.xAt(store.length - 1)] : undefined
  })
  cleanups.push(disconnect)
}

test('rejects unsupported duration units with the option path and supported formats', () => {
  expect(() => timeScale({ follow: { window: '2w' } })).toThrow(
    'scale.follow.window must be milliseconds, an elapsed duration (ms, s, m, h) or ISO days (PnD).',
  )
})

test('follows appends and retention, and keeps an empty store on its configured base domain', () => {
  const store = createSeries({ x: [], y: [] }, { maxPoints: 3 })
  const scale = timeScale({ domain: [0, 1], follow: { window: 100, lead: 20 } })
  connectData(scale, store)
  expect(scale.domain.get()).toEqual([0, 1])

  store.append({ x: [1_000, 1_100], y: [1, 2] })
  expect(scale.domain.get()).toEqual([980, 1_080])
  store.append({ x: [1_200, 1_300, 1_400], y: [3, 4, 5] })
  expect(store.length).toBe(3)
  expect(store.xAt(0)).toBe(1_200)
  expect(scale.domain.get()).toEqual([1_280, 1_380])
  store.clear()
  expect(scale.domain.get()).toEqual([0, 1])
  scale.update({ follow: undefined })
  expect(scale.following.get()).toBe(false)
  expect(() => scale.resumeFollow()).toThrow(/follow configured/)
  scale.update({ follow: { window: 100 } })
  expect(scale.following.get()).toBe(true)
  store.append({ x: [2_000], y: [6] })
  expect(scale.domain.get()).toEqual([1_900, 2_000])
})

test('API domain writes remain until data changes; gestures suspend both peers through scale identity', () => {
  const store = createSeries({ x: [1_000, 1_100], y: [1, 2] })
  const scale = timeScale({ domain: [0, 1], follow: { window: 100, lead: 20 } })
  connectData(scale, store)
  const peer = scale

  scale.update({ domain: [500, 600] })
  expect(scale.following.get()).toBe(true)
  expect(peer.domain.get()).toEqual([500, 600])
  store.append({ x: [1_100], y: [2.5] })
  expect(peer.domain.get()).toEqual([980, 1_080])

  scale.update({ domain: [500, 600] })
  store.append({ x: [1_200], y: [3] })
  expect(peer.domain.get()).toEqual([1_080, 1_180])

  withSource('pan', () => scale.update({ domain: [1_050, 1_100] }))
  expect(peer.following.get()).toBe(false)
  store.append({ x: [1_300], y: [4] })
  expect(peer.domain.get()).toEqual([1_050, 1_100])
  withSource('reset', () => scale.update({ domain: undefined }))
  expect(peer.following.get()).toBe(true)
  expect(peer.domain.get()).toEqual([1_180, 1_280])
})

test('calendar-day windows use local civil time across daylight-saving gaps', () => {
  const store = createSeries({ x: [Date.UTC(2025, 2, 31, 0, 30)], y: [1] })
  const scale = timeScale({
    timeZone: 'Europe/Amsterdam',
    follow: { window: 'P1D' },
  })
  connectData(scale, store)
  expect(scale.domain.get()).toEqual([Date.UTC(2025, 2, 30, 1, 30), Date.UTC(2025, 2, 31, 0, 30)])
})

test.each([undefined, [0, 1]])(
  'pausing holds the displayed window rather than the base domain %j',
  (domain) => {
    const store = createSeries({ x: [1_000, 1_100], y: [1, 2] })
    const scale = timeScale({ domain, follow: { window: 100, lead: 20 }, padding: 0.1 })
    connectData(scale, store)
    scale.update({ domain: [500, 600] })
    store.append({ x: [1_200], y: [3] })

    scale.pauseFollow()
    expect(scale.following.get()).toBe(false)
    expect(scale.domain.get()).toEqual([1_070, 1_190])
    scale.pauseFollow()
    store.append({ x: [1_300], y: [4] })
    expect(scale.domain.get()).toEqual([1_070, 1_190])
    scale.resumeFollow()
    expect(scale.domain.get()).toEqual([1_170, 1_290])

    scale.pauseFollow()
    scale.update({ domain: [300, 400] })
    expect(scale.domain.get()).toEqual([290, 410])
    store.append({ x: [1_400], y: [5] })
    expect(scale.domain.get()).toEqual([290, 410])
    withSource('reset', () => scale.update({ domain: undefined }))
    expect(scale.following.get()).toBe(true)
    expect(scale.domain.get()).toEqual([1_270, 1_390])
  },
)

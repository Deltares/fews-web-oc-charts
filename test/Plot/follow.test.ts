import { afterEach, expect, test } from 'vitest'
import {
  createPlot,
  createSeries,
  linearScale,
  pan,
  series,
  timeScale,
  zoom,
  type Plot,
} from '../../src/index.js'

const plots: Plot[] = []
const hosts: HTMLElement[] = []

function host() {
  const element = document.createElement('div')
  document.body.append(element)
  hosts.push(element)
  return element
}

function plot(...args: Parameters<typeof createPlot>) {
  const result = createPlot(...args)
  plots.push(result)
  return result
}

async function frame() {
  await new Promise(requestAnimationFrame)
  await new Promise(requestAnimationFrame)
}

afterEach(() => {
  plots.splice(0).forEach((current) => current.destroy())
  hosts.splice(0).forEach((element) => element.remove())
})

test('validates follow windows and computes a shared time window on data changes', async () => {
  expect(() => timeScale({ follow: { window: 0 } })).toThrow(/window.*positive/)
  expect(() => timeScale({ follow: { window: 'P0D' } })).toThrow(/window.*positive/)
  expect(() => timeScale({ follow: { window: '2w' } })).toThrow(
    /scale\.follow\.window must be milliseconds/,
  )
  // @ts-expect-error Follow configuration is only available for time scales.
  expect(() => linearScale({ follow: { window: 100 } })).toThrow(/requires a time scale/)

  const data = createSeries({ x: [], y: [] }, { maxPoints: 3 })
  const time = timeScale({ domain: [0, 1], follow: { window: 100, lead: 20 } })
  const current = plot(host(), {
    width: 400,
    height: 240,
    directions: { x: 'x', y: 'y' },
    scales: { x: time, y: linearScale({ domain: [0, 10] }) },
    marks: [series(data, { x: 'x', y: 'y' })],
  })
  await frame()

  expect(time.following.get()).toBe(true)
  expect(time.domain.get()).toEqual([0, 1])
  data.append({ x: [1_000, 1_100], y: [1, 2] })
  expect(time.domain.get()).toEqual([980, 1_080])
  data.append({ x: [1_200], y: [3] })
  expect(time.domain.get()).toEqual([1_080, 1_180])
  data.append({ x: [1_300, 1_400], y: [4, 5] })
  expect(data.length).toBe(3)
  expect(data.xAt(0)).toBe(1_200)
  expect(time.domain.get()).toEqual([1_280, 1_380])
  data.clear()
  expect(time.domain.get()).toEqual([0, 1])

  current.destroy()
})

test('suspends shared follow on peer gestures and resumes after reset', async () => {
  const data = createSeries({ x: [1_000, 1_100], y: [1, 2] })
  const time = timeScale({ domain: [0, 1], follow: { window: 100, lead: 20 } })
  const first = plot(host(), {
    width: 400,
    height: 240,
    directions: { x: 'x', y: 'y' },
    scales: { x: time, y: linearScale({ domain: [0, 10] }) },
    marks: [series(data, { x: 'x', y: 'y' })],
    plugins: [pan({ mode: 'x' })],
  })
  const second = plot(host(), {
    width: 600,
    height: 240,
    directions: { x: 'x', y: 'y' },
    scales: { x: time, y: linearScale({ domain: [0, 10] }) },
    marks: [series(data, { x: 'x', y: 'y' })],
    plugins: [zoom({ mode: 'x', wheel: 'x' })],
  })
  await frame()
  expect(time.domain.get()).toEqual([980, 1_080])

  const bounds = second.element.getBoundingClientRect()
  const center = { clientX: bounds.x + 300, clientY: bounds.y + 120 }
  second.element.dispatchEvent(
    new WheelEvent('wheel', { ...center, deltaY: -100, cancelable: true, bubbles: true }),
  )
  const zoomed = [...time.domain.get()]
  expect(time.following.get()).toBe(false)
  data.append({ x: [1_200], y: [3] })
  expect(time.domain.get()).toEqual(zoomed)

  second.element.dispatchEvent(
    new MouseEvent('dblclick', { ...center, button: 0, cancelable: true, bubbles: true }),
  )
  expect(time.following.get()).toBe(true)
  expect(time.domain.get()).toEqual([1_080, 1_180])
  await frame()

  const firstBounds = first.element.getBoundingClientRect()
  const start = { clientX: firstBounds.x + 160, clientY: firstBounds.y + 120 }
  first.element.dispatchEvent(
    new PointerEvent('pointerdown', {
      ...start,
      pointerId: 1,
      isPrimary: true,
      button: 0,
      bubbles: true,
      cancelable: true,
    }),
  )
  first.element.dispatchEvent(
    new PointerEvent('pointermove', {
      ...start,
      clientX: start.clientX + 30,
      pointerId: 1,
      isPrimary: true,
      bubbles: true,
      cancelable: true,
    }),
  )
  first.element.dispatchEvent(
    new PointerEvent('pointerup', { ...start, pointerId: 1, isPrimary: true, bubbles: true }),
  )
  const panned = [...time.domain.get()]
  expect(time.following.get()).toBe(false)
  data.append({ x: [1_300], y: [4] })
  expect(time.domain.get()).toEqual(panned)

  second.element.dispatchEvent(
    new MouseEvent('dblclick', {
      ...center,
      button: 0,
      cancelable: true,
      bubbles: true,
    }),
  )
  expect(time.following.get()).toBe(true)
  expect(time.domain.get()).toEqual([1_180, 1_280])
  await frame()
})

test('API domain writes preserve follow until the next data update; controls are explicit', () => {
  const data = createSeries({ x: [1_000, 1_100], y: [1, 2] })
  const time = timeScale({ domain: [0, 1], follow: { window: '100ms', lead: '20ms' } })
  const current = plot(host(), {
    width: 400,
    height: 240,
    directions: { x: 'x', y: 'y' },
    scales: { x: time, y: linearScale({ domain: [0, 10] }) },
    marks: [series(data, { x: 'x', y: 'y' })],
  })
  expect(time.domain.get()).toEqual([980, 1_080])
  time.update({ domain: [500, 600] })
  expect(time.following.get()).toBe(true)
  expect(time.domain.get()).toEqual([500, 600])
  data.append({ x: [1_200], y: [3] })
  expect(time.domain.get()).toEqual([1_080, 1_180])

  time.pauseFollow()
  expect(time.following.get()).toBe(false)
  data.append({ x: [1_300], y: [4] })
  expect(time.domain.get()).toEqual([1_080, 1_180])
  time.resumeFollow()
  expect(time.following.get()).toBe(true)
  expect(time.domain.get()).toEqual([1_180, 1_280])
  current.destroy()
})

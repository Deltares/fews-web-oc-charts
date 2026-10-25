import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  axis,
  angularScale,
  brush,
  createPlot,
  createPolarPlot,
  createSeries,
  createTable,
  createSkewTPlot,
  crosshair,
  highlight,
  histogram,
  legend,
  linearScale,
  logScale,
  pan,
  radialScale,
  series,
  sharedPointer,
  sharedSelection,
  subscribe,
  timeScale,
  tooltip,
  type Plot,
} from '../../src/index.js'

class VisibilityObserver implements IntersectionObserver {
  static instances: VisibilityObserver[] = []
  readonly root = null
  readonly rootMargin = '0px'
  readonly scrollMargin = '0px'
  readonly thresholds = [0]
  readonly observe = vi.fn()
  readonly unobserve = vi.fn()
  readonly disconnect = vi.fn()
  readonly takeRecords = () => []

  constructor(private readonly callback: IntersectionObserverCallback) {
    VisibilityObserver.instances.push(this)
  }

  report(target: Element, isIntersecting: boolean) {
    const rect = target.getBoundingClientRect()
    this.callback(
      [
        {
          target,
          isIntersecting,
          boundingClientRect: rect,
          intersectionRect: rect,
          intersectionRatio: isIntersecting ? 1 : 0,
          rootBounds: null,
          time: 0,
        },
      ],
      this,
    )
  }
}

let frames: FrameRequestCallback[] = []
const plots: Plot[] = []
const hosts: HTMLElement[] = []

function flush() {
  for (let count = 0; frames.length > 0; count++) {
    if (count === 20) throw new Error('Frames did not settle.')
    const current = frames
    frames = []
    current.forEach((callback) => callback(0))
  }
}

function host() {
  const element = document.createElement('div')
  element.style.cssText = 'position:fixed;left:0;top:20000px;width:400px;height:240px'
  document.body.append(element)
  hosts.push(element)
  return element
}

function visible(current: Plot, value = true) {
  VisibilityObserver.instances[0].report(hosts[plots.indexOf(current)], value)
}

function observe(element: Node) {
  const observer = new MutationObserver(() => {})
  observer.observe(element, {
    attributes: true,
    childList: true,
    characterData: true,
    subtree: true,
  })
  return observer
}

beforeEach(() => {
  VisibilityObserver.instances = []
  vi.stubGlobal('IntersectionObserver', VisibilityObserver)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback))
})

afterEach(() => {
  plots.splice(0).forEach((plot) => plot.destroy())
  hosts.splice(0).forEach((element) => element.remove())
  flush()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('plot visibility suspension', () => {
  test('waits for initial visibility and keeps manual and visibility suspension independent', () => {
    const current = createPlot(host(), { width: 400, height: 240 })
    plots.push(current)
    const writes = observe(current.element)
    expect(current.paused).toBe(true)
    flush()
    visible(current, false)
    current.update({ title: 'latest' })
    current.resume()
    flush()
    expect(current.paused).toBe(true)
    expect(writes.takeRecords()).toHaveLength(0)

    current.pause()
    current.pause()
    visible(current)
    flush()
    expect(current.paused).toBe(true)
    expect(writes.takeRecords()).toHaveLength(0)
    current.resume()
    current.resume()
    flush()
    expect(current.paused).toBe(false)
    expect(current.element.querySelector('text')?.textContent).toBe('latest')
    expect(writes.takeRecords().length).toBeGreaterThan(0)
    current.pause()
    current.resume()
    flush()
    expect(writes.takeRecords()).toHaveLength(0)
    writes.disconnect()
  })

  test('coalesces data, scale, layout, style and plugin writes while peers and subscriptions stay active', () => {
    const data = createSeries({ x: [1_000, 1_100], y: [1, 2] }, { maxPoints: 3 })
    const x = timeScale({ follow: { window: 100 } })
    const y = linearScale({ domain: [0, 10] })
    const pointer = sharedPointer({ by: 'x' })
    const selection = sharedSelection()
    const mark = series(data, { x: 'x', y: 'y' })
    const cursor = crosshair({ pointer })
    const range = brush({ mode: 'x', persistent: true, selection })
    const key = legend()
    const current = createPlot(host(), {
      width: 400,
      height: 240,
      directions: { x: 'x', y: 'y' },
      scales: { x, y },
      axes: [axis('x', { position: 'bottom' }), axis('y', { position: 'left' })],
      marks: [mark],
      plugins: [
        cursor,
        range,
        key,
        tooltip({ crosshair: cursor }),
        highlight({ crosshair: cursor }),
        pan(),
      ],
    })
    plots.push(current)
    const peer = createPlot(host(), {
      width: 300,
      height: 200,
      directions: { x: 'x', y: 'y' },
      scales: { x, y },
      marks: [series(data, { x: 'x', y: 'y' })],
      plugins: [crosshair({ pointer }), brush({ mode: 'x', persistent: true, selection })],
    })
    plots.push(peer)
    visible(current)
    visible(peer)
    flush()
    const path = current.element.querySelector('[data-mark="line"]')
    expect(path).not.toBeNull()
    const geometry = vi.spyOn(path!, 'setAttribute')
    const writes = observe(hosts[0])
    const tooltipElement = document.querySelector('.fews-chart-tooltip')!
    const tooltipWrites = observe(tooltipElement)
    const peerBefore = peer.element.innerHTML
    const domains: unknown[] = []
    const stop = subscribe(x.domain, (value) => domains.push(value))
    const events = vi.fn()
    current.on('domainchange', events)
    flush()
    writes.takeRecords()
    tooltipWrites.takeRecords()

    current.pause()
    data.append({ x: [1_200], y: [3] })
    flush()
    data.append({ x: [1_300, 1_400], y: [4, 5] })
    current.update({ width: 450, title: 'caught up', theme: 'dark' })
    range.setSelection({ mode: 'x', scales: { x: [1_320, 1_380] } })
    key.update({ position: 'top-left' })
    flush()
    expect(writes.takeRecords()).toHaveLength(0)
    expect(tooltipWrites.takeRecords()).toHaveLength(0)
    expect(geometry).not.toHaveBeenCalled()
    expect(peer.element.innerHTML).not.toBe(peerBefore)
    expect(data.length).toBe(3)
    expect(x.domain.get()).toEqual([1_300, 1_400])
    expect(domains.at(-1)).toEqual([1_300, 1_400])
    expect(events).toHaveBeenCalled()

    current.resume()
    flush()
    expect(geometry.mock.calls.filter(([name]) => name === 'd')).toHaveLength(1)
    expect(current.size.get().width).toBe(450)
    expect(writes.takeRecords().length).toBeGreaterThan(0)
    expect(tooltipWrites.takeRecords().length).toBeGreaterThan(0)
    stop()
    writes.disconnect()
    tooltipWrites.disconnect()
  })

  test('shares one observer and drops pending work and stale callbacks on destruction', () => {
    const current = createPlot(host(), { width: 400, height: 240 })
    plots.push(current)
    const peer = createPlot(host(), { width: 400, height: 240 })
    plots.push(peer)
    const observer = VisibilityObserver.instances[0]
    expect(VisibilityObserver.instances).toHaveLength(1)
    expect(observer.observe).toHaveBeenCalledTimes(2)
    visible(current)
    visible(peer)
    flush()
    current.update({ title: 'never painted' })
    current.pause()
    current.destroy()
    expect(observer.unobserve).toHaveBeenCalledWith(hosts[0])
    expect(observer.disconnect).not.toHaveBeenCalled()
    const writes = observe(current.element)
    observer.report(hosts[0], true)
    flush()
    expect(writes.takeRecords()).toHaveLength(0)
    expect(() => current.resume()).toThrow(/destroyed/)
    expect(() => current.pause()).toThrow(/destroyed/)
    peer.destroy()
    expect(observer.disconnect).toHaveBeenCalledOnce()
    writes.disconnect()
  })

  test('does not repaint canvas marks until resume', () => {
    const data = createTable({ row: [0, 1, 2], sample: [0, 1, 2] })
    const mark = histogram(data, {
      x: 'sample',
      scales: { x: 'x', y: 'y' },
      bins: [0, 1, 3],
      renderer: 'canvas',
      fill: '#ff0000',
    })
    const current = createPlot(host(), {
      width: 400,
      height: 240,
      directions: { x: 'x', y: 'y' },
      scales: {
        x: linearScale({ domain: [0, 3] }),
        y: linearScale({ domain: [0, 3] }),
      },
      marks: [mark],
    })
    plots.push(current)
    visible(current)
    flush()
    const canvas = current.element.querySelector('canvas')
    if (!canvas) throw new Error('Expected a canvas mark.')
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Expected a canvas context.')
    const paint = vi.spyOn(context, 'clearRect')
    current.pause()
    mark.update({ fill: '#0000ff' })
    current.update({ width: 450 })
    flush()
    expect(paint).not.toHaveBeenCalled()
    current.resume()
    flush()
    expect(paint).toHaveBeenCalledOnce()
  })

  test('defers plugin membership changes and destroys initially suspended plots safely', () => {
    const current = createPlot(host(), { width: 400, height: 240 })
    plots.push(current)
    visible(current)
    flush()
    const writes = observe(current.element)
    current.pause()
    current.update({ plugins: [crosshair(), legend()] })
    flush()
    expect(writes.takeRecords()).toHaveLength(0)
    expect(current.element.querySelector('[data-layer="crosshair"]')).toBeNull()
    current.resume()
    flush()
    expect(current.element.querySelector('[data-layer="crosshair"]')).not.toBeNull()
    writes.takeRecords()
    current.pause()
    current.update({ plugins: [] })
    flush()
    expect(writes.takeRecords()).toHaveLength(0)
    current.resume()
    flush()
    expect(current.element.querySelector('[data-layer="crosshair"]')).toBeNull()
    writes.disconnect()

    const initial = createPlot(host(), { width: 400, height: 240, plugins: [tooltip()] })
    plots.push(initial)
    const initialWrites = observe(initial.element)
    initial.destroy()
    visible(initial)
    flush()
    expect(initialWrites.takeRecords()).toHaveLength(0)
    initialWrites.disconnect()
  })

  test('exposes suspension on polar and Skew-T plots too', () => {
    const factories = [
      () =>
        createPolarPlot(host(), {
          width: 400,
          height: 240,
          scales: { angle: angularScale(), radius: radialScale() },
        }),
      () =>
        createSkewTPlot(host(), {
          width: 400,
          height: 240,
          scales: {
            temperature: linearScale({ domain: [-40, 50] }),
            pressure: logScale({ domain: [100, 1000], reverse: true }),
          },
        }),
    ]
    for (const create of factories) {
      const current = create()
      plots.push(current)
      visible(current)
      flush()
      current.pause()
      current.update({ title: 'deferred' })
      const writes = observe(current.element)
      flush()
      expect(writes.takeRecords()).toHaveLength(0)
      current.resume()
      flush()
      expect(writes.takeRecords().length).toBeGreaterThan(0)
      writes.disconnect()
    }
  })

  test('suspends and resumes with native viewport intersections', async () => {
    vi.unstubAllGlobals()
    const element = host()
    element.style.position = 'fixed'
    element.style.top = '20000px'
    const current = createPlot(element, { width: 400, height: 240 })
    plots.push(current)
    const mutations: MutationRecord[] = []
    const writes = new MutationObserver((records) => mutations.push(...records))
    writes.observe(current.element, { attributes: true, childList: true, subtree: true })
    const frame = async () => {
      for (let i = 0; i < 4; i++) await new Promise(requestAnimationFrame)
    }
    await frame()
    expect(current.paused).toBe(true)
    expect([...mutations, ...writes.takeRecords()]).toHaveLength(0)
    element.style.top = '0'
    await expect.poll(() => current.paused).toBe(false)
    await frame()
    expect(current.size.get()).toEqual({ width: 400, height: 240 })
    current.pause()
    element.style.top = '20000px'
    await frame()
    current.resume()
    expect(current.paused).toBe(true)
    element.style.top = '0'
    await expect.poll(() => current.paused).toBe(false)
    writes.disconnect()

    const onScreen = host()
    onScreen.style.top = '0'
    const immediate = createPlot(onScreen, { width: 400, height: 240, title: 'now' })
    plots.push(immediate)
    expect(immediate.paused).toBe(false)
    await expect
      .poll(() => [...immediate.element.querySelectorAll('text')].map((node) => node.textContent))
      .toContain('now')
  })
})

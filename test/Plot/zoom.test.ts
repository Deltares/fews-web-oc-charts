import { afterEach, expect, test } from 'vitest'
import {
  createPlot,
  bandScale,
  brush,
  line,
  linearScale,
  logScale,
  ModifierKey,
  pan,
  timeScale,
  zoom,
  type DomainChangeDetail,
  type Plot,
  type PlotConfig,
} from '../../src/index.js'

const plots: Plot[] = []
const hosts: HTMLElement[] = []

async function frame() {
  await new Promise(requestAnimationFrame)
  await new Promise(requestAnimationFrame)
}

afterEach(() => {
  for (const plot of plots.splice(0)) plot.destroy()
  for (const host of hosts.splice(0)) host.remove()
})

function pointer(plot: Plot, type: string, x: number, y: number, options: PointerEventInit = {}) {
  const bounds = plot.element.getBoundingClientRect()
  return plot.element.dispatchEvent(
    new PointerEvent(type, {
      clientX: bounds.x + x,
      clientY: bounds.y + y,
      button: 0,
      pointerId: 1,
      isPrimary: true,
      cancelable: true,
      bubbles: true,
      ...options,
    }),
  )
}

async function dragSetup(
  mode: 'x' | 'y' | 'xy' | 'auto' = 'xy',
  plugins: NonNullable<PlotConfig['plugins']> = [],
) {
  const host = document.createElement('div')
  document.body.append(host)
  hosts.push(host)
  const x = linearScale({ domain: [0, 360] })
  const y = linearScale({ domain: [0, 260] })
  const interaction = zoom({ mode })
  const plot = createPlot(host, {
    width: 400,
    height: 300,
    margins: { top: 20, right: 20, bottom: 20, left: 20 },
    directions: { x: 'x', y: 'y' },
    scales: { x, y },
    plugins: [interaction, ...plugins],
  })
  plots.push(plot)
  await frame()
  return { plot, x, y, interaction }
}

test.each(['x', 'y', 'xy'] as const)(
  'box zoom commits %s domains on release and emits zoom snapshots',
  async (mode) => {
    const { plot, x, y } = await dragSetup(mode)
    const details: DomainChangeDetail[] = []
    plot.on('domainchange', (detail) => details.push(detail))
    const selection = plot.element.querySelector('[data-zoom-selection]')!
    expect(pointer(plot, 'pointerdown', 300, 230)).toBe(false)
    pointer(plot, 'pointermove', 100, 80)
    expect(selection.getAttribute('display')).toBe('')
    expect(
      ['x', 'y', 'width', 'height'].map((name) => Number(selection.getAttribute(name))),
    ).toEqual(
      [
        mode === 'y' ? 20 : 100,
        mode === 'x' ? 20 : 80,
        mode === 'y' ? 360 : 200,
        mode === 'x' ? 260 : 150,
      ].map((value) => expect.closeTo(value, 10)),
    )
    await frame()
    expect(x.domain.get()).toEqual([0, 360])
    expect(y.domain.get()).toEqual([0, 260])
    expect(details).toEqual([])
    pointer(plot, 'pointerup', 100, 80)
    await frame()
    expect(selection.getAttribute('display')).toBe('none')
    expect(x.domain.get()).toEqual(
      mode.includes('x') ? [expect.closeTo(80, 10), expect.closeTo(280, 10)] : [0, 360],
    )
    expect(y.domain.get()).toEqual(
      mode.includes('y') ? [expect.closeTo(50, 10), expect.closeTo(200, 10)] : [0, 260],
    )
    expect(details.map(({ scale, source, explicit }) => ({ scale, source, explicit }))).toEqual(
      ['x', 'y']
        .filter((axis) => mode.includes(axis))
        .map((scale) => ({
          scale,
          source: 'zoom',
          explicit: true,
        })),
    )
    for (const detail of details) {
      expect(detail.previous).toEqual(detail.scale === 'x' ? [0, 360] : [0, 260])
      expect(detail.domain).toEqual(
        (detail.scale === 'x' ? [80, 280] : [50, 200]).map((value) => expect.closeTo(value, 10)),
      )
      expect(Object.isFrozen(detail.domain)).toBe(true)
    }
  },
)

test.each([
  { direction: 'horizontal', start: [300, 100], end: [100, 110], expected: 'x' },
  { direction: 'vertical', start: [100, 230], end: [110, 80], expected: 'y' },
  { direction: 'diagonal', start: [300, 230], end: [100, 80], expected: 'xy' },
] as const)(
  'automatic box zoom selects the $expected axis for a $direction drag',
  async ({ start, end, expected }) => {
    const { plot, x, y } = await dragSetup('auto')
    pointer(plot, 'pointerdown', ...start)
    pointer(plot, 'pointerup', ...end)
    await frame()
    expect(x.domain.get()).toEqual(
      expected.includes('x') ? [expect.closeTo(80, 10), expect.closeTo(280, 10)] : [0, 360],
    )
    expect(y.domain.get()).toEqual(
      expected.includes('y') ? [expect.closeTo(50, 10), expect.closeTo(200, 10)] : [0, 260],
    )
  },
)

test('automatic zoom shows directional guides and hides them when the gesture ends', async () => {
  const { plot, x, y } = await dragSetup('auto')
  const handles = [...plot.element.querySelectorAll('[data-zoom-handle]')]
  const visibleHandles = () =>
    handles
      .filter((node) => node.getAttribute('display') !== 'none')
      .map((node) => node.getAttribute('data-zoom-handle'))
  pointer(plot, 'pointerdown', 100, 100)
  pointer(plot, 'pointermove', 125, 125)
  expect(visibleHandles()).toEqual([])
  pointer(plot, 'pointermove', 300, 120)
  expect(visibleHandles()).toEqual(['w', 'e'])
  expect(
    ['x', 'y', 'width', 'height'].map((name) => Number(handles[0].getAttribute(name))),
  ).toEqual([97, 75, 6, 50])
  pointer(plot, 'pointermove', 120, 200)
  expect(visibleHandles()).toEqual(['n', 's'])
  expect(
    ['x', 'y', 'width', 'height'].map((name) => Number(handles[2].getAttribute(name))),
  ).toEqual([75, 97, 50, 6])
  pointer(plot, 'pointermove', 300, 200)
  expect(visibleHandles()).toEqual([])
  pointer(plot, 'pointermove', 300, 100)
  expect(visibleHandles()).toEqual(['w', 'e'])
  pointer(plot, 'pointercancel', 300, 100)
  expect(visibleHandles()).toEqual([])
  expect(x.domain.get()).toEqual([0, 360])
  expect(y.domain.get()).toEqual([0, 260])
  pointer(plot, 'pointerdown', 100, 100)
  pointer(plot, 'pointermove', 300, 100)
  pointer(plot, 'pointerup', 300, 100)
  expect(visibleHandles()).toEqual([])
})

test('box zoom ignores invalid starts, tiny drags, cancellation and stale gestures', async () => {
  const { plot, x, interaction } = await dragSetup('x')
  interaction.update({ modifier: ModifierKey.Ctrl })
  await frame()
  for (const options of [{}, { ctrlKey: true, button: 2 }, { ctrlKey: true, isPrimary: false }]) {
    expect(pointer(plot, 'pointerdown', 100, 100, options)).toBe(true)
    pointer(plot, 'pointerup', 300, 200, options)
  }
  expect(pointer(plot, 'pointerdown', 0, 0, { ctrlKey: true })).toBe(true)
  const start = () => pointer(plot, 'pointerdown', 100, 100, { ctrlKey: true })
  start()
  pointer(plot, 'pointerup', 102, 200)
  for (const type of ['pointercancel', 'lostpointercapture']) {
    start()
    pointer(plot, 'pointermove', 300, 200)
    pointer(plot, type, 300, 200)
    pointer(plot, 'pointerup', 300, 200)
  }
  start()
  interaction.update({ mode: 'y' })
  pointer(plot, 'pointerup', 300, 200)
  await frame()
  expect(x.domain.get()).toEqual([0, 360])
  interaction.update({ mode: 'x' })
  await frame()
  start()
  pointer(plot, 'pointerup', 300, 200, { pointerId: 2 })
  expect(x.domain.get()).toEqual([0, 360])
  pointer(plot, 'pointerup', 900, 200)
  await frame()
  expect(x.domain.get()).toEqual([expect.closeTo(80, 10), expect.closeTo(360, 10)])
  const clampedDomain = [...x.domain.get()]

  start()
  plot.update({ plugins: [] })
  await frame()
  expect(plot.element.querySelector('[data-zoom-selection]')).toBeNull()
  expect(plot.element.style.touchAction).toBe('')
  pointer(plot, 'pointerup', 200, 200)
  expect(x.domain.get()).toEqual(clampedDomain)
  plot.update({ plugins: [interaction] })
  await frame()
  start()
  plot.destroy()
  pointer(plot, 'pointerup', 200, 200)
  expect(x.domain.get()).toEqual(clampedDomain)
})

test('box zoom uses local projections for log, time and reversed scales, skipping bands', async () => {
  const { plot } = await dragSetup()
  const x = logScale({ domain: [1, 100], reverse: true })
  const y = timeScale({ domain: [0, 2600] })
  const categories = bandScale({ domain: ['a', 'b'] })
  plot.update({ scales: { x, y, categories }, directions: { categories: 'x' } })
  await frame()
  const expectedX = [plot.scales.x.invert(300), plot.scales.x.invert(100)]
  const selectedY = [plot.scales.y.invert(230.05), plot.scales.y.invert(80.05)]
  expect(selectedY).toEqual([expect.closeTo(499.5, 10), expect.closeTo(1999.5, 10)])
  const expectedY = selectedY.map((value) => Number(new Date(value)))
  pointer(plot, 'pointerdown', 100, 80.05)
  pointer(plot, 'pointerup', 300, 230.05)
  await frame()
  expect(x.domain.get()).toEqual(expectedX.map((value) => expect.closeTo(value, 10)))
  expect(y.options.get().explicit.domain).toEqual(
    selectedY.map((value) => expect.closeTo(value, 10)),
  )
  expect(y.domain.get()).toEqual(expectedY)
  expect(categories.domain.get()).toEqual(['a', 'b'])
})

test('shared zoom handles synchronize domains without sharing pixel ranges', async () => {
  const { plot, x, y, interaction } = await dragSetup('x')
  const host = document.createElement('div')
  document.body.append(host)
  hosts.push(host)
  const peer = createPlot(host, {
    width: 760,
    height: 300,
    margins: { top: 20, right: 20, bottom: 20, left: 20 },
    scales: { x, y },
    directions: { x: 'x', y: 'y' },
    plugins: [interaction],
  })
  plots.push(peer)
  await frame()
  const details: DomainChangeDetail[] = []
  peer.on('domainchange', (detail) => details.push(detail))
  pointer(plot, 'pointerdown', 100, 100)
  pointer(plot, 'pointerup', 300, 100)
  await frame()
  expect(x.domain.get()).toEqual([expect.closeTo(80, 10), expect.closeTo(280, 10)])
  expect(details.map(({ source }) => source)).toEqual(['zoom'])
  expect(peer.scales.x.project(80)).toBeCloseTo(20)
  expect(peer.scales.x.project(280)).toBeCloseTo(740)
  expect(plot.scales.x.project(280)).toBeCloseTo(380)
})

test.each([true, false])(
  'brush and pan keep ownership regardless of plugin order (zoom first: %s)',
  async (zoomFirst) => {
    const selection = brush({ mode: 'x' })
    const panning = pan({ mode: 'x', modifier: ModifierKey.Ctrl })
    const { plot, x, interaction } = await dragSetup('x', [selection, panning])
    if (!zoomFirst) plot.update({ plugins: [selection, panning, interaction] })
    await frame()
    const details: DomainChangeDetail[] = []
    plot.on('domainchange', (detail) => details.push(detail))
    plot.on('brush', ({ scales }) => x.domain.set(scales.x))
    pointer(plot, 'pointerdown', 100, 100, { shiftKey: true })
    pointer(plot, 'pointerup', 300, 200, { shiftKey: true })
    await frame()
    expect(x.domain.get()).toEqual([expect.closeTo(80, 10), expect.closeTo(280, 10)])
    expect(details.map(({ source }) => source)).toEqual(['brush'])
    details.length = 0
    pointer(plot, 'pointerdown', 100, 100, { ctrlKey: true })
    pointer(plot, 'pointermove', 200, 100, { ctrlKey: true })
    pointer(plot, 'pointerup', 200, 100, { ctrlKey: true })
    await frame()
    expect(details.map(({ source }) => source)).toEqual(['pan'])
  },
)

test('wheel/reset events report changed scales and release listeners on removal and destruction', async () => {
  const host = document.createElement('div')
  document.body.append(host)
  hosts.push(host)
  const x = linearScale({ domain: [0, 100] })
  const y = linearScale({ domain: [0, 100] })
  const interaction = zoom({ mode: 'auto', wheel: 'xy' })
  const plot = createPlot(host, {
    width: 400,
    height: 300,
    margins: { top: 20, right: 20, bottom: 20, left: 20 },
    directions: { x: 'x', y: 'y' },
    scales: { x, y },
    plugins: [interaction],
  })
  plots.push(plot)
  await frame()
  const details: DomainChangeDetail[] = []
  plot.on('domainchange', (detail) => details.push(detail))
  const bounds = plot.element.getBoundingClientRect()
  const position = { clientX: bounds.x + 200, clientY: bounds.y + 150 }
  const wheel = () =>
    plot.element.dispatchEvent(
      new WheelEvent('wheel', { ...position, deltaY: -100, cancelable: true, bubbles: true }),
    )
  const reset = () =>
    plot.element.dispatchEvent(
      new MouseEvent('dblclick', { ...position, button: 0, cancelable: true, bubbles: true }),
    )

  expect(wheel()).toBe(false)
  await frame()
  expect(details.map(({ scale, source }) => ({ scale, source }))).toEqual([
    { scale: 'x', source: 'wheel' },
    { scale: 'y', source: 'wheel' },
  ])
  expect(x.domain.get()[1]).toBeLessThan(100)
  expect(y.domain.get()[1]).toBeLessThan(100)
  const zoomed = { x: [...x.domain.get()], y: [...y.domain.get()] }
  for (const detail of details) {
    expect(detail.handle).toBe(detail.scale === 'x' ? x : y)
    expect(detail.previous).toEqual([0, 100])
    expect(detail.domain).toEqual(detail.scale === 'x' ? zoomed.x : zoomed.y)
    expect(detail.explicit).toBe(true)
    expect(Object.isFrozen(detail)).toBe(true)
    expect(Object.isFrozen(detail.domain)).toBe(true)
  }
  const wheelDetails = [...details]
  details.length = 0
  expect(reset()).toBe(false)
  await frame()
  expect(details.map(({ source }) => source)).toEqual(['reset', 'reset'])
  for (const detail of details) {
    expect(detail.previous).toEqual(detail.scale === 'x' ? zoomed.x : zoomed.y)
    expect(detail.domain).toEqual([0, 100])
    expect(detail.explicit).toBe(true)
  }
  expect(wheelDetails.map(({ domain }) => domain)).toEqual([zoomed.x, zoomed.y])
  expect(x.domain.get()).toEqual([0, 100])
  expect(y.domain.get()).toEqual([0, 100])
  details.length = 0
  reset()
  await frame()
  expect(details).toEqual([])

  plot.update({ plugins: [] })
  await frame()
  expect(wheel()).toBe(true)
  x.domain.set([10, 90])
  await frame()
  details.length = 0
  expect(reset()).toBe(true)
  await frame()
  expect(x.domain.get()).toEqual([10, 90])
  expect(details).toEqual([])

  plot.update({ plugins: [interaction] })
  await frame()
  expect(wheel()).toBe(false)
  await frame()
  details.length = 0
  const beforeDestroy = [...x.domain.get()]
  plot.destroy()
  expect(wheel()).toBe(true)
  expect(reset()).toBe(true)
  interaction.update({ mode: 'x', wheel: 'x' })
  await frame()
  expect(x.domain.get()).toEqual(beforeDestroy)
  expect(details).toEqual([])
})

test('runtime reset policies preserve inactive axes and restore initial autoscaling', async () => {
  const host = document.createElement('div')
  document.body.append(host)
  hosts.push(host)
  const x = linearScale({ domain: [0, 50] })
  const y = linearScale({ autoscale: 'visible' })
  const interaction = zoom({ mode: 'xy', wheel: 'xy' })
  const plot = createPlot(host, {
    width: 400,
    height: 300,
    margins: { top: 20, right: 20, bottom: 20, left: 20 },
    directions: { x: 'x', y: 'y' },
    scales: { x, y },
    marks: [line({ x: 'x', y: 'y', xValues: [0, 50, 100], yValues: [10, 20, 200] })],
    plugins: [interaction],
  })
  plots.push(plot)
  await frame()
  const initialY = [...y.domain.get()]
  const bounds = plot.element.getBoundingClientRect()
  const position = { clientX: bounds.x + 200, clientY: bounds.y + 150 }
  const reset = async () => {
    plot.element.dispatchEvent(
      new MouseEvent('dblclick', { ...position, button: 0, cancelable: true }),
    )
    await frame()
  }
  x.domain.set([10, 40])
  y.domain.set([12, 18])
  await frame()

  interaction.update({ mode: 'x', wheel: 'none', reset: 'full', modifier: ModifierKey.Ctrl })
  await reset()
  const fullX = [...x.domain.get()]
  expect(Number(fullX[1]) - Number(fullX[0])).toBeGreaterThan(50)
  expect(x.options.get().explicit.domain).toBeUndefined()
  expect(y.domain.get()).toEqual([12, 18])

  interaction.update({ reset: 'initial' })
  await reset()
  expect(x.domain.get()).toEqual([0, 50])
  expect(y.domain.get()).toEqual([12, 18])

  x.domain.set([10, 40])
  await frame()
  interaction.update({ mode: 'xy', reset: 'toggle' })
  await reset()
  expect(x.domain.get()).toEqual(fullX)
  expect(Number(y.domain.get()[1])).toBeGreaterThan(Number(initialY[1]))
  await reset()
  expect(x.domain.get()).toEqual([10, 40])
  expect(y.domain.get()).toEqual([12, 18])

  interaction.update({ reset: 'initial' })
  await reset()
  expect(x.domain.get()).toEqual([0, 50])
  expect(y.domain.get()).toEqual(initialY)
  expect(y.options.get().explicit.domain).toBeUndefined()
})

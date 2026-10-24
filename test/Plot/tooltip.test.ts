import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  createPlot,
  createTable,
  createSeries,
  crosshair,
  bandScale,
  bar,
  linearScale,
  line,
  series,
  stackedArea,
  tooltip,
  type Plot,
} from '../../src/index.js'
import { reactive } from '../../src/core/runtime.js'

const plots: Plot[] = []
const hosts: HTMLElement[] = []

async function frame() {
  await new Promise(requestAnimationFrame)
  await new Promise(requestAnimationFrame)
}

async function linkedPlot() {
  const host = document.createElement('div')
  document.body.append(host)
  hosts.push(host)
  const observed = line({
    id: 'observed',
    x: 't',
    y: 'q',
    xValues: [0, 5, 10],
    yValues: [1, 20, 3],
  })
  const forecast = line({
    id: 'forecast',
    x: 't',
    y: 'q',
    xValues: [0, 4, 10],
    yValues: [2, 30, 4],
  })
  const guide = crosshair({
    mode: 'x',
    snap: { mark: observed, axis: 'x' },
    labels: { x: 't', y: 'q' },
  })
  const interaction = tooltip({ marks: [observed, forecast], crosshair: guide })
  const scales = {
    t: linearScale({ domain: [0, 10] }),
    q: linearScale({ domain: [0, 40] }),
  }
  const baseline = reactive.getDiagnostics()
  const plot = createPlot(host, {
    width: 500,
    height: 300,
    directions: { t: 'x', q: 'y' },
    scales,
    marks: [observed, forecast],
    plugins: [interaction, guide],
  })
  plots.push(plot)
  await frame()
  vi.spyOn(plot.element, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 500, 300))
  const move = async (x: number, y: number) => {
    plot.element.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: plot.scales.t.project(x),
        clientY: plot.scales.q.project(y),
        isPrimary: true,
      }),
    )
    await frame()
  }
  const entries = () =>
    [...document.querySelectorAll('[data-tooltip-entry]')].map((row) => row.textContent)
  return { plot, guide, interaction, observed, forecast, move, entries, baseline }
}

afterEach(() => {
  for (const plot of plots.splice(0)) plot.destroy()
  for (const host of hosts.splice(0)) host.remove()
  vi.restoreAllMocks()
})

describe('tooltip plugin', () => {
  test('validates display options atomically and restores defaults', () => {
    const handle = tooltip({ showX: false, digits: 2 })
    for (const digits of [-1, 1.5, 16, NaN, Infinity]) {
      expect(() => handle.update({ digits })).toThrow('tooltip.digits')
      expect(handle.options.get().resolved.digits).toBe(2)
    }
    expect(() => tooltip({ showX: null })).toThrow('tooltip.showX')
    handle.update({ showX: undefined, digits: undefined })
    expect(handle.options.get().resolved.showX).toBe(true)
    expect(handle.options.get().resolved.digits).toBeUndefined()
  })

  test('hides x coordinates and rounds values without changing source samples', async () => {
    const { plot, interaction, guide, move, entries } = await linkedPlot()
    guide.update({ snap: undefined, labels: undefined })
    const data = createSeries({ x: [5], y: [20.12345] })
    const mark = series(data, { id: 'precise', x: 't', y: 'q' })
    interaction.update({ marks: undefined, showX: false, digits: 2 })
    plot.update({ marks: [mark] })
    await move(4.2, 20)
    expect(entries()).toEqual(['precise · 20.12'])
    expect(document.querySelector('[data-layer="tooltip"]')?.getAttribute('aria-label')).toBe(
      'precise · y: 20.12',
    )
    expect(data.yAt(0)).toBe(20.12345)
    interaction.update({ showX: true, digits: undefined })
    await frame()
    expect(entries()).toEqual(['precise · x: 5 · 20.12345'])
  })

  test('shows nearest x samples as text and removes its DOM on destroy', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    hosts.push(host)
    const observed = line({
      id: 'observed',
      x: 't',
      y: 'q',
      xValues: [0, 5, 10],
      yValues: [1, 20, 3],
      stroke: '#1677a6',
      markers: { fill: '#1677a6' },
    })

    const forecast = line({
      id: 'forecast',
      x: 't',
      y: 'q',
      xValues: [0, 4, 10],
      yValues: [2, 30, 4],
      stroke: '#d55e00',
      markers: { fill: '#d55e00' },
    })
    const interaction = tooltip({ marks: [observed, forecast] })
    const plot = createPlot(host, {
      width: 500,
      height: 300,
      directions: { t: 'x', q: 'y' },
      scales: { t: linearScale({ domain: [0, 10] }), q: linearScale({ domain: [0, 40] }) },
      marks: [observed, forecast],
      plugins: [interaction],
    })
    plots.push(plot)
    await frame()
    vi.spyOn(plot.element, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 500, 300))
    plot.element.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: plot.scales.t.project(5),
        clientY: plot.scales.q.project(20),
        isPrimary: true,
      }),
    )
    await frame()

    const node = document.querySelector<HTMLDivElement>('[data-layer="tooltip"]')
    expect(node?.textContent).toContain('observed')
    expect(node?.textContent).toContain('y: 20')
    expect(node?.textContent).toContain('forecast')
    const entries = node?.querySelectorAll<HTMLElement>('[data-tooltip-entry]')
    expect(entries).toHaveLength(2)
    expect(entries?.[0].querySelector('[data-tooltip-symbol]')).toBeTruthy()
    expect(entries?.[0].querySelector<HTMLElement>('[data-tooltip-label]')?.style.color).toBe(
      'rgb(22, 119, 166)',
    )
    expect(entries?.[1].querySelector<HTMLElement>('[data-tooltip-label]')?.style.color).toBe(
      'rgb(213, 94, 0)',
    )
    expect(node?.getAttribute('aria-hidden')).toBe('false')
    expect(node?.style.visibility).toBe('visible')
    expect(plot.element.getAttribute('aria-describedby')).toBe(node?.id)

    plot.update({ plugins: [] })
    await frame()
    expect(document.querySelector('[data-layer="tooltip"]')).toBeNull()
    expect(plot.element.hasAttribute('aria-describedby')).toBe(false)
  })

  test('reports raw bar values and stack bounds for rectangle hits', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    hosts.push(host)
    const data = createTable({ t: ['one'], observed: [3.12345], forecast: [4.23456] })
    const mark = bar(data, {
      id: 'flow',
      x: 't',
      scales: { x: 't', y: 'q' },
      layers: [
        { id: 'observed', y: 'observed', label: 'Observed', stack: 'total' },
        { id: 'forecast', y: 'forecast', label: 'Forecast', stack: 'total' },
      ],
      layout: 'stacked',
    })
    const interaction = tooltip({ axis: 'xy', marks: [mark] })
    const plot = createPlot(host, {
      width: 100,
      height: 100,
      margins: { top: 0, right: 0, bottom: 0, left: 0 },
      scales: { t: bandScale({ domain: ['one'] }), q: linearScale({ domain: [0, 7] }) },
      marks: [mark],
      plugins: [interaction],
    })
    plots.push(plot)
    await frame()
    vi.spyOn(plot.element, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 100, 100))
    const rectangle = plot.element.querySelector<SVGRectElement>('[data-layer-id="forecast"]')!
    plot.element.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: Number(rectangle.getAttribute('x')) + Number(rectangle.getAttribute('width')) / 2,
        clientY: Number(rectangle.getAttribute('y')) + Number(rectangle.getAttribute('height')) / 2,
        isPrimary: true,
      }),
    )
    await frame()

    const node = document.querySelector<HTMLDivElement>('[data-layer="tooltip"]')!
    expect(node.textContent).toContain('Forecast')
    expect(node.textContent).toContain(' · 4.23456 · ')
    expect(node.textContent).not.toContain('value:')
    expect(node.textContent).toContain('stack: total')
    expect(node.textContent).toContain('bounds: 3.12345–7.35801')

    interaction.update({ showX: false, digits: 2 })
    await frame()
    expect(node.textContent).toBe('flow · Forecast · 4.23 · stack: total · bounds: 3.12–7.36')
    expect(node.getAttribute('aria-label')).toBe(
      'flow · Forecast · 4.23 · stack: total · bounds: 3.12–7.36',
    )
    expect(data.valueAt('forecast', 0)).toBe(4.23456)
    interaction.update({ showX: undefined, digits: undefined })
    await frame()
    expect(node.textContent).toContain('x: one')
    expect(node.textContent).toContain(' · 4.23456 · ')
    expect(node.textContent).not.toContain('y:')

    interaction.update({ axis: 'x' })
    plot.element.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: plot.scales.t.project('one'),
        clientY: 50,
        isPrimary: true,
      }),
    )
    await frame()
    expect(
      [...node.querySelectorAll('[data-tooltip-entry]')].map((row) => row.textContent),
    ).toEqual([expect.stringContaining('Observed'), expect.stringContaining('Forecast')])
  })

  test('uses filled stacked-area geometry and reports the raw layer value', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    hosts.push(host)
    const mark = stackedArea(createTable({ t: [0, 1], observed: [2, 2], forecast: [3, 3] }), {
      id: 'flow',
      x: 't',
      scales: { x: 't', y: 'q' },
      layers: [
        { id: 'observed', y: 'observed', label: 'Observed', stack: 'total' },
        { id: 'forecast', y: 'forecast', label: 'Forecast', stack: 'total' },
      ],
    })
    const interaction = tooltip({ axis: 'xy', marks: [mark] })
    const plot = createPlot(host, {
      width: 100,
      height: 100,
      margins: { top: 0, right: 0, bottom: 0, left: 0 },
      scales: { t: linearScale({ domain: [0, 1] }), q: linearScale({ domain: [0, 10] }) },
      marks: [mark],
      plugins: [interaction],
    })
    plots.push(plot)
    await frame()
    vi.spyOn(plot.element, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 100, 100))
    plot.element.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: plot.scales.t.project(0.5),
        clientY: plot.scales.q.project(4),
        isPrimary: true,
      }),
    )
    await frame()

    const node = document.querySelector<HTMLDivElement>('[data-layer="tooltip"]')!
    expect(node.textContent).toContain('Forecast')
    expect(node.textContent).toContain(' · 3 · ')
    expect(node.textContent).not.toContain('value:')
    expect(node.textContent).toContain('stack: total')
    expect(node.textContent).toContain('bounds: 2–5')
    interaction.update({ showX: false, digits: 0 })
    await frame()
    expect(node.textContent).toBe('flow · Forecast · 3 · stack: total · bounds: 2–5')
    expect(node.getAttribute('aria-label')).toBe('flow · Forecast · 3 · stack: total · bounds: 2–5')
  })

  test('limits xy mode to the closest actual sample and hides outside the plot', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    hosts.push(host)
    const sample = line({
      x: 't',
      y: 'q',
      xValues: [0, 10],
      yValues: [0, 10],
    })
    const interaction = tooltip({ axis: 'xy', marks: [sample] })
    const plot = createPlot(host, {
      width: 500,
      height: 300,
      directions: { t: 'x', q: 'y' },
      scales: { t: linearScale({ domain: [0, 10] }), q: linearScale({ domain: [0, 10] }) },
      marks: [sample],
      plugins: [interaction],
    })
    plots.push(plot)
    await frame()
    vi.spyOn(plot.element, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 500, 300))
    plot.element.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: plot.scales.t.project(1),
        clientY: plot.scales.q.project(1),
        isPrimary: true,
      }),
    )
    await frame()
    const node = document.querySelector<HTMLDivElement>('[data-layer="tooltip"]')!
    expect(node.textContent).toContain('x: 0')
    expect(node.textContent).toContain('y: 0')

    plot.element.dispatchEvent(new PointerEvent('pointerleave', { isPrimary: true }))
    await frame()
    expect(node.style.visibility).toBe('hidden')
  })

  test.each(['x', 'y', 'xy'] as const)(
    'only omits matching callout coordinates in %s mode',
    async (mode) => {
      const { plot, guide, move, entries } = await linkedPlot()
      guide.update({ mode })
      await move(5, 20)
      expect(entries()[0]).toBe(
        mode === 'x' ? 'observed · 20' : mode === 'y' ? 'observed · x: 5' : 'observed',
      )
      expect(entries()[1]).toBe('forecast · x: 4 · 30')
      expect(
        document.querySelector('[data-layer="tooltip"]')?.getAttribute('aria-label'),
      ).toContain('observed · 5 · y: 20')
      const labels = [...plot.element.querySelectorAll('[data-crosshair-label]')]
      expect(labels.map((node) => node.getAttribute('data-crosshair-label'))).toEqual(
        mode === 'xy' ? ['x', 'y'] : [mode],
      )
      expect(plot.element.querySelector('[data-crosshair-label="x"]')?.textContent).toBe(
        mode.includes('x') ? '5' : undefined,
      )
      expect(plot.element.querySelector('[data-crosshair-label="y"]')?.textContent).toBe(
        mode.includes('y') ? '20' : undefined,
      )
    },
  )

  test('reacts to snapping and mode changes without moving the pointer', async () => {
    const { plot, guide, observed, move, entries } = await linkedPlot()
    await move(4, 30)
    guide.update({ mode: 'xy', snap: { mark: observed, axis: 'xy' } })
    await frame()
    expect(entries()).toEqual(['observed'])
    expect(plot.element.querySelector('[data-crosshair-axis="x"]')?.getAttribute('x1')).toBe(
      String(plot.scales.t.project(5) - plot.regions.get().plot.x),
    )
    guide.update({ mode: 'y', snap: { mark: observed, axis: 'y' } })
    await frame()
    expect(entries()).toEqual(['observed · x: 5', 'forecast · x: 4 · 30'])
    guide.update({ labels: undefined })
    await frame()
    expect(entries()).toEqual(['observed · x: 5 · 20', 'forecast · x: 4 · 30'])
    expect(plot.element.querySelector('[data-crosshair-label]')).toBeNull()
  })

  test('free pointer coordinates do not replace different sample values', async () => {
    const { guide, move, entries } = await linkedPlot()
    guide.update({ mode: 'xy', snap: undefined })
    await move(6, 25)
    expect(entries()).toEqual(['observed · x: 5 · 20', 'forecast · x: 4 · 30'])
  })

  test('retains coordinates when the callout belongs to a different scale', async () => {
    const { plot, guide, move, entries } = await linkedPlot()
    plot.update({
      scales: {
        ...plot.options.get().resolved.scales,
        other: linearScale({ domain: [0, 10] }),
      },
      directions: { t: 'x', q: 'y', other: 'x' },
    })
    guide.update({ labels: { x: 'other' } })
    await move(5, 20)
    expect(entries()[0]).toBe('observed · x: 5 · 20')
  })

  test('restores standalone content and cleans up linked overlays', async () => {
    const { plot, guide, interaction, move, entries, baseline } = await linkedPlot()
    await move(5, 20)
    expect(() => plot.update({ plugins: [interaction] })).toThrow(
      'tooltip.crosshair must be included',
    )
    interaction.update({ crosshair: undefined })
    plot.update({ plugins: [interaction] })
    await frame()
    expect(entries()[0]).toBe('observed · x: 5 · y: 20')
    expect(plot.element.querySelector('[data-layer="crosshair"]')).toBeNull()
    plot.update({ plugins: [guide, interaction] })
    interaction.update({ crosshair: guide })
    await frame()
    expect(entries()[0]).toBe('observed · 20')
    plot.element.dispatchEvent(new PointerEvent('pointerleave', { isPrimary: true }))
    await frame()
    expect(document.querySelector<HTMLElement>('[data-layer="tooltip"]')?.style.visibility).toBe(
      'hidden',
    )
    expect(plot.element.querySelector('[data-layer="crosshair"]')?.getAttribute('display')).toBe(
      'none',
    )
    plot.destroy()
    expect(document.querySelector('[data-layer="tooltip"]')).toBeNull()
    expect(plot.element.querySelector('[data-layer="crosshair"]')).toBeNull()
    expect(reactive.getDiagnostics().activeComputeds).toBe(baseline.activeComputeds)
  })

  test('updates shared inspection for live data, hidden series and empty targets', async () => {
    const { plot, guide, interaction, move, entries } = await linkedPlot()
    const data = createSeries({ x: [5], y: [20] })
    const live = series(data, { id: 'live', x: 't', y: 'q', line: { digits: 3 } })
    interaction.update({ marks: undefined })
    guide.update({ snap: undefined })
    plot.update({ marks: [live] })
    guide.update({ mode: 'xy', snap: { mark: live, axis: 'x' } })
    await move(5, 20)
    expect(entries()).toEqual(['live'])
    data.replace({ x: [6], y: [21.123] })
    await frame()
    expect(plot.element.querySelector('[data-crosshair-label="x"]')?.textContent).toBe('6')
    expect(plot.element.querySelector('[data-crosshair-label="y"]')?.textContent).toBe('21.123')
    live.update({ visible: false })
    await frame()
    expect(entries()).toEqual([])
    expect(plot.element.querySelector('[data-layer="crosshair"]')?.getAttribute('display')).toBe(
      'none',
    )
    live.update({ visible: true })
    await frame()
    expect(entries()).toEqual(['live'])
    data.clear()
    await frame()
    expect(entries()).toEqual([])
    expect(plot.element.querySelector('[data-crosshair-label]')).toBeNull()
  })

  test('validates callout scales and linked handle updates atomically', async () => {
    const { plot, guide, interaction, move, entries } = await linkedPlot()
    expect(() => guide.update({ labels: { x: 'q' } })).toThrow('x-direction scale')
    expect(() => guide.update({ labels: { y: 'missing' } })).toThrow('y-direction scale')
    expect(() => interaction.update({ crosshair: crosshair() })).toThrow(
      'tooltip.crosshair must be included',
    )
    await move(5, 20)
    expect(entries()[0]).toBe('observed · 20')
    expect(() => plot.update({ directions: { t: 'y', q: 'y' } })).toThrow()
  })
})

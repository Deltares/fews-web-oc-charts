import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  axis,
  createPlot,
  crossSectionSelect,
  linearScale,
  line,
  ModifierKey,
  pan,
  brush,
  type Plot,
} from '../../src/index.js'

const plots: Plot[] = []
const hosts: HTMLElement[] = []

async function frame() {
  await new Promise(requestAnimationFrame)
  await new Promise(requestAnimationFrame)
}

async function setup(
  interaction = crossSectionSelect(5, undefined, { x: 't' }),
  config: Parameters<typeof createPlot>[1] = {},
  host = document.createElement('div'),
) {
  document.body.append(host)
  hosts.push(host)
  const first = line({
    id: 'first',
    x: 't',
    y: 'q',
    xValues: [0, 5, 10],
    yValues: [2, 20, 4],
    stroke: '#1677a6',
  })
  const second = line({
    id: 'second',
    x: 't',
    y: 'q',
    xValues: [0, 4, 10],
    yValues: [8, 30, 6],
    stroke: '#d55e00',
  })
  const plot = createPlot(host, {
    width: 500,
    height: 300,
    scales: { t: linearScale({ domain: [0, 10] }), q: linearScale({ domain: [0, 40] }) },
    axes: [axis('t', { position: 'bottom' }), axis('q', { position: 'left' })],
    marks: [first, second],
    plugins: [interaction],
    ...config,
  })
  plots.push(plot)
  await frame()
  vi.spyOn(plot.element, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 500, 300))
  return { plot, interaction, first, second }
}

function pointer(plot: Plot, type: string, x: number, target: Element) {
  target.dispatchEvent(
    new PointerEvent(type, {
      clientX: x,
      clientY: 280,
      pointerId: 1,
      button: 0,
      isPrimary: true,
      bubbles: true,
      cancelable: true,
    }),
  )
}

afterEach(() => {
  for (const plot of plots.splice(0)) plot.destroy()
  for (const host of hosts.splice(0)) host.remove()
  vi.restoreAllMocks()
})

describe('cross-section select plugin', () => {
  test('themes cross-section labels and callouts without changing series colors', async () => {
    const host = document.createElement('div')
    const { plot } = await setup(undefined, { theme: 'dark', themeElement: host }, host)
    const check = (background: string, color: string) => {
      const callout = plot.element.querySelector('[data-cross-section-callout]')!
      expect(getComputedStyle(callout.querySelector('rect')!).fill).toBe(background)
      expect(getComputedStyle(callout.querySelector('text')!).fill).toBe(color)
      const labels = [...plot.element.querySelectorAll('[data-cross-section-entry]')]
      expect(labels).toHaveLength(2)
      for (const label of labels) {
        expect(getComputedStyle(label.querySelector('rect')!).fill).toBe(background)
      }
      expect(labels.map((label) => getComputedStyle(label.querySelector('text')!).fill)).toEqual([
        'rgb(22, 119, 166)',
        'rgb(213, 94, 0)',
      ])
    }
    check('rgb(0, 0, 0)', 'rgb(237, 242, 244)')
    plot.update({ theme: 'light' })
    await frame()
    check('rgb(255, 255, 255)', 'rgb(34, 34, 34)')
    plot.update({ theme: 'dark' })
    await frame()
    check('rgb(0, 0, 0)', 'rgb(237, 242, 244)')
    host.style.setProperty('--fews-chart-tooltip-background', '#123456')
    host.style.setProperty('--fews-chart-tooltip-color', '#fedcba')
    await vi.waitFor(() => expect(plot.theme.get().tooltipBackground).toBe('#123456'))
    await frame()
    check('rgb(18, 52, 86)', 'rgb(254, 220, 186)')
  })

  test('remeasures callouts and sample labels for initial and live theme fonts', async () => {
    const host = document.createElement('div')
    host.style.setProperty('--fews-chart-font-family', 'monospace')
    host.style.setProperty('--fews-chart-font-size', '24px')
    const { plot } = await setup(undefined, { themeElement: host }, host)
    const check = (fontSize: number, fontFamily: string) => {
      const groups = [
        plot.element.querySelector('[data-cross-section-callout]')!,
        ...plot.element.querySelectorAll('[data-cross-section-entry]'),
      ]
      expect(groups).toHaveLength(3)
      for (const [index, group] of groups.entries()) {
        const text = group.querySelector('text')!
        const box = group.querySelector('rect')!.getBBox()
        const content = text.getBBox()
        const padding = index === 0 ? 12 : fontSize + 8
        expect(getComputedStyle(text).fontFamily).toBe(fontFamily)
        expect(getComputedStyle(text).fontSize).toBe(`${fontSize}px`)
        expect(box.width).toBeCloseTo(text.getComputedTextLength() + padding)
        expect(box.height).toBe(fontSize + (index === 0 ? 10 : 8))
        expect(content.y).toBeGreaterThanOrEqual(box.y)
        expect(content.y + content.height).toBeLessThanOrEqual(box.y + box.height)
        const bounds = group.getBoundingClientRect()
        expect(bounds.top).toBeGreaterThanOrEqual(0)
        expect(bounds.bottom).toBeLessThanOrEqual(plot.size.get().height)
      }
    }
    check(24, 'monospace')
    host.style.setProperty('--fews-chart-font-size', '36px')
    await vi.waitFor(() => expect(plot.theme.get().fontSize).toBe(36))
    await frame()
    check(36, 'monospace')
    host.style.setProperty('--fews-chart-font-family', 'serif')
    await vi.waitFor(() => expect(plot.theme.get().fontFamily).toBe('serif'))
    await frame()
    check(36, 'serif')
  })

  test('renders a guide and sample values from each selected line', async () => {
    const { plot, interaction } = await setup()
    expect(plot.element.querySelector('[data-cross-section-line]')?.getAttribute('x1')).toBe(
      String(plot.scales.t.project(5)),
    )
    expect(interaction.currentData.get().map(({ id, data }) => [id, data])).toEqual([
      ['first', { x: 5, y: 20 }],
      ['second', { x: 10, y: 6 }],
    ])
    expect(
      [...plot.element.querySelectorAll('[data-cross-section-label]')].map(
        (node) => node.textContent,
      ),
    ).toEqual(['20.0', '6.0'])
    const labelTops = [...plot.element.querySelectorAll('[data-cross-section-entry]')].map(
      (node) => node.getBoundingClientRect().top,
    )
    expect(labelTops[0]).toBeLessThan(labelTops[1])
    expect(plot.element.querySelectorAll('[data-cross-section-stem]')).toHaveLength(2)
    const layer = plot.element.querySelector('[data-layer="cross-section-select"]')!
    const order = [...layer.children].map((child) => [...child.attributes].map((a) => a.name))
    expect(order.findIndex((names) => names.includes('data-cross-section-points'))).toBeGreaterThan(
      order.findIndex((names) => names.includes('data-cross-section-labels')),
    )

    interaction.update({ marks: [interaction.currentData.get()[0].mark] })
    await frame()
    expect(interaction.currentData.get()).toHaveLength(1)
    expect(plot.element.querySelectorAll('[data-cross-section-point]')).toHaveLength(1)
  })

  test('clamps a drag to the selected scale domain and calls back on release only', async () => {
    const changed = vi.fn()
    const interaction = crossSectionSelect(5, changed, { x: 't', draggable: true })
    const { plot } = await setup(interaction)
    const handle = plot.element.querySelector('[data-cross-section-handle]')!
    const startX = plot.scales.t.project(5)
    pointer(plot, 'pointerdown', startX, handle)
    pointer(plot, 'pointermove', plot.scales.t.project(8), plot.element)
    expect(interaction.value.get()).toBeCloseTo(8)
    expect(changed).not.toHaveBeenCalled()
    pointer(plot, 'pointerup', plot.scales.t.project(8), plot.element)
    expect(changed).toHaveBeenCalledWith(expect.closeTo(8))

    pointer(plot, 'pointerdown', plot.scales.t.project(8), handle)
    pointer(plot, 'pointermove', 900, plot.element)
    pointer(plot, 'pointerup', 900, plot.element)
    expect(interaction.value.get()).toBe(10)
  })

  test('drags from the guide line and from the handle below the plot area', async () => {
    const interaction = crossSectionSelect(5, undefined, { x: 't', draggable: true })
    const { plot } = await setup(interaction)
    const hitLine = plot.element.querySelector('[data-cross-section-hitline]')!
    expect(hitLine.getAttribute('pointer-events')).toBe('stroke')
    pointer(plot, 'pointerdown', plot.scales.t.project(5), hitLine)
    pointer(plot, 'pointermove', plot.scales.t.project(7), plot.element)
    pointer(plot, 'pointerup', plot.scales.t.project(7), plot.element)
    expect(interaction.value.get()).toBeCloseTo(7)

    const callout = plot.element.querySelector('[data-cross-section-hitbox]')!
    expect(callout.getAttribute('pointer-events')).toBe('all')
    callout.dispatchEvent(
      new PointerEvent('pointerdown', {
        clientX: plot.scales.t.project(7),
        clientY: 299,
        pointerId: 1,
        button: 0,
        isPrimary: true,
        bubbles: true,
        cancelable: true,
      }),
    )
    pointer(plot, 'pointermove', plot.scales.t.project(3), plot.element)
    pointer(plot, 'pointerup', plot.scales.t.project(3), plot.element)
    expect(interaction.value.get()).toBeCloseTo(3)

    interaction.update({ draggable: false })
    await frame()
    expect(hitLine.getAttribute('pointer-events')).toBe('none')
  })

  test('keeps labels of many lines clear of each other and of highlighted points', async () => {
    const marks = Array.from({ length: 6 }, (_, k) =>
      line({
        id: `line-${k}`,
        x: 't',
        y: 'q',
        xValues: [0, 5, 10],
        yValues: [10, 20 + k * 0.8, 10],
      }),
    )
    const interaction = crossSectionSelect(5, undefined, { x: 't' })
    const { plot } = await setup(interaction, { marks })
    const labels = [...plot.element.querySelectorAll('[data-cross-section-entry] rect')].map(
      (node) => node.getBoundingClientRect(),
    )
    const points = [...plot.element.querySelectorAll('[data-cross-section-point]')].map((node) =>
      node.getBoundingClientRect(),
    )
    expect(labels).toHaveLength(6)
    const overlaps = (a: DOMRect, b: DOMRect) =>
      a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
    for (const [index, label] of labels.entries()) {
      for (const other of labels.slice(index + 1)) expect(overlaps(label, other)).toBe(false)
      for (const point of points) expect(overlaps(label, point)).toBe(false)
    }
  })

  test('does not let selector dragging start pan or brush gestures', async () => {
    const interaction = crossSectionSelect(5, undefined, { x: 't', draggable: true })
    const brushSelection = brush({ mode: 'x', modifier: ModifierKey.None })
    const { plot } = await setup(interaction, {
      plugins: [pan({ mode: 'x' }), brushSelection, interaction],
    })
    const handle = plot.element.querySelector('[data-cross-section-handle]')!
    const initialDomain = plot.options.get().resolved.scales.t.domain.get()
    const x = plot.scales.t.project(5)
    pointer(plot, 'pointerdown', x, handle)
    pointer(plot, 'pointermove', plot.scales.t.project(8), plot.element)
    pointer(plot, 'pointerup', plot.scales.t.project(8), plot.element)

    expect(plot.options.get().resolved.scales.t.domain.get()).toBe(initialDomain)
    expect(brushSelection.selection.get()).toBeUndefined()
    expect(interaction.value.get()).toBeCloseTo(8)
  })

  test('supports explicit value changes, hides out-of-domain values and cleans up', async () => {
    const { plot, interaction } = await setup()
    interaction.setValue(20)
    await frame()
    expect(
      plot.element.querySelector('[data-layer="cross-section-select"]')?.getAttribute('display'),
    ).toBe('none')
    expect(interaction.currentData.get()).toEqual([])
    interaction.setValue(0)
    await frame()
    expect(
      plot.element.querySelector('[data-layer="cross-section-select"]')?.getAttribute('display'),
    ).toBeNull()

    plot.update({ plugins: [] })
    await frame()
    expect(plot.element.querySelector('[data-layer="cross-section-select"]')).toBeNull()
  })

  test('rejects invalid options and incompatible plot targets atomically', async () => {
    const interaction = crossSectionSelect(5, undefined, { x: 't' })
    const { plot, first } = await setup(interaction)
    expect(() => interaction.setValue(Number.NaN)).toThrow('finite number')
    expect(() => interaction.update({ x: 'missing' })).toThrow('continuous x-direction scale')
    expect(() =>
      interaction.update({ marks: [line({ x: 't', y: 'q', xValues: [], yValues: [] })] }),
    ).toThrow('included in plot.marks')
    expect(interaction.value.get()).toBe(5)
    expect(interaction.options.get().resolved.x).toBe('t')
    expect(() => interaction.update({ marks: [first] })).not.toThrow()
  })
})

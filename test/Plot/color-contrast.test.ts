import { afterEach, describe, expect, test, vi } from 'vitest'
import { rgb } from 'd3-color'
import {
  arrows,
  band,
  colorScale,
  createGrid,
  createPlot,
  createPolarPlot,
  angularScale,
  radialScale,
  crossSectionSelect,
  direction,
  heatmap,
  highlight,
  legendSymbolPrimitives,
  line,
  linearScale,
  progress,
  rule,
  text,
  tooltip,
  type Plot,
} from '../../src/index.js'
import { resolveMarkColor, tooltipColorTheme } from '../../src/theme/color-contrast.js'

const plots: Plot[] = []
const hosts: HTMLElement[] = []

function host() {
  const element = document.createElement('div')
  document.body.append(element)
  hosts.push(element)
  return element
}

async function frame() {
  await new Promise(requestAnimationFrame)
  await new Promise(requestAnimationFrame)
}

afterEach(() => {
  for (const plot of plots.splice(0)) plot.destroy()
  for (const element of hosts.splice(0)) element.remove()
  vi.restoreAllMocks()
})

describe('contrast-aware plot colors', () => {
  test('updates marks, swatches, highlights and portalled labels from original colors', async () => {
    const mark = line({
      id: 'observed',
      label: 'Observed',
      x: 't',
      y: 'q',
      xValues: [0, 5, 10],
      yValues: [1, 20, 3],
      stroke: '#111',
      markers: { fill: '#222', stroke: '#333', strokeWidth: 1 },
    })
    const plot = createPlot(host(), {
      width: 500,
      height: 300,
      theme: 'dark',
      colorContrast: 'auto',
      scales: { t: linearScale({ domain: [0, 10] }), q: linearScale({ domain: [0, 40] }) },
      directions: { t: 'x', q: 'y' },
      marks: [mark],
      plugins: [tooltip(), highlight(), crossSectionSelect(5, undefined, { x: 't' })],
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
    const path = plot.element.querySelector('[data-mark="line"]')!
    const geometry = path.getAttribute('d')
    const check = () => {
      const theme = plot.theme.get()
      const stroke = resolveMarkColor('#111', theme)
      const label = resolveMarkColor('#111', theme, 'text', theme.tooltipBackground)
      expect(path.getAttribute('stroke')).toBe(stroke)
      expect(path.getAttribute('d')).toBe(geometry)
      const symbol = legendSymbolPrimitives(plot.legend.entries.get()[0].symbol)
      expect(symbol[0].attributes.stroke).toBe(stroke)
      expect(plot.element.querySelector('[data-highlight="line"]')?.getAttribute('fill')).toBe(
        stroke,
      )
      expect(plot.element.querySelector('[data-cross-section-point]')?.getAttribute('fill')).toBe(
        resolveMarkColor('#222', theme),
      )
      expect(plot.element.querySelector('[data-cross-section-label]')?.getAttribute('fill')).toBe(
        label,
      )
      const node = document.querySelector('[data-layer="tooltip"]')!
      expect(node.parentElement).toBe(document.body)
      expect(getComputedStyle(node.querySelector('[data-tooltip-label]')!).color).toBe(
        rgb(label).formatRgb(),
      )
      expect(node.querySelector('[data-tooltip-symbol] line')?.getAttribute('stroke')).toBe(
        resolveMarkColor('#111', tooltipColorTheme(theme)),
      )
      expect(mark.stroke).toBe('#111')
      expect(mark.markers?.fill).toBe('#222')
    }
    check()
    plot.update({ theme: 'light' })
    await frame()
    check()
    plot.update({ theme: 'dark', colorContrast: 'none' })
    await frame()
    check()
    expect(path.getAttribute('stroke')).toBe('#111')
    plot.update({ colorContrast: 'auto' })
    await frame()
    check()
    expect(path.getAttribute('stroke')).not.toBe('#111')
    plot.update({ colorContrast: undefined })
    await frame()
    expect(path.getAttribute('stroke')).toBe('#111')
    expect(() =>
      // @ts-expect-error Invalid runtime input must be rejected atomically.
      plot.update({ colorContrast: 'invalid' }),
    ).toThrow('plot.colorContrast')
    expect(plot.options.get().resolved.colorContrast).toBe('none')
  })

  test('resolves CSS paints against the host, including modern colors and live overrides', async () => {
    const element = host()
    element.style.setProperty('--series-color', '#111')
    const mark = line({
      x: 't',
      y: 'q',
      xValues: [0, 1],
      yValues: [1, 2],
      stroke: 'var(--series-color)',
    })
    const plot = createPlot(element, {
      width: 300,
      height: 200,
      theme: 'dark',
      themeElement: element,
      colorContrast: 'auto',
      scales: { t: linearScale(), q: linearScale() },
      directions: { t: 'x', q: 'y' },
      marks: [mark],
    })
    plots.push(plot)
    await frame()
    const path = plot.element.querySelector('[data-mark="line"]')!
    expect(path.getAttribute('stroke')).toBe(resolveMarkColor('#111', plot.theme.get()))
    element.style.setProperty('--series-color', 'oklch(25% 0.08 240)')
    await vi.waitFor(() =>
      expect(path.getAttribute('stroke')).toBe(
        resolveMarkColor('oklch(25% 0.08 240)', plot.theme.get()),
      ),
    )
    element.style.setProperty('--fews-chart-background', '#fafafa')
    await vi.waitFor(() => expect(plot.theme.get().background).toBe('#fafafa'))
    await frame()
    expect(path.getAttribute('stroke')).toBe(
      resolveMarkColor('oklch(25% 0.08 240)', plot.theme.get()),
    )
  })

  test('adjusts annotation and vector styles and their legend symbols', async () => {
    const coordinates = { x: 't', y: 'q', xValues: [0, 1], yValues: [1, 2] }
    const plot = createPlot(host(), {
      width: 300,
      height: 200,
      theme: 'dark',
      colorContrast: 'auto',
      scales: { t: linearScale(), q: linearScale() },
      directions: { t: 'x', q: 'y' },
      marks: [
        rule({ id: 'rule', label: 'Rule', scale: 'q', value: 1, stroke: '#111' }),
        text({ ...coordinates, id: 'text', label: 'Text', textValues: ['a', 'b'], fill: '#111' }),
        band({
          id: 'band',
          label: 'Band',
          x: 't',
          y: 'q',
          xValues: [[0, 1]],
          yValues: [[1, 2]],
          fill: '#111',
        }),
        arrows({
          ...coordinates,
          id: 'arrows',
          label: 'Arrows',
          xEndValues: [1, 2],
          yEndValues: [2, 3],
          color: '#111',
        }),
        direction({
          ...coordinates,
          id: 'direction',
          label: 'Direction',
          directionValues: [0, 90],
          color: '#111',
        }),
      ],
    })
    plots.push(plot)
    await frame()
    const adjusted = resolveMarkColor('#111', plot.theme.get())
    expect(plot.element.querySelector('[data-mark="rule"]')?.getAttribute('stroke')).toBe(adjusted)
    expect(plot.element.querySelector('[data-mark="band"]')?.getAttribute('fill')).toBe(adjusted)
    expect(plot.element.querySelector('[data-mark="text-label"]')?.getAttribute('fill')).toBe(
      resolveMarkColor('#111', plot.theme.get(), 'text'),
    )
    for (const kind of ['arrows', 'direction']) {
      expect(plot.element.querySelector(`[data-mark="${kind}"] path`)?.getAttribute('fill')).toBe(
        adjusted,
      )
    }
    expect(plot.legend.entries.get()).toHaveLength(5)
    for (const entry of plot.legend.entries.get()) {
      const symbol = legendSymbolPrimitives(entry.symbol)
      expect(
        symbol.some(({ attributes }) =>
          Object.values(attributes).includes(
            entry.markId === 'text' ? resolveMarkColor('#111', plot.theme.get(), 'text') : adjusted,
          ),
        ),
      ).toBe(true)
    }
  })

  test('adjusts polar progress fills while retaining opacity', async () => {
    const plot = createPolarPlot(host(), {
      width: 300,
      height: 200,
      theme: 'dark',
      colorContrast: 'auto',
      scales: { angle: angularScale(), radius: radialScale() },
      marks: [
        progress({
          id: 'progress',
          x: 'angle',
          y: 'radius',
          xValues: [[0, 90]],
          yValues: [1],
          fill: '#111',
          opacity: 0.3,
        }),
      ],
    })
    plots.push(plot)
    await frame()
    const group = plot.element.querySelector('[data-mark="progress"]')!
    expect(group.getAttribute('fill')).toBe(resolveMarkColor('#111', plot.theme.get()))
    expect(group.getAttribute('fill-opacity')).toBe('0.3')
  })

  test.each(['svg', 'canvas'] as const)(
    'leaves %s heatmap mappings and swatches unchanged',
    async (renderer) => {
      const color = colorScale({ domain: [0, 1], colors: ['#111', '#222'] })
      const mark = heatmap(createGrid({ xEdges: [0, 1], yEdges: [0, 1], values: [0] }), {
        id: 'heatmap',
        label: 'Heatmap',
        scales: { x: 't', y: 'q' },
        color,
        renderer,
      })
      const plot = createPlot(host(), {
        width: 100,
        height: 100,
        margins: { top: 0, right: 0, bottom: 0, left: 0 },
        theme: 'dark',
        colorContrast: 'auto',
        scales: { t: linearScale({ domain: [0, 1] }), q: linearScale({ domain: [0, 1] }) },
        directions: { t: 'x', q: 'y' },
        marks: [mark],
      })
      plots.push(plot)
      await frame()
      if (renderer === 'svg') {
        expect(plot.element.querySelector('[data-mark="heatmap-cell"]')?.getAttribute('fill')).toBe(
          color.map(0),
        )
      } else {
        const canvas = plot.element.querySelector('canvas')!
        const pixel = canvas.getContext('2d')!.getImageData(10, 10, 1, 1).data
        expect([...pixel]).toEqual([17, 17, 17, 255])
      }
      expect(legendSymbolPrimitives(plot.legend.entries.get()[0].symbol)[0].attributes.fill).toBe(
        color.map(0.5),
      )
    },
  )
})

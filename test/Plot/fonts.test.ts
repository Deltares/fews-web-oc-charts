import { afterEach, describe, expect, test, vi } from 'vite-plus/test'
import {
  axis,
  createPlot,
  createSeries,
  currentTime,
  legend,
  linearScale,
  series,
  sharedClock,
  timeScale,
  type Plot,
} from '../../src/index.js'
import { resolveTheme } from '../../src/theme/theme.js'
import { createTextMeasurer } from '../../src/layout/layout.js'

const start = Date.UTC(2026, 0, 1)
const hour = 3_600_000
const plots: Plot[] = []
const hosts: HTMLElement[] = []

async function frame() {
  await new Promise(requestAnimationFrame)
  await new Promise(requestAnimationFrame)
}

function host(tokens: Record<string, string> = {}) {
  const element = document.createElement('div')
  element.style.width = '500px'
  element.style.height = '300px'
  for (const [name, value] of Object.entries(tokens)) element.style.setProperty(name, value)
  document.body.append(element)
  hosts.push(element)
  return element
}

function plot(element: HTMLElement, config: Parameters<typeof createPlot>[1] = {}) {
  const current = createPlot(element, {
    width: 500,
    height: 300,
    title: 'Discharge',
    directions: { x: 'x' },
    scales: { x: linearScale({ domain: [0, 1000] }), y: linearScale({ domain: [0, 1000] }) },
    axes: [
      axis('x', { position: 'bottom', label: 'Time' }),
      axis('y', { position: 'left', label: 'Flow', unit: 'm3/s' }),
    ],
    ...config,
  })
  plots.push(current)
  return current
}

const tickText = (current: Plot) =>
  current.element.querySelector<SVGTextElement>('[data-layer="axes"] [data-scale="y"] text')!
const caption = (current: Plot) =>
  current.element.querySelector<SVGTextElement>(
    '[data-layer="axes"] [data-scale="y"] [data-axis-caption]',
  )!
const titleText = (current: Plot) => current.element.querySelector<SVGTextElement>(':scope > text')!

afterEach(() => {
  vi.restoreAllMocks()
  while (plots.length) plots.pop()?.destroy()
  while (hosts.length) hosts.pop()?.remove()
})

describe('font roles', () => {
  test('defaults to the host font when no family token is set', async () => {
    // `inherit` on a custom property copies the parent's unset token, so it counts as unset.
    const element = host({ 'font-family': 'Georgia, serif', '--fews-chart-font-family': 'inherit' })
    const current = plot(element)
    await frame()
    const family = getComputedStyle(element).fontFamily
    expect(family).toContain('Georgia')
    const theme = current.theme.get()
    expect(theme.fontFamily).toBe(family)
    for (const font of Object.values(theme.fonts)) expect(font.family).toBe(family)
    expect(tickText(current).getAttribute('font-family')).toBe(family)
    expect(titleText(current).getAttribute('font-family')).toBe(family)
  })

  test('resolves each role from its tokens and falls back to the base font', async () => {
    const element = host({
      '--fews-chart-font-family': 'serif',
      '--fews-chart-font-size': '11px',
      '--fews-chart-tick-font-size': '14',
      '--fews-chart-tick-font-variant-numeric': 'tabular-nums',
      '--fews-chart-axis-label-font-size': '15px',
      '--fews-chart-axis-label-font-weight': '600',
      '--fews-chart-title-font-size': '18px',
      '--fews-chart-title-font-weight': 'bold',
      '--fews-chart-legend-font-size': '13px',
      '--fews-chart-tooltip-font-family': 'monospace',
      '--fews-chart-tooltip-font-variant-numeric': 'tabular-nums',
    })
    const clock = sharedClock({ initial: start + 5 * hour })
    const current = plot(element, {
      scales: {
        x: timeScale({ domain: [start, start + 10 * hour], timeZone: 'UTC' }),
        y: linearScale({ domain: [0, 1000] }),
      },
      marks: [
        series(createSeries({ x: [start, start + hour], y: [1, 2] }), {
          label: 'Flow',
          x: 'x',
          y: 'y',
        }),
      ],
      plugins: [legend({ position: 'right' }), currentTime({ clock, label: 'always' })],
    })
    await vi.waitFor(() =>
      expect(document.querySelector('[data-current-time-label] text')).not.toBeNull(),
    )
    await frame()
    const { fonts } = current.theme.get()
    expect(fonts).toEqual({
      tick: { family: 'serif', size: 14, weight: 'normal', variantNumeric: 'tabular-nums' },
      axisLabel: { family: 'serif', size: 15, weight: '600', variantNumeric: 'normal' },
      title: { family: 'serif', size: 18, weight: 'bold', variantNumeric: 'normal' },
      legend: { family: 'serif', size: 13, weight: 'normal', variantNumeric: 'normal' },
      tooltip: { family: 'monospace', size: 11, weight: 'normal', variantNumeric: 'tabular-nums' },
    })

    const tick = getComputedStyle(tickText(current))
    expect([tick.fontSize, tick.fontFamily, tick.fontVariantNumeric]).toEqual([
      '14px',
      'serif',
      'tabular-nums',
    ])
    const label = getComputedStyle(caption(current))
    expect([label.fontSize, label.fontWeight]).toEqual(['15px', '600'])
    const title = getComputedStyle(titleText(current))
    expect([title.fontSize, title.fontWeight]).toEqual(['18px', '700'])
    const entry = document.querySelector<SVGTextElement>('.fews-chart-legend__entry text')!
    expect(getComputedStyle(entry).fontSize).toBe('13px')
    const badge = document.querySelector<SVGTextElement>('[data-current-time-label] text')!
    expect(getComputedStyle(badge).fontFamily).toBe('monospace')
    expect(getComputedStyle(badge).fontVariantNumeric).toBe('tabular-nums')
    const badgeBox = document.querySelector('[data-current-time-label] rect')!
    expect(badgeBox.getAttribute('height')).toBe('21')
  })

  test('measures each role with its own font', async () => {
    const small = plot(host())
    const large = plot(
      host({
        '--fews-chart-tick-font-size': '24px',
        '--fews-chart-axis-label-font-size': '20px',
        '--fews-chart-title-font-size': '30px',
      }),
    )
    await frame()
    const smallPlot = small.regions.get().plot
    const largePlot = large.regions.get().plot
    // The title band is twice the title size.
    expect(largePlot.y - smallPlot.y).toBe(2 * (30 - 12))
    // Wider tick labels and a larger caption widen the left axis.
    expect(largePlot.x).toBeGreaterThan(smallPlot.x + 2 * (20 - 12))
    const labels = [
      ...large.element.querySelectorAll('[data-scale="y"] text:not([data-axis-caption])'),
    ]
    const widest = Math.max(...labels.map((node) => (node as SVGTextElement).getBBox().width))
    expect(large.regions.get().axes[1].width).toBeGreaterThanOrEqual(widest)
  })

  test('relayouts when a role token changes on the theme element', async () => {
    const element = host()
    const current = plot(element, { themeElement: element })
    await frame()
    const before = current.regions.get().plot.x
    element.style.setProperty('--fews-chart-tick-font-size', '24px')
    await vi.waitFor(() => expect(current.theme.get().fonts.tick.size).toBe(24))
    await frame()
    expect(current.regions.get().plot.x).toBeGreaterThan(before)
    expect(getComputedStyle(tickText(current)).fontSize).toBe('24px')
  })

  test.each([
    ['--fews-chart-tick-font-size', 'large', /tick-font-size/],
    ['--fews-chart-title-font-weight', 'heavy', /title-font-weight/],
    ['--fews-chart-tooltip-font-variant-numeric', 'wide-nums', /tooltip-font-variant-numeric/],
    ['--fews-chart-font-size', '0px', /--fews-chart-font-size/],
  ])('rejects %s: %s', (name, value, message) => {
    const element = host({ [name]: value })
    expect(() => resolveTheme(element, 'light', false)).toThrow(message)
  })

  test('measures numeric variants as document text and caches the result', () => {
    const measurer = createTextMeasurer()
    const append = vi.spyOn(document.body, 'append')
    const width = measurer.measure('1111', '12px sans-serif', 'tabular-nums')
    expect(width).toBeGreaterThan(0)
    expect(measurer.measure('1111', '12px sans-serif', 'tabular-nums')).toBe(width)
    expect(append).toHaveBeenCalledTimes(1)
    expect(document.body.lastElementChild?.tagName).not.toBe('SPAN')
    measurer.measure('1111', '12px sans-serif')
    expect(append).toHaveBeenCalledTimes(1)
  })
})

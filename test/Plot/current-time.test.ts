import { afterEach, describe, expect, test, vi } from 'vite-plus/test'
import {
  angularScale,
  axis,
  createPlot,
  createPolarPlot,
  currentTime,
  crosshair,
  linearScale,
  radialScale,
  sharedClock,
  timeScale,
  type CurrentTimeHandle,
  type Plot,
} from '../../src/index.js'

const start = Date.UTC(2026, 0, 1)
const hour = 3_600_000
const domain: [number, number] = [start, start + 10 * hour]

const plots: Plot[] = []
const hosts: HTMLElement[] = []

async function frame() {
  await new Promise(requestAnimationFrame)
  await new Promise(requestAnimationFrame)
}

function host() {
  const element = document.createElement('div')
  element.style.width = '500px'
  element.style.height = '300px'
  document.body.append(element)
  hosts.push(element)
  return element
}

async function setup(
  interaction: CurrentTimeHandle,
  config: Parameters<typeof createPlot>[1] = {},
) {
  const t = timeScale({ domain, timeZone: 'UTC' })
  const plot = createPlot(host(), {
    width: 500,
    height: 300,
    scales: { t, q: linearScale({ domain: [0, 10] }) },
    axes: [axis('t', { position: 'bottom' }), axis('q', { position: 'left' })],
    plugins: [interaction],
    ...config,
  })
  plots.push(plot)
  await frame()
  return { plot, t }
}

const layer = (plot: Plot) =>
  plot.element.querySelector<SVGGElement>(':scope > [data-layer="current-time"]')
const line = (plot: Plot) => layer(plot)?.querySelector('[data-current-time-line]')
const label = (plot: Plot) => layer(plot)?.querySelector<SVGGElement>('[data-current-time-label]')

afterEach(() => {
  vi.restoreAllMocks()
  while (plots.length) plots.pop()?.destroy()
  while (hosts.length) hosts.pop()?.remove()
})

describe('currentTime', () => {
  test('draws a line at the clock time across the plot area', async () => {
    const clock = sharedClock({ initial: start + 5 * hour })
    const { plot } = await setup(currentTime({ clock }))

    const x = plot.scales.t.project(start + 5 * hour)
    const guide = line(plot)!
    expect(Number(guide.getAttribute('x1'))).toBeCloseTo(x)
    expect(Number(guide.getAttribute('x2'))).toBeCloseTo(x)
    const region = plot.regions.get().plot
    expect(Number(guide.getAttribute('y1'))).toBeCloseTo(region.y)
    expect(Number(guide.getAttribute('y2'))).toBeCloseTo(region.y + region.height)
    expect(guide.getAttribute('stroke')).toBe(plot.theme.get().accent)
  })

  test('follows the shared clock across plots without starting it', async () => {
    const clock = sharedClock({ initial: start + 2 * hour })
    const first = await setup(currentTime({ clock }))
    const second = await setup(currentTime({ clock }))
    expect(clock.running.get()).toBe(false)

    clock.set(start + 7 * hour)
    await frame()

    for (const { plot } of [first, second]) {
      expect(Number(line(plot)!.getAttribute('x1'))).toBeCloseTo(
        plot.scales.t.project(start + 7 * hour),
      )
    }
  })

  test('is hidden outside the domain and returns when the domain moves', async () => {
    const clock = sharedClock({ initial: start + 20 * hour })
    const { plot, t } = await setup(currentTime({ clock }))
    expect(layer(plot)!.getAttribute('display')).toBe('none')

    t.domain.set([start + 15 * hour, start + 25 * hour])
    await frame()

    expect(layer(plot)!.hasAttribute('display')).toBe(false)
    expect(Number(line(plot)!.getAttribute('x1'))).toBeCloseTo(
      plot.scales.t.project(start + 20 * hour),
    )
  })

  test('follows a reversed time scale', async () => {
    const clock = sharedClock({ initial: start + 2 * hour })
    const { plot } = await setup(currentTime({ clock }), {
      scales: {
        t: timeScale({ domain, timeZone: 'UTC', reverse: true }),
        q: linearScale({ domain: [0, 10] }),
      },
    })
    const x = Number(line(plot)!.getAttribute('x1'))
    expect(x).toBeCloseTo(plot.scales.t.project(start + 2 * hour))
    const region = plot.regions.get().plot
    expect(x).toBeGreaterThan(region.x + region.width / 2)
  })

  test('shows the label on hover by default', async () => {
    const clock = sharedClock({ initial: start + 5 * hour })
    const { plot } = await setup(currentTime({ clock, format: () => 'now' }))
    expect(label(plot)!.getAttribute('display')).toBe('none')

    const indicator = layer(plot)!.querySelector('[data-current-time-indicator]')!
    indicator.dispatchEvent(new PointerEvent('pointerenter'))
    await frame()
    expect(label(plot)!.hasAttribute('display')).toBe(false)
    expect(label(plot)!.textContent).toBe('now')

    indicator.dispatchEvent(new PointerEvent('pointerleave'))
    await frame()
    expect(label(plot)!.getAttribute('display')).toBe('none')
  })

  test('label can always show or never show, and formats in the scale time zone', async () => {
    const clock = sharedClock({ initial: start + 5 * hour })
    const interaction = currentTime({ clock, label: 'always' })
    const { plot } = await setup(interaction)
    expect(label(plot)!.hasAttribute('display')).toBe(false)
    expect(label(plot)!.textContent).toContain('05:00')

    interaction.update({ label: 'none' })
    await frame()
    expect(label(plot)!.getAttribute('display')).toBe('none')
    const indicator = layer(plot)!.querySelector('[data-current-time-indicator]')!
    expect(indicator.getAttribute('display')).toBe('none')
  })

  test('runs a private clock when none is given, and stops it with the plugin', async () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')
    const now = Date.now()
    const { plot } = await setup(currentTime(), {
      scales: {
        t: timeScale({ domain: [now - hour, now + hour], timeZone: 'UTC' }),
        q: linearScale({ domain: [0, 10] }),
      },
    })

    expect(layer(plot)!.hasAttribute('display')).toBe(false)
    const started = setIntervalSpy.mock.calls.filter(([, delay]) => delay === 10_000)
    expect(started).toHaveLength(1)

    const timer = setIntervalSpy.mock.results[setIntervalSpy.mock.calls.indexOf(started[0])].value
    plot.destroy()
    plots.length = 0
    expect(clearIntervalSpy).toHaveBeenCalledWith(timer)
  })

  test('switches between a private and a shared clock', async () => {
    const clock = sharedClock({ initial: start + 3 * hour })
    const interaction = currentTime({ clock })
    const { plot } = await setup(interaction)
    const shared = plot.scales.t.project(start + 3 * hour)
    expect(Number(line(plot)!.getAttribute('x1'))).toBeCloseTo(shared)

    const other = sharedClock({ initial: start + 8 * hour })
    interaction.update({ clock: other })
    await frame()
    expect(Number(line(plot)!.getAttribute('x1'))).toBeCloseTo(
      plot.scales.t.project(start + 8 * hour),
    )
  })

  test('infers the only time scale, and requires a name when ambiguous', async () => {
    const clock = sharedClock({ initial: start })
    expect(() =>
      createPlot(host(), {
        scales: {
          a: timeScale({ domain, timeZone: 'UTC' }),
          b: timeScale({ domain, timeZone: 'UTC' }),
          q: linearScale({ domain: [0, 1] }),
        },
        directions: { a: 'x', b: 'x', q: 'y' },
        plugins: [currentTime({ clock })],
      }),
    ).toThrow('currentTime.x must name a time scale')

    expect(() =>
      createPlot(host(), {
        scales: { n: linearScale({ domain: [0, 1] }), q: linearScale({ domain: [0, 1] }) },
        directions: { n: 'x', q: 'y' },
        plugins: [currentTime({ clock })],
      }),
    ).toThrow('currentTime.x must name a time scale')

    const named = await setup(currentTime({ clock, x: 'a' }), {
      scales: {
        a: timeScale({ domain, timeZone: 'UTC' }),
        b: timeScale({ domain, timeZone: 'UTC' }),
        q: linearScale({ domain: [0, 1] }),
      },
      directions: { a: 'x', b: 'x', q: 'y' },
      axes: [],
    })
    expect(line(named.plot)).not.toBeNull()
  })

  test('rejects invalid options and plots, leaving the handle unchanged', async () => {
    expect(() => currentTime({ label: 'sometimes' as never })).toThrow('currentTime.label')
    expect(() => currentTime({ format: 'x' as never })).toThrow('currentTime.format')
    expect(() => currentTime({ clock: {} })).toThrow('currentTime.clock')
    expect(() => currentTime({ unknown: 1 } as never)).toThrow()
    expect(() =>
      createPolarPlot(host(), {
        scales: { a: angularScale(), r: radialScale() },
        plugins: [currentTime()],
      }),
    ).toThrow('Cartesian')

    const clock = sharedClock({ initial: start })
    const interaction = currentTime({ clock })
    await setup(interaction)
    expect(() => interaction.update({ x: 'q' })).toThrow('currentTime.x must name a time scale')
    expect(interaction.options.get().resolved.x).toBeUndefined()
  })

  test('renders below the crosshair, and removes its layer with the plugin', async () => {
    const clock = sharedClock({ initial: start + 5 * hour })
    const interaction = currentTime({ clock })
    const { plot } = await setup(interaction, { plugins: [crosshair(), interaction] })

    const crosshairLayer = plot.element.querySelector(':scope > [data-layer="crosshair"]')!
    expect(
      crosshairLayer.compareDocumentPosition(layer(plot)!) & Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeTruthy()

    plot.update({ plugins: [] })
    await frame()
    expect(layer(plot)).toBeNull()
  })
})

import { afterEach, describe, expect, test, vi } from 'vitest'
import { createPlot, linearScale, line, tooltip, type Plot } from '../../src/index.js'

const plots: Plot[] = []
const hosts: HTMLElement[] = []

async function frame() {
  await new Promise(requestAnimationFrame)
  await new Promise(requestAnimationFrame)
}

afterEach(() => {
  for (const plot of plots.splice(0)) plot.destroy()
  for (const host of hosts.splice(0)) host.remove()
  vi.restoreAllMocks()
})

describe('tooltip plugin', () => {
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
    })
    const forecast = line({
      id: 'forecast',
      x: 't',
      y: 'q',
      xValues: [0, 4, 10],
      yValues: [2, 30, 4],
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
    expect(node?.getAttribute('aria-hidden')).toBe('false')
    expect(node?.style.visibility).toBe('visible')
    expect(plot.element.getAttribute('aria-describedby')).toBe(node?.id)

    plot.update({ plugins: [] })
    await frame()
    expect(document.querySelector('[data-layer="tooltip"]')).toBeNull()
    expect(plot.element.hasAttribute('aria-describedby')).toBe(false)
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
})

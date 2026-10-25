import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  axis,
  colorScale,
  createGrid,
  createPlot,
  createTable,
  crosshair,
  heatmap,
  histogram,
  linearScale,
  tooltip,
  type Plot,
} from '../../src/index.js'
import { histogramBar } from '../../src/plot/marks/histogram/histogram.js'
import { barRectangles } from '../../src/plot/marks/bar/bar-geometry.js'

const plots: Plot[] = []
const hosts: HTMLElement[] = []

function host() {
  const element = document.createElement('div')
  element.style.width = '500px'
  element.style.height = '300px'
  document.body.append(element)
  hosts.push(element)
  return element
}

async function frame() {
  await new Promise(requestAnimationFrame)
  await new Promise(requestAnimationFrame)
}

async function move(plot: Plot, x: number, y: number) {
  plot.element.dispatchEvent(
    new PointerEvent('pointermove', { clientX: x, clientY: y, isPrimary: true }),
  )
  await frame()
}

function tooltipEntries() {
  return [...document.querySelectorAll('[data-tooltip-entry]')].map((entry) => entry.textContent)
}

afterEach(() => {
  for (const plot of plots.splice(0)) plot.destroy()
  for (const element of hosts.splice(0)) element.remove()
  vi.restoreAllMocks()
})

describe('interaction coverage for histogram and heatmap marks', () => {
  test('histogram bins snap and report bin values; legend commands control visibility', async () => {
    const mark = histogram(createTable({ row: [0, 1, 2, 3], sample: [0.2, 0.4, 1.2, 1.8] }), {
      id: 'distribution',
      label: 'Distribution',
      x: 'sample',
      scales: { x: 'sample', y: 'frequency' },
      bins: [0, 1, 2],
    })
    const guide = crosshair({
      mode: 'x',
      snap: { mark, axis: 'x' },
      labels: { x: 'sample', y: 'frequency' },
    })
    const plot = createPlot(host(), {
      width: 500,
      height: 300,
      scales: {
        sample: linearScale({ domain: [0, 2] }),
        frequency: linearScale({ domain: [0, 3] }),
      },
      axes: [axis('sample', { position: 'bottom' }), axis('frequency', { position: 'left' })],
      marks: [mark],
      plugins: [guide, tooltip({ crosshair: guide })],
    })
    plots.push(plot)
    await frame()
    vi.spyOn(plot.element, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 500, 300))

    const rectangle = barRectangles(histogramBar(mark), plot.scales)[0]
    await move(plot, rectangle.x + rectangle.width / 2, rectangle.y + rectangle.height / 2)
    expect(tooltipEntries()).toEqual(
      expect.arrayContaining([expect.stringContaining('Distribution')]),
    )
    expect(tooltipEntries()[0]).toContain(' · 2')
    expect(tooltipEntries()[0]).not.toContain('bounds:')
    expect(tooltipEntries()[0]).not.toContain('single')
    expect(plot.element.querySelector('[data-layer="crosshair"]')?.getAttribute('display')).toBe('')

    plot.legend.setVisible('distribution', false)
    await frame()
    expect(mark.options.get().resolved.visible).toBe(false)
    expect(tooltipEntries()).toEqual([])
    plot.legend.setVisible('distribution', true)
    expect(mark.options.get().resolved.visible).toBe(true)
  })

  test('heatmap cells snap with explicit bounds; missing and hidden cells do not hit', async () => {
    const mark = heatmap(
      createGrid({
        xEdges: [0, 1, 3],
        yEdges: [0, 2, 5],
        values: [2.5, Number.NaN, 4.25, 6],
      }),
      {
        id: 'temperatures',
        scales: { x: 'time', y: 'level' },
        color: colorScale({ domain: [0, 10], colors: ['blue', 'red'] }),
      },
    )
    const guide = crosshair({
      mode: 'xy',
      snap: { mark, axis: 'xy' },
      labels: { x: 'time', y: 'level' },
    })
    const plot = createPlot(host(), {
      width: 500,
      height: 300,
      scales: { time: linearScale({ domain: [0, 3] }), level: linearScale({ domain: [0, 5] }) },
      axes: [axis('time', { position: 'bottom' }), axis('level', { position: 'left' })],
      marks: [mark],
      plugins: [guide, tooltip({ crosshair: guide })],
    })
    plots.push(plot)
    await frame()
    vi.spyOn(plot.element, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 500, 300))

    await move(plot, plot.scales.time.project(0.5), plot.scales.level.project(1))
    expect(tooltipEntries()[0]).toContain('x: 0–1')
    expect(tooltipEntries()[0]).toContain('y: 0–2')
    expect(tooltipEntries()[0]).toContain('value: 2.5')
    expect(plot.element.querySelector('[data-layer="crosshair"]')?.getAttribute('display')).toBe('')

    await move(plot, plot.scales.time.project(2), plot.scales.level.project(1))
    expect(tooltipEntries()).toEqual([])
    expect(plot.element.querySelector('[data-layer="crosshair"]')?.getAttribute('display')).toBe(
      'none',
    )

    mark.update({ visible: false })
    await move(plot, plot.scales.time.project(0.5), plot.scales.level.project(1))
    expect(tooltipEntries()).toEqual([])
  })
})

import { afterEach, describe, expect, test } from 'vitest'
import { createPlot, linearScale, line, type Plot } from '../../src/index.js'

const plots: Plot[] = []
const hosts: HTMLElement[] = []

function createTestPlot(config: Parameters<typeof createPlot>[1] = {}) {
  const host = document.createElement('div')
  document.body.append(host)
  hosts.push(host)
  const plot = createPlot(host, { width: 400, height: 250, ...config })
  plots.push(plot)
  return plot
}

async function frame() {
  await new Promise(requestAnimationFrame)
  await new Promise(requestAnimationFrame)
}

afterEach(() => {
  for (const plot of plots.splice(0)) plot.destroy()
  for (const host of hosts.splice(0)) host.remove()
})

describe('public plot events', () => {
  test('notifies plot listeners and dispatches the same domain detail to the DOM', async () => {
    const scale = linearScale({ domain: [0, 10] })
    const plot = createTestPlot({ scales: { x: scale } })
    const details: unknown[] = []
    const domDetails: unknown[] = []
    plot.on('domainchange', (detail) => details.push(detail))
    const htmlListener = (event: HTMLElementEventMap['domainchange']) => {
      domDetails.push(event.detail)
    }
    document.createElement('div').addEventListener('domainchange', htmlListener)
    plot.element.addEventListener('domainchange', (event) => {
      domDetails.push(event.detail)
    })

    scale.update({ domain: [2, 8] })
    await frame()

    expect(details).toHaveLength(1)
    expect(details[0]).toMatchObject({
      scale: 'x',
      handle: scale,
      domain: [2, 8],
      previous: [0, 10],
      explicit: true,
      source: 'api',
    })
    expect(domDetails).toEqual(details)
  })

  test('does not emit an initial layout event and emits after a resize', async () => {
    const plot = createTestPlot()
    const details: unknown[] = []
    plot.on('layoutchange', (detail) => details.push(detail))
    await frame()
    expect(details).toEqual([])

    const previous = plot.regions.get()
    plot.update({ width: 620 })
    await frame()
    expect(details).toHaveLength(1)
    expect(details[0]).toMatchObject({
      size: { width: 620, height: 250 },
      previous,
    })
  })

  test('emits legend events when legend entries change', async () => {
    const plot = createTestPlot({
      scales: { x: linearScale(), y: linearScale() },
      directions: { x: 'x', y: 'y' },
      marks: [line({ x: 'x', y: 'y', xValues: [0, 1], yValues: [2, 3], id: 'series' })],
    })
    await frame()
    const entries: unknown[] = []
    plot.on('legendchange', (detail) => entries.push(detail.entries))

    plot.update({ marks: [] })
    await frame()

    expect(entries).toHaveLength(1)
    expect(entries[0]).toEqual([])
  })

  test('stops notifying after destroy and honors listener abort signals', async () => {
    const scale = linearScale({ domain: [0, 10] })
    const plot = createTestPlot({ scales: { x: scale } })
    const controller = new AbortController()
    const details: unknown[] = []
    plot.on('domainchange', (detail) => details.push(detail), { signal: controller.signal })
    controller.abort()
    scale.update({ domain: [1, 9] })
    await frame()
    expect(details).toEqual([])

    plot.on('domainchange', (detail) => details.push(detail))
    plot.destroy()
    scale.update({ domain: [2, 8] })
    await frame()
    expect(details).toEqual([])
  })
})

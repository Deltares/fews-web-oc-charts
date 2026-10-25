import { afterEach, expect, test } from 'vitest'
import { createPlot, linearScale, zoom, type Plot } from '../../src/index.js'

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

test('wheel/reset events report changed scales and release listeners on removal and destruction', async () => {
  const host = document.createElement('div')
  document.body.append(host)
  hosts.push(host)
  const x = linearScale({ domain: [0, 100] })
  const y = linearScale({ domain: [0, 100] })
  const interaction = zoom({ mode: 'xy', wheel: 'xy' })
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
  const details: { scale: string; source: string; domain: readonly unknown[] }[] = []
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
  details.length = 0
  expect(reset()).toBe(false)
  await frame()
  expect(details.map(({ source }) => source)).toEqual(['reset', 'reset'])
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

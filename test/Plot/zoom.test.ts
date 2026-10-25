import { afterEach, expect, test } from 'vitest'
import {
  createPlot,
  line,
  linearScale,
  ModifierKey,
  zoom,
  type DomainChangeDetail,
  type Plot,
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

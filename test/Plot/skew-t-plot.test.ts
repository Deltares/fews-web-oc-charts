import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  axis,
  createPlot,
  createSkewTPlot,
  line,
  linearScale,
  logScale,
  rule,
  zoom,
  type SkewTPlot,
  type SkewTPlotConfig,
} from '../../src/index.js'

const plots: SkewTPlot[] = []
const hosts: HTMLElement[] = []

function host() {
  const element = document.createElement('div')
  element.style.width = '600px'
  element.style.height = '600px'
  document.body.append(element)
  hosts.push(element)
  return element
}

function config(): SkewTPlotConfig {
  return {
    scales: {
      t: linearScale({ domain: [-40, 50] }),
      p: logScale({ domain: [100, 1000], reverse: true }),
    },
    axes: [
      axis('t', { position: 'bottom', grid: true, label: 'Temperature', unit: 'C', tickCount: 9 }),
      axis('p', { position: 'left', grid: true, label: 'Pressure', unit: 'hPa' }),
    ],
  }
}

function plot(options: SkewTPlotConfig = config()) {
  const result = createSkewTPlot(host(), options)
  plots.push(result)
  return result
}

async function frame() {
  await new Promise(requestAnimationFrame)
  await new Promise(requestAnimationFrame)
}

afterEach(() => {
  for (const current of plots.splice(0)) current.destroy()
  for (const element of hosts.splice(0)) element.remove()
})

describe('supported skew-T coordinate system', () => {
  test('projects physical values, preserves log spacing and exactly inverts the shear', async () => {
    const current = plot()
    await frame()
    const region = current.regions.get().plot
    const bottom = current.project(0, 1000)
    const middle = current.project(0, Math.sqrt(100 * 1000))
    const top = current.project(0, 100)
    expect(bottom.x).toBeCloseTo(region.x + (40 / 90) * region.width)
    expect(bottom.y).toBeCloseTo(region.y + region.height)
    expect(middle.y).toBeCloseTo(region.y + region.height / 2)
    expect(top.y).toBeCloseTo(region.y)
    expect(top.x - bottom.x).toBeCloseTo(((30 * Math.log(10)) / 90) * region.width)
    for (const temperature of [-70, -10, 25]) {
      for (const pressure of [100, 500, 925, 1000]) {
        const point = current.project(temperature, pressure)
        const inverted = current.invert(point.x, point.y)
        expect(inverted.temperature).toBeCloseTo(temperature, 10)
        expect(inverted.pressure).toBeCloseTo(pressure, 8)
      }
    }
    expect(() => current.project(10, 0)).toThrow(/positive/)
    expect(() => current.project(NaN, 500)).toThrow(/finite/)
    expect(() => current.invert(Infinity, 0)).toThrow(/finite/)
  })

  test('uses the same projection for lines, markers and the clipped grid, preserving level order and gaps', async () => {
    const sounding = line({
      id: 'temperature',
      x: 't',
      y: 'p',
      xValues: [20, 10, null, -15, -40],
      yValues: [1000, 850, 700, 500, 300],
      markers: { size: 3 },
    })
    const current = plot({ ...config(), marks: [sounding] })
    await frame()
    const points = [
      [20, 1000],
      [10, 850],
      [-15, 500],
      [-40, 300],
    ].map(([temperature, pressure]) => current.project(temperature, pressure))
    const path = current.element.querySelector('[data-mark="line"]')!
    expect(path.getAttribute('d')).toBe(
      `M${points[0].x},${points[0].y}L${points[1].x},${points[1].y}` +
        `M${points[2].x},${points[2].y}L${points[3].x},${points[3].y}`,
    )
    const markers = current.element.querySelectorAll('circle[data-mark="marker"]')
    expect(markers.length).toBe(4)
    markers.forEach((marker, index) => {
      expect(Number(marker.getAttribute('cx'))).toBeCloseTo(points[index].x)
      expect(Number(marker.getAttribute('cy'))).toBeCloseTo(points[index].y)
    })
    const isotherm = current.element.querySelector('[data-isotherm="0"]')!
    const bottom = current.project(0, 1000)
    const top = current.project(0, 100)
    expect(Number(isotherm.getAttribute('x1'))).toBeCloseTo(bottom.x)
    expect(Number(isotherm.getAttribute('x2'))).toBeCloseTo(top.x)
    const isobar = current.element.querySelector('[data-isobar="500"]')!
    expect(Number(isobar.getAttribute('y1'))).toBeCloseTo(current.project(0, 500).y)
    expect(isobar.getAttribute('y1')).toBe(isobar.getAttribute('y2'))
    const grid = current.element.querySelector('[data-layer="grid"]')!
    const marks = current.element.querySelector('[data-layer="marks"]')!
    expect(grid.getAttribute('clip-path')).toBe(marks.getAttribute('clip-path'))
    expect(current.element.querySelector('[data-isotherm="-100"]')).not.toBeNull()
    const axisText = current.element.querySelector('[data-scale="p"]')!.textContent
    expect(axisText).toContain('500')
    expect(axisText).toContain('hPa')
  })

  test('updates skew, domains, size and theme without replacing marks; resets configuration defaults', async () => {
    const initial = {
      ...config(),
      marks: [line({ x: 't', y: 'p', xValues: [10, -20], yValues: [1000, 500] })],
    }
    const current = plot(initial)
    await frame()
    const path = current.element.querySelector('[data-mark="line"]')!
    const original = path.getAttribute('d')
    current.update({ skewT: { skew: 0 }, theme: 'dark', width: 800 })
    await frame()
    expect(path.getAttribute('d')).not.toBe(original)
    expect(current.element.querySelector('[data-mark="line"]')).toBe(path)
    expect(current.size.get().width).toBe(800)
    expect(current.project(10, 500).x).toBeCloseTo(current.project(10, 1000).x)
    expect(current.element.querySelector('[data-isotherm="0"]')?.getAttribute('x1')).toBe(
      current.element.querySelector('[data-isotherm="0"]')?.getAttribute('x2'),
    )
    const label = current.element.querySelector('[data-scale="p"] text')!
    expect(getComputedStyle(label).fill).toBe('rgb(237, 242, 244)')
    current.setConfig(initial)
    await frame()
    expect(current.options.get().resolved.skewT?.skew).toBe(30)
    current.scales.p.scale.domain.set([200, 1000])
    await frame()
    expect(current.project(0, 200).y).toBeCloseTo(current.regions.get().plot.y)
    hosts[0].style.height = '700px'
    await vi.waitFor(() => expect(current.size.get().height).toBe(700))
    expect(current.project(0, 1000).y).toBeCloseTo(
      current.regions.get().plot.y + current.regions.get().plot.height,
    )
  })

  test('publishes physical pointer values with SVG-to-CSS scaling', async () => {
    const current = plot()
    await frame()
    const projected = current.project(-12, 500)
    current.element.style.width = '300px'
    current.element.style.height = '300px'
    const bounds = current.element.getBoundingClientRect()
    current.element.dispatchEvent(
      new PointerEvent('pointermove', {
        isPrimary: true,
        clientX: bounds.left + (projected.x * bounds.width) / current.size.get().width,
        clientY: bounds.top + (projected.y * bounds.height) / current.size.get().height,
      }),
    )
    await frame()
    expect(current.pointer.get().inside).toBe(true)
    expect(current.pointer.get().x.get('t')).toBeCloseTo(-12)
    expect(current.pointer.get().x.get('p')).toBeCloseTo(500)
    current.element.dispatchEvent(new PointerEvent('pointerleave', { isPrimary: true }))
    await frame()
    expect(current.pointer.get().inside).toBe(false)
  })

  test('autoscales bottom-edge temperature extents with the shear, including visible windows', async () => {
    const temperature = linearScale()
    const pressure = logScale({ domain: [100, 1000], reverse: true })
    const current = plot({
      scales: { t: temperature, p: pressure },
      marks: [line({ x: 't', y: 'p', xValues: [10, 0], yValues: [1000, 100] })],
    })
    await frame()
    expect(Number(temperature.domain.get()[0])).toBeCloseTo(10)
    expect(Number(temperature.domain.get()[1])).toBeCloseTo(30 * Math.log(10))
    const region = current.regions.get().plot
    expect(current.project(10, 1000).x).toBeCloseTo(region.x)
    expect(current.project(0, 100).x).toBeCloseTo(region.x + region.width)
    current.update({ skewT: { skew: 10 } })
    await frame()
    expect(Number(temperature.domain.get()[1])).toBeCloseTo(10 * Math.log(10))
    temperature.update({ autoscale: 'visible' })
    pressure.update({ domain: [500, 1000] })
    await frame()
    expect(Number(temperature.domain.get()[0])).toBeLessThan(10)
    expect(Number(temperature.domain.get()[1])).toBeGreaterThan(10)
    temperature.update({ domain: [20, 30] })
    pressure.update({ domain: undefined, autoscale: 'visible' })
    await frame()
    expect(Number(pressure.domain.get()[0])).toBeLessThan(100)
    expect(Number(pressure.domain.get()[1])).toBeGreaterThan(100)
  })

  test('bounds isotherm density when skew is large relative to a narrow temperature domain', async () => {
    const current = plot({
      ...config(),
      scales: {
        t: linearScale({ domain: [0, 0.001] }),
        p: logScale({ domain: [100, 1000], reverse: true }),
      },
    })
    await frame()
    const count = current.element.querySelectorAll('[data-isotherm]').length
    expect(count).toBeGreaterThan(0)
    expect(count).toBeLessThanOrEqual(40)
  })

  test('rejects unsupported configurations atomically and releases axis validators on destroy', async () => {
    expect(() => plot({})).toThrow(/exactly one linear/)
    expect(() => plot({ ...config(), axisLayout: 'inset' })).toThrow(/outside axes/)
    expect(() => plot({ ...config(), plugins: [zoom()] })).toThrow(/Cartesian/)
    expect(() =>
      plot({
        ...config(),
        marks: [rule({ scale: 'p', value: 500 })],
      }),
    ).toThrow(/line\(\)/)
    expect(() =>
      plot({
        ...config(),
        marks: [line({ x: 't', y: 'p', xValues: [1], yValues: [0] })],
      }),
    ).toThrow(/positive/)
    expect(() =>
      plot({
        ...config(),
        marks: [line({ x: 't', y: 'p', xValues: [1], yValues: [500], area: { to: 1000 } })],
      }),
    ).toThrow(/area fills/)
    const current = plot()
    const temperatureAxis = current.options.get().resolved.axes[0]
    expect(() => current.update({ skewT: { skew: -1 } })).toThrow(/nonnegative/)
    expect(current.options.get().resolved.skewT?.skew).toBe(30)
    expect(() => temperatureAxis.update({ position: 'top' })).toThrow(/bottom temperature/)
    expect(() => temperatureAxis.update({ style: 'classic' })).toThrow(/default axes/)
    expect(temperatureAxis.options.get().resolved.position).toBe('bottom')
    await frame()
    current.destroy()
    current.destroy()
    expect(current.element.isConnected).toBe(false)
    expect(() => current.project(10, 500)).toThrow(/destroyed/)
    expect(() => current.invert(0, 0)).toThrow(/destroyed/)
    expect(() => current.update({ title: 'gone' })).toThrow(/destroyed/)
    expect(() => temperatureAxis.update({ position: 'top' })).not.toThrow()
    expect(() => createPlot(host(), { skewT: { skew: 30 } })).toThrow(/createSkewTPlot/)
  })
})

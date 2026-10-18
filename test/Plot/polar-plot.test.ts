import { afterEach, describe, expect, test, vi } from 'vitest'
import { angular, axis, createPolarPlot, linear, radial, type PolarPlot } from '../../src/index.js'

const plots: PolarPlot[] = []
const hosts: HTMLElement[] = []

function host(width = 500, height = 300) {
  const element = document.createElement('div')
  element.style.width = `${width}px`
  element.style.height = `${height}px`
  document.body.append(element)
  hosts.push(element)
  return element
}

function plot(...args: Parameters<typeof createPolarPlot>) {
  const result = createPolarPlot(...args)
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

describe('createPolarPlot', () => {
  test('projects angular and radial values and renders polar axes', async () => {
    const current = plot(host(), {
      scales: {
        theta: angular({ domain: [0, 360] }),
        distance: radial({ domain: [0, 10] }),
      },
      axes: [
        axis('theta', { position: 'angular', grid: true }),
        axis('distance', { position: 'radial', grid: true }),
      ],
    })
    await frame()

    const region = current.regions.get().plot
    const north = current.project(0, 10)
    const east = current.project(90, 10)
    expect(north.x).toBeCloseTo(region.x + region.width / 2)
    expect(north.y).toBeCloseTo(
      region.y + region.height / 2 - Math.min(region.width, region.height) / 2,
    )
    expect(east.x).toBeCloseTo(
      region.x + region.width / 2 + Math.min(region.width, region.height) / 2,
    )
    expect(east.y).toBeCloseTo(region.y + region.height / 2)
    expect(current.project(0, 0)).toEqual({
      x: region.x + region.width / 2,
      y: region.y + region.height / 2,
    })
    expect(current.element.querySelector('[data-coordinate-system="polar"]')).not.toBeNull()
    expect(current.element.querySelectorAll('[data-layer="grid"] circle').length).toBeGreaterThan(0)
    expect(current.element.querySelectorAll('[data-layer="grid"] line').length).toBeGreaterThan(0)
  })

  test('applies anticlockwise direction, intercept, inner radius, updates and resize', async () => {
    const current = plot(host(), {
      scales: {
        theta: angular({
          domain: [0, 360],
          direction: 'anticlockwise',
          intercept: Math.PI / 2,
        }),
        distance: radial({ domain: [0, 10], innerRadius: 0.5 }),
      },
    })
    await frame()
    let region = current.regions.get().plot
    const centerX = region.x + region.width / 2
    const centerY = region.y + region.height / 2
    const inner = current.project(0, 0)
    const outer = current.project(90, 10)
    expect(inner.x).toBeCloseTo(centerX + Math.min(region.width, region.height) / 4)
    expect(inner.y).toBeCloseTo(centerY)
    expect(outer.x).toBeCloseTo(centerX)
    expect(outer.y).toBeCloseTo(centerY - Math.min(region.width, region.height) / 2)

    current.options.get().resolved.scales.theta.domain.set([0, 180])
    await frame()
    expect(current.project(90, 10).y).toBeCloseTo(centerY)

    const element = current.element
    const hostElement = hosts[0]
    hostElement.style.width = '700px'
    await vi.waitFor(() => expect(current.size.get().width).toBe(700))
    region = current.regions.get().plot
    expect(current.project(90, 10).x).toBeCloseTo(
      region.x + region.width / 2 - Math.min(region.width, region.height) / 2,
    )
    expect(element.isConnected).toBe(true)
  })

  test('rejects cartesian scales, mismatched axes, extra polar scales and cartesian directions', () => {
    expect(() => plot(host(), { scales: { theta: linear(), distance: radial() } })).toThrow(
      /angular or radial scales/,
    )
    expect(() =>
      plot(host(), {
        scales: { theta: angular(), distance: radial() },
        axes: [axis('theta', { position: 'radial' })],
      }),
    ).toThrow(/axis in the angular direction/)
    expect(() =>
      plot(host(), {
        scales: {
          theta: angular(),
          theta2: angular(),
          distance: radial(),
        },
      }),
    ).toThrow(/exactly one angular scale/)
    // @ts-expect-error Polar plots have no cartesian directions.
    expect(() =>
      plot(host(), {
        scales: { theta: angular(), distance: radial() },
        directions: { theta: 'x' },
      }),
    ).toThrow(/cartesian plot.directions/)
  })

  test('validates polar scale options', () => {
    expect(angular().domain.get()).toEqual([0, 360])
    expect(radial().options.get().resolved.innerRadius).toBe(0)
    expect(() => angular({ direction: 'sideways' as 'clockwise' })).toThrow(/angular.direction/)
    expect(() => angular({ intercept: Number.NaN })).toThrow(/angular.intercept/)
    expect(() => angular({ range: [0, Number.POSITIVE_INFINITY] })).toThrow(/angular.range/)
    expect(() => radial({ innerRadius: 1 })).toThrow(/radial.innerRadius/)
    expect(() => radial({ domain: [-1, 1] })).toThrow(/radial.domain/)
    expect(() => radial({ includeZero: true })).toThrow(/require a linear scale/)
  })
})

import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  angularScale,
  axis,
  createPolarPlot,
  linearScale,
  line,
  radialScale,
  type PolarPlot,
} from '../../src/index.js'

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
  test('renders polar lines and keeps classic axis updates atomic', async () => {
    const angular = axis('theta', { position: 'angular', style: 'classic' })
    const radial = axis('distance', { position: 'radial', style: 'classic' })
    const current = plot(host(), {
      axisLayout: 'inset',
      scales: {
        theta: angularScale({ domain: [0, 360] }),
        distance: radialScale({ domain: [0, 10] }),
      },
      axes: [angular, radial],
      marks: [
        line({
          x: 'theta',
          y: 'distance',
          xValues: [0, 90, 180],
          yValues: [1, 5, 10],
          digits: 3,
          markers: { size: 16, skip: 2 },
        }),
      ],
    })
    await frame()
    expect(current.element.querySelector('[data-mark="line"]')?.getAttribute('d')).toMatch(
      /^M.+L.+L/,
    )
    expect(current.element.querySelector('[data-mark="marker"]')).not.toBeNull()
    expect(() => angular.update({ style: 'default' })).toThrow(/both angular and radial/)
    expect(angular.options.get().resolved.style).toBe('classic')
  })

  test('projects angular and radial values and renders polar axes', async () => {
    const current = plot(host(), {
      scales: {
        theta: angularScale({ domain: [0, 360] }),
        distance: radialScale({ domain: [0, 10] }),
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
        theta: angularScale({
          domain: [0, 360],
          direction: 'anticlockwise',
          intercept: Math.PI / 2,
        }),
        distance: radialScale({ domain: [0, 10], innerRadius: 0.5 }),
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

  test('inherits the dark theme foreground for polar axis labels', async () => {
    const current = plot(host(), {
      theme: 'dark',
      scales: {
        theta: angularScale({ domain: [0, 360] }),
        distance: radialScale({ domain: [0, 10] }),
      },
      axes: [axis('theta', { position: 'angular' }), axis('distance', { position: 'radial' })],
    })
    await frame()

    const axisGroup = current.element.querySelector<SVGGElement>('[data-coordinate-system="polar"]')
    const label = axisGroup?.querySelector('text')
    expect(axisGroup?.getAttribute('fill')).toBe('currentColor')
    expect(label).not.toBeNull()
    expect(getComputedStyle(label!).fill).toBe('rgb(237, 242, 244)')
  })

  test.each([
    { grid: false, innerRadius: 0 },
    { grid: true, innerRadius: 0 },
    { grid: false, innerRadius: 0.25 },
    { grid: true, innerRadius: 0.25 },
  ])(
    'preserves polar axis geometry and captions with grid=$grid and innerRadius=$innerRadius',
    async ({ grid, innerRadius }) => {
      const bearing = angularScale({
        domain: [0, 360],
        direction: 'anticlockwise',
        intercept: Math.PI / 2,
        range: [0, Math.PI],
      })
      const distance = radialScale({ domain: [0, 10], innerRadius })
      const bearingAxis = axis('theta', {
        position: 'angular',
        grid,
        tickCount: 4,
        label: 'Bearing',
        unit: 'deg',
        format: (value) => `bearing:${value}`,
      })
      const distanceAxis = axis('distance', {
        position: 'radial',
        grid,
        tickCount: 2,
        label: 'Distance',
        unit: 'm',
        format: (value) => `distance:${value}`,
      })
      const current = plot(host(), {
        scales: { theta: bearing, distance },
        axes: [bearingAxis, distanceAxis],
      })
      await frame()

      const group = current.element.querySelector<SVGGElement>('[data-coordinate-system="polar"]')!
      const gridLayer = current.element.querySelector('[data-layer="grid"]')!
      const region = current.regions.get().plot
      const centerX = region.x + region.width / 2
      const centerY = region.y + region.height / 2
      const outerRadius = current.scales.distance.range.get()[1]
      const radialTicks = current.scales.distance.ticks(2)
      expect(group.querySelectorAll('circle')).toHaveLength(0)
      const circles = gridLayer.querySelectorAll('circle')
      expect(circles).toHaveLength(grid ? radialTicks.length : 0)
      const radialLabels = [...group.querySelectorAll('text')].filter((label) =>
        label.textContent?.startsWith('distance:'),
      )
      expect(radialLabels).toHaveLength(radialTicks.length)
      radialTicks.forEach((value, index) => {
        const radius = current.scales.distance.project(value)
        if (grid) {
          expect(Number(circles[index].getAttribute('cx'))).toBeCloseTo(centerX)
          expect(Number(circles[index].getAttribute('cy'))).toBeCloseTo(centerY)
          expect(Number(circles[index].getAttribute('r'))).toBeCloseTo(radius)
        }
        const label = radialLabels[index]
        expect(label.textContent).toBe(`distance:${value}`)
        expect(Number(label.getAttribute('x'))).toBeCloseTo(centerX + 4)
        expect(Number(label.getAttribute('y'))).toBeCloseTo(centerY - radius - 3)
      })
      const angularTicks = current.scales.theta.ticks(4)
      expect(group.querySelectorAll('line')).toHaveLength(0)
      const lines = gridLayer.querySelectorAll('line')
      expect(lines).toHaveLength(grid ? angularTicks.length : 0)
      const angularLabels = [...group.querySelectorAll('text')].filter((label) =>
        label.textContent?.startsWith('bearing:'),
      )
      expect(angularLabels).toHaveLength(angularTicks.length)
      angularTicks.forEach((value, index) => {
        const start = current.project(value, 0)
        const point = current.project(value, 10)
        const angle = Math.PI / 2 - current.scales.theta.project(value)
        if (grid) {
          expect(Number(lines[index].getAttribute('x1'))).toBeCloseTo(start.x)
          expect(Number(lines[index].getAttribute('y1'))).toBeCloseTo(start.y)
          expect(Number(lines[index].getAttribute('x2'))).toBeCloseTo(point.x)
          expect(Number(lines[index].getAttribute('y2'))).toBeCloseTo(point.y)
        }
        const label = angularLabels[index]
        expect(label.textContent).toBe(`bearing:${value}`)
        expect(Number(label.getAttribute('x'))).toBeCloseTo(
          centerX + (outerRadius + 12) * Math.sin(angle),
        )
        expect(Number(label.getAttribute('y'))).toBeCloseTo(
          centerY - (outerRadius + 12) * Math.cos(angle),
        )
        expect(label.getAttribute('text-anchor')).toBe(
          Math.sin(angle) > 0.15 ? 'start' : Math.sin(angle) < -0.15 ? 'end' : 'middle',
        )
      })
      expect([...gridLayer.children].map((node) => node.getAttribute('stroke'))).toEqual(
        grid ? [...circles, ...lines].map(() => gridLayer.getAttribute('stroke')) : [],
      )
      expect([...gridLayer.children].some((node) => node.hasAttribute('stroke-dasharray'))).toBe(
        false,
      )
      const angularCaption = group.querySelector('[data-axis-caption="theta"]')!
      const radialCaption = group.querySelector('[data-axis-caption="distance"]')!
      const fontSize = Number(group.getAttribute('font-size'))
      expect(angularCaption.textContent).toBe('Bearing (deg)')
      expect(Number(angularCaption.getAttribute('x'))).toBeCloseTo(centerX)
      expect(Number(angularCaption.getAttribute('y'))).toBeCloseTo(
        centerY - outerRadius - fontSize * 2,
      )
      expect(radialCaption.textContent).toBe('Distance (m)')
      expect(Number(radialCaption.getAttribute('x'))).toBeCloseTo(centerX + outerRadius * 0.7)
      expect(Number(radialCaption.getAttribute('y'))).toBeCloseTo(centerY - outerRadius * 0.7)

      bearingAxis.update({ grid: !grid, label: '', unit: '' })
      distanceAxis.update({ grid: !grid, label: '', unit: '' })
      await frame()
      expect(current.element.querySelectorAll('[data-axis-caption]')).toHaveLength(0)
      const updatedGroup = current.element.querySelector('[data-coordinate-system="polar"]')!
      expect(updatedGroup.querySelectorAll('circle')).toHaveLength(0)
      expect(updatedGroup.querySelectorAll('line')).toHaveLength(0)
      expect(gridLayer.querySelectorAll('circle')).toHaveLength(grid ? 0 : radialTicks.length)
      expect(gridLayer.querySelectorAll('line')).toHaveLength(grid ? 0 : angularTicks.length)
      expect(
        [...updatedGroup.querySelectorAll('text')].filter((label) =>
          label.textContent?.startsWith('bearing:'),
        ),
      ).toHaveLength(angularTicks.length)
      expect(
        [...updatedGroup.querySelectorAll('text')].filter((label) =>
          label.textContent?.startsWith('distance:'),
        ),
      ).toHaveLength(radialTicks.length)
      expect(current.element.querySelectorAll('[data-layer="grid"] > *')).toHaveLength(
        grid ? 0 : radialTicks.length + angularTicks.length,
      )
    },
  )

  test.each(['none', 'angular', 'radial'] as const)(
    'renders the existing fallback with %s axes',
    async (position) => {
      const axes =
        position === 'none'
          ? []
          : [axis(position === 'angular' ? 'theta' : 'distance', { position })]
      const current = plot(host(), {
        scales: { theta: angularScale(), distance: radialScale() },
        axes,
      })
      await frame()

      const group = current.element.querySelector('[data-coordinate-system="polar"]')!
      const region = current.regions.get().plot
      const circles = group.querySelectorAll('circle')
      expect(circles).toHaveLength(position === 'radial' ? 0 : 1)
      if (position !== 'radial') {
        expect(Number(circles[0].getAttribute('r'))).toBeCloseTo(
          Math.min(region.width, region.height) / 2,
        )
      }
      expect(group.querySelectorAll('line')).toHaveLength(0)
      expect(current.element.querySelectorAll('[data-layer="grid"] > *')).toHaveLength(0)
      expect(group.querySelectorAll('[data-axis-caption]')).toHaveLength(0)
    },
  )

  test('rejects cartesian scales, mismatched axes, extra polar scales and cartesian directions', () => {
    expect(() =>
      plot(host(), { scales: { theta: linearScale(), distance: radialScale() } }),
    ).toThrow(/angular or radial scales/)
    expect(() =>
      plot(host(), {
        scales: { theta: angularScale(), distance: radialScale() },
        axes: [axis('theta', { position: 'radial' })],
      }),
    ).toThrow(/axis in the angular direction/)
    expect(() =>
      plot(host(), {
        scales: {
          theta: angularScale(),
          theta2: angularScale(),
          distance: radialScale(),
        },
      }),
    ).toThrow(/exactly one angular scale/)
    // @ts-expect-error Polar plots have no cartesian directions.
    expect(() =>
      plot(host(), {
        scales: { theta: angularScale(), distance: radialScale() },
        directions: { theta: 'x' },
      }),
    ).toThrow(/cartesian plot.directions/)
  })

  test('validates polar scale options', () => {
    expect(angularScale().domain.get()).toEqual([0, 360])
    expect(radialScale().options.get().resolved.innerRadius).toBe(0)
    expect(() => angularScale({ direction: 'sideways' as 'clockwise' })).toThrow(
      /angular.direction/,
    )
    expect(() => angularScale({ intercept: Number.NaN })).toThrow(/angular.intercept/)
    expect(() => angularScale({ range: [0, Number.POSITIVE_INFINITY] })).toThrow(/angular.range/)
    expect(() => radialScale({ innerRadius: 1 })).toThrow(/radial.innerRadius/)
    expect(() => radialScale({ domain: [-1, 1] })).toThrow(/radial.domain/)
    expect(() => radialScale({ includeZero: true })).toThrow(/require a linear scale/)
  })
})

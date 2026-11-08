import { afterEach, describe, expect, test } from 'vite-plus/test'
import { axis, createPlot, linearScale, type Plot } from '../../src/index.js'

const plots: Plot[] = []
const hosts: HTMLElement[] = []

function plot(config: Parameters<typeof createPlot>[1]) {
  const node = document.createElement('div')
  document.body.append(node)
  hosts.push(node)
  const current = createPlot(node, { width: 400, height: 200, ...config })
  plots.push(current)
  return current
}

async function frame() {
  await new Promise(requestAnimationFrame)
  await new Promise(requestAnimationFrame)
}

afterEach(() => {
  for (const current of plots.splice(0)) current.destroy()
  for (const element of hosts.splice(0)) element.remove()
})

const classicPlot = (gridDasharray?: string) =>
  plot({
    directions: { x: 'x' },
    scales: { x: linearScale({ domain: [0, 4] }), y: linearScale({ domain: [-2, 2] }) },
    axes: [
      axis('x', { position: 'bottom', style: 'classic', grid: true, gridDasharray }),
      axis('y', { position: 'left', style: 'classic', grid: true, gridDasharray }),
    ],
  })

describe('classic axis grid', () => {
  test('draws solid hairlines and frame in the theme grid colour', async () => {
    const current = classicPlot()
    await frame()
    const layer = current.element.querySelector<SVGGElement>('[data-layer="grid"]')!
    const groups = [...layer.children] as SVGGElement[]
    expect(groups).toHaveLength(2)
    const gridColor = getComputedStyle(layer).stroke
    expect(gridColor).not.toBe('rgb(255, 255, 255)')
    expect(layer.getAttribute('stroke')).toBe(`var(--fews-chart-grid, ${current.theme.get().grid})`)
    for (const group of groups) {
      expect(group.hasAttribute('stroke-dasharray')).toBe(false)
      const frame = group.querySelector('.domain')!
      expect(getComputedStyle(frame).stroke).toBe(gridColor)
      expect(getComputedStyle(frame).strokeDasharray).toBe('none')
      for (const tick of group.querySelectorAll<SVGGElement>('.tick')) {
        const line = tick.querySelector('line')!
        const style = getComputedStyle(line)
        expect(style.strokeDasharray).toBe('none')
        expect(style.strokeWidth).toBe('1px')
        const zero = tick.getAttribute('stroke') !== null
        expect(style.stroke === gridColor).toBe(!zero)
      }
    }
    // The y = 0 tick keeps its solid foreground line.
    const zero = groups[1].querySelector<SVGGElement>('.tick[stroke]')!
    expect(getComputedStyle(zero.querySelector('line')!).stroke).toBe(
      getComputedStyle(current.element).color,
    )
  })

  test('dashes gridlines only when gridDasharray is set, keeping the frame and zero solid', async () => {
    const current = classicPlot('2')
    await frame()
    const groups = [
      ...current.element.querySelector('[data-layer="grid"]')!.children,
    ] as SVGGElement[]
    for (const group of groups) {
      expect(getComputedStyle(group.querySelector('.domain')!).strokeDasharray).toBe('none')
      for (const tick of group.querySelectorAll<SVGGElement>('.tick')) {
        const dashed = getComputedStyle(tick.querySelector('line')!).strokeDasharray !== 'none'
        expect(dashed).toBe(tick.getAttribute('stroke') === null)
      }
    }
    expect(() => axis('x', { gridDasharray: '' })).toThrow(/gridDasharray/)
  })

  test('dashes default-style gridlines only when gridDasharray is set', async () => {
    const y = axis('y', { position: 'left', grid: true })
    const current = plot({ scales: { y: linearScale({ domain: [0, 1] }) }, axes: [y] })
    await frame()
    const lines = () => [...current.element.querySelectorAll('[data-layer="grid"] line')]
    expect(lines().length).toBeGreaterThan(1)
    expect(lines().some((node) => node.hasAttribute('stroke-dasharray'))).toBe(false)
    y.update({ gridDasharray: '4 2' })
    await frame()
    expect(lines().every((node) => node.getAttribute('stroke-dasharray') === '4 2')).toBe(true)
  })
})

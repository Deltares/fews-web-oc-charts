import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createColumnarSeries } from '../../src/spike/data/columnar-series.js'
import { createSvgLineRenderer } from '../../src/spike/render/svg-line.js'

const renderers: Array<{ destroy(): void }> = []

beforeEach(async () => {
  if (typeof document === 'undefined') return
  await document.fonts.ready
  const style = document.createElement('style')
  style.textContent = '*,*::before,*::after{animation:none!important;transition:none!important}'
  document.head.append(style)
})

afterEach(() => {
  if (typeof document === 'undefined') return
  for (const renderer of renderers.splice(0)) renderer.destroy()
  document.body.replaceChildren()
})

function createSvg(width: number) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('width', String(width))
  svg.setAttribute('height', '100')
  svg.style.cssText = 'animation:none!important;transition:none!important'
  document.body.append(svg)
  return svg
}

describe.skipIf(typeof document === 'undefined')('phase 0 SVG line renderer', () => {
  test('renders a stable deterministic SVG path for a small fixture', () => {
    const series = createColumnarSeries({
      x: new Float64Array([0, 1, 2]),
      y: new Float64Array([0, 1, 0]),
    })
    const renderer = createSvgLineRenderer(createSvg(10), series, {
      domain: [0, 2],
      yDomain: [0, 1],
      range: [0, 10, 0, 10],
    })
    renderers.push(renderer)

    expect(renderer.path.getAttribute('d')).toBe('M0,10L5,0L10,10')
  })

  test('shares cached LOD indices across same-width bindings but not SVG geometry', () => {
    const series = createColumnarSeries({
      x: Float64Array.from({ length: 1000 }, (_, index) => index),
      y: Float64Array.from({ length: 1000 }, (_, index) => Math.sin(index)),
    })
    const first = createSvgLineRenderer(createSvg(100), series, {
      domain: [0, 999],
      yDomain: [-1, 1],
      range: [0, 100, 0, 100],
    })
    const second = createSvgLineRenderer(createSvg(100), series, {
      domain: [0, 999],
      yDomain: [-1, 1],
      range: [0, 100, 20, 80],
    })
    const wider = createSvgLineRenderer(createSvg(200), series, {
      domain: [0, 999],
      yDomain: [-1, 1],
      range: [0, 200, 0, 100],
    })
    renderers.push(first, second, wider)

    expect(first.lod).toBe(second.lod)
    expect(first.lod).not.toBe(wider.lod)
    expect(first.path).not.toBe(second.path)
    expect(first.path.getAttribute('d')).not.toBe(second.path.getAttribute('d'))
    expect(series.canonicalByteLength).toBe(1000 * 2 * Float64Array.BYTES_PER_ELEMENT)
  })

  test('pans cached SVG geometry without accessing source data', () => {
    const series = createColumnarSeries({
      x: Float64Array.from({ length: 1000 }, (_, index) => index),
      y: Float64Array.from({ length: 1000 }, (_, index) => Math.sin(index)),
    })
    const renderer = createSvgLineRenderer(createSvg(100), series, {
      domain: [0, 999],
      yDomain: [-1, 1],
      range: [0, 100, 0, 100],
    })
    renderers.push(renderer)
    const originalPath = renderer.path.getAttribute('d')
    const decimate = vi.spyOn(series, 'decimate')

    renderer.pan(12, -3)

    expect(renderer.path.getAttribute('d')).toBe(originalPath)
    expect(renderer.path.parentElement?.getAttribute('transform')).toBe('translate(12 -3)')
    expect(decimate).not.toHaveBeenCalled()
    renderer.pan(2, 1)
    expect(renderer.path.parentElement?.getAttribute('transform')).toBe('translate(14 -2)')
    expect(decimate).not.toHaveBeenCalled()
  })
})

import { describe, expect, test } from 'vitest'
import { createLegendSwatch, legendSymbolPrimitives, type SymbolSpec } from '../../src/index.js'

describe('legend symbol geometry', () => {
  test('overlays area, dashed stroke and outlined marker with resolved attributes', () => {
    const primitives = legendSymbolPrimitives({
      type: 'composite',
      parts: [
        { type: 'area', fill: 'navy', opacity: 0.25 },
        {
          type: 'line',
          stroke: 'navy',
          strokeWidth: 3,
          strokeDasharray: '6 3',
          strokeLinecap: 'butt',
          strokeLinejoin: 'bevel',
          opacity: 0.7,
        },
        { type: 'marker', shape: 'circle', size: 4, fill: 'white', stroke: 'navy', strokeWidth: 2 },
      ],
    })
    expect(primitives).toEqual([
      {
        type: 'rect',
        attributes: {
          x: 2.5,
          y: 10,
          width: 31,
          height: 7.5,
          fill: 'navy',
          'fill-opacity': 0.25,
          stroke: 'none',
          'stroke-width': 0,
        },
      },
      {
        type: 'line',
        attributes: {
          x1: 2.5,
          y1: 10,
          x2: 33.5,
          y2: 10,
          stroke: 'navy',
          'stroke-width': 3,
          'stroke-dasharray': '6 3',
          'stroke-linecap': 'butt',
          'stroke-linejoin': 'bevel',
          opacity: 0.7,
        },
      },
      {
        type: 'circle',
        attributes: {
          cx: 18,
          cy: 10,
          r: 4,
          fill: 'white',
          stroke: 'navy',
          'stroke-width': 2,
          opacity: undefined,
        },
      },
    ])
  })

  test('stacks all colours bottom-to-top rather than overlaying them', () => {
    const primitives = legendSymbolPrimitives(
      {
        type: 'stack',
        parts: [
          { type: 'area', fill: 'red', opacity: 0.4 },
          { type: 'area', fill: 'blue', opacity: 0.6 },
          { type: 'area', fill: 'green', stroke: 'black', strokeWidth: 2 },
        ],
      },
      { width: 40, height: 28 },
    )
    expect(primitives.map(({ type, attributes }) => ({ type, ...attributes }))).toEqual([
      {
        type: 'rect',
        x: 2,
        y: 18,
        width: 36,
        height: 8,
        fill: 'red',
        'fill-opacity': 0.4,
        stroke: 'none',
        'stroke-width': 0,
      },
      {
        type: 'rect',
        x: 2,
        y: 10,
        width: 36,
        height: 8,
        fill: 'blue',
        'fill-opacity': 0.6,
        stroke: 'none',
        'stroke-width': 0,
      },
      {
        type: 'rect',
        x: 2,
        y: 2,
        width: 36,
        height: 8,
        fill: 'green',
        'fill-opacity': 1,
        stroke: 'black',
        'stroke-width': 2,
      },
    ])
  })

  test('fits marker-only and bar geometry, including small swatches', () => {
    expect(
      legendSymbolPrimitives(
        {
          type: 'marker',
          shape: 'circle',
          size: 4,
          strokeWidth: 2,
        },
        { width: 6, height: 4 },
      )[0],
    ).toMatchObject({
      type: 'circle',
      attributes: { cx: 3, cy: 2, r: 1 },
    })
    expect(
      legendSymbolPrimitives(
        {
          type: 'bar',
          fill: 'orange',
          stroke: 'black',
          strokeWidth: 2,
          opacity: 0.3,
        },
        { width: 40, height: 24 },
      )[0],
    ).toEqual({
      type: 'rect',
      attributes: {
        x: 2,
        y: 2,
        width: 36,
        height: 20,
        fill: 'orange',
        stroke: 'black',
        'stroke-width': 2,
        'fill-opacity': 0.3,
      },
    })
    expect(legendSymbolPrimitives({ type: 'stack', parts: [] })).toEqual([])
    expect(legendSymbolPrimitives({ type: 'composite', parts: [] })).toEqual([])
    expect(legendSymbolPrimitives({ type: 'group' })).toEqual([])
  })

  test.each([0, -1, NaN, Infinity])('rejects invalid dimensions: %s', (value) => {
    const symbol = { type: 'line' } as const
    expect(() => legendSymbolPrimitives(symbol, { width: value })).toThrow(RangeError)
    expect(() => legendSymbolPrimitives(symbol, { height: value })).toThrow(RangeError)
    expect(() => createLegendSwatch(symbol, { width: value })).toThrow(RangeError)
  })
})

describe('SVG legend swatches', () => {
  test('keeps its dimensions and no background under global SVG styling', () => {
    const style = document.createElement('style')
    style.textContent =
      'svg { width: 100%; height: auto; background-image: linear-gradient(red, blue); }'
    const swatch = createLegendSwatch({ type: 'line', stroke: 'red' }, { width: 20, height: 20 })
    document.head.append(style)
    document.body.append(swatch)
    try {
      const computed = getComputedStyle(swatch)
      expect(computed.width).toBe('20px')
      expect(computed.height).toBe('20px')
      expect(computed.backgroundImage).toBe('none')
      expect(swatch.getBoundingClientRect().width).toBe(20)
      expect(swatch.getBoundingClientRect().height).toBe(20)
    } finally {
      swatch.remove()
      style.remove()
    }
  })

  test('renders exactly the pure primitives without undefined attributes or UI', () => {
    const symbol: SymbolSpec = {
      type: 'composite',
      parts: [
        { type: 'line', stroke: '#123456', strokeWidth: 2, strokeDasharray: '4 2' },
        { type: 'marker', shape: 'circle', fill: 'white', stroke: '#123456', size: 3 },
      ],
    }
    const options = { width: 48, height: 24 }
    const swatch = createLegendSwatch(symbol, options)
    expect(swatch.namespaceURI).toBe('http://www.w3.org/2000/svg')
    expect(swatch.getAttribute('viewBox')).toBe('0 0 48 24')
    expect(swatch.getAttribute('width')).toBe('48')
    expect(swatch.getAttribute('height')).toBe('24')
    expect(swatch.getAttribute('aria-hidden')).toBe('true')
    expect(swatch.getAttribute('focusable')).toBe('false')
    const primitives = legendSymbolPrimitives(symbol, options)
    expect(swatch.children.length).toBe(primitives.length)
    primitives.forEach((primitive, index) => {
      const node = swatch.children[index]
      expect(node.localName).toBe(primitive.type)
      for (const [name, value] of Object.entries(primitive.attributes)) {
        expect(node.getAttribute(name)).toBe(value === undefined ? null : String(value))
      }
    })
    expect(swatch.querySelector('text, input, button, foreignObject')).toBeNull()
  })
})

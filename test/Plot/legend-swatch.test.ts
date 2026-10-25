import { describe, expect, test } from 'vitest'
import { createLegendSwatch, legendSymbolPrimitives, type SymbolSpec } from '../../src/index.js'

describe('legend symbol geometry', () => {
  test('renders each marker shape in the legend with the same orientation and open-line styling', () => {
    const shapes = [
      'circle',
      'cross',
      'square',
      'diamond',
      'star',
      'wye',
      'triangle',
      'triangle-up',
      'triangle-down',
      'triangle-left',
      'triangle-right',
      'x',
      'plus',
      'rectangle',
    ] as const
    for (const shape of shapes) {
      const [primitive] = legendSymbolPrimitives({
        type: 'marker',
        shape,
        fill: 'navy',
        stroke: 'black',
        size: 4,
      })
      expect(primitive.type).toBe(shape === 'circle' ? 'circle' : 'path')
      if (primitive.type === 'path') {
        expect(primitive.attributes.d).not.toBe('')
        expect(primitive.attributes.transform).toContain(
          shape === 'triangle-down'
            ? '180'
            : shape === 'triangle-left'
              ? '-90'
              : shape === 'triangle-right'
                ? '90'
                : '0',
        )
        if (shape === 'x' || shape === 'plus') {
          expect(primitive.attributes.fill).toBe('none')
          expect(primitive.attributes.stroke).toBe('black')
        }
      }
    }
    for (const shape of ['x', 'plus'] as const) {
      const [primitive] = legendSymbolPrimitives({ type: 'marker', shape })
      expect(primitive.type).toBe('path')
      if (primitive.type === 'path') {
        expect(primitive.attributes.stroke).toBe('currentColor')
        expect(primitive.attributes['stroke-width']).toBeGreaterThan(0)
      }
    }
  })

  test('overlays a v4 area band, dashed stroke and outlined marker on a 20×20 swatch', () => {
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
          x: 0,
          y: 5,
          width: 20,
          height: 10,
          fill: 'navy',
          'fill-opacity': 0.25,
          stroke: 'none',
          'stroke-width': 0,
        },
      },
      {
        type: 'line',
        attributes: {
          x1: 0,
          y1: 10,
          x2: 20,
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
          cx: 10,
          cy: 10,
          r: Math.sqrt(4 / Math.PI),
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

  test('fits marker-only and centred square bar geometry, including small swatches', () => {
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
        x: 14,
        y: 6,
        width: 12,
        height: 12,
        fill: 'orange',
        stroke: 'black',
        'stroke-width': 2,
        'fill-opacity': 0.3,
      },
    })
    expect(legendSymbolPrimitives({ type: 'stack', parts: [] })).toEqual([])
    expect(legendSymbolPrimitives({ type: 'composite', parts: [] })).toEqual([])
    expect(legendSymbolPrimitives({ type: 'group' })).toEqual([
      {
        type: 'path',
        attributes: {
          d: 'M10,2.5L17,6.5L10,10.5L3,6.5ZM3,10L10,14L17,10M3,13.5L10,17.5L17,13.5',
          fill: 'none',
          stroke: 'currentColor',
          'stroke-width': 1.5,
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
        },
      },
    ])
  })

  test('draws the v4 step bars, rule, arrow, direction and text symbols', () => {
    const shapes = (symbol: SymbolSpec) =>
      legendSymbolPrimitives(symbol).map(({ type, attributes }) => ({ type, ...attributes }))
    expect(shapes({ type: 'steps', fill: 'teal' })).toMatchObject([
      { type: 'rect', x: 0, y: 2, width: 5, height: 18, fill: 'teal' },
      { type: 'rect', x: 5, y: 4, width: 5, height: 16, fill: 'teal' },
      { type: 'rect', x: 10, y: 5, width: 5, height: 15, fill: 'teal' },
    ])
    expect(shapes({ type: 'rule', stroke: 'red', strokeWidth: 2 })).toEqual([
      {
        type: 'line',
        x1: 10,
        y1: 2,
        x2: 10,
        y2: 18,
        stroke: 'red',
        'stroke-width': 2,
        'stroke-dasharray': undefined,
        opacity: undefined,
      },
    ])
    expect(shapes({ type: 'arrow', color: 'blue' })).toMatchObject([
      { type: 'line', x1: 0, y1: 10, x2: 10, y2: 10, stroke: 'blue', 'stroke-width': 1.5 },
      { type: 'path', d: 'M10,10L5,4L20,10L5,16Z', fill: 'blue', stroke: 'none' },
    ])
    expect(shapes({ type: 'direction', color: 'blue' })).toMatchObject([
      { type: 'path', d: 'M10,10L5.2,14L10,2L14.8,14Z', fill: 'blue' },
    ])
    const [label] = legendSymbolPrimitives({ type: 'text', fill: 'green' })
    expect(label).toMatchObject({
      type: 'text',
      text: '+1.0',
      attributes: { x: 10, y: 10, 'text-anchor': 'middle', 'font-size': 10, fill: 'green' },
    })
    expect(createLegendSwatch({ type: 'text' }).querySelector('text')?.textContent).toBe('+1.0')
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

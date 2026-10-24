import { describe, expect, test } from 'vitest'
import { bar, createTable } from '../../src/index.js'
import { computeStackLayout, stackLayout } from '../../src/layout/stack.js'
import { barEndpoints } from '../../src/plot/marks/bar/bar.js'
import { barExtent } from '../../src/plot/marks/bar/bar-geometry.js'

describe('shared columnar stack layout', () => {
  const layers = [
    { id: 'a', y: 'a' },
    { id: 'b', y: 'b' },
    { id: 'c', y: 'c' },
  ]
  const options = { x: 't', layers, layout: 'stacked' as const }
  const endpoints = (layout: ReturnType<typeof computeStackLayout>, row: number) =>
    layout.layers.map((layer) => [layer.lowerAt(row), layer.upperAt(row)])
  const mark = (data: ReturnType<typeof createTable>, layout: 'grouped' | 'stacked' = 'stacked') =>
    bar(data, { ...options, layout, scales: { x: 't', y: 'q' }, width: 10 })

  test.each([
    {
      values: [3, 2, 4],
      expected: [
        [0, 3],
        [3, 5],
        [5, 9],
      ],
      extent: [0, 9],
    },
    {
      values: [-3, -2, -4],
      expected: [
        [-3, 0],
        [-5, -3],
        [-9, -5],
      ],
      extent: [-9, 0],
    },
    {
      values: [3, -2, 4],
      expected: [
        [0, 3],
        [-2, 0],
        [3, 7],
      ],
      extent: [-2, 7],
    },
    {
      values: [0, 0, 0],
      expected: [
        [0, 0],
        [0, 0],
        [0, 0],
      ],
      extent: [0, 0],
    },
    {
      values: [3, NaN, 4],
      expected: [
        [NaN, NaN],
        [NaN, NaN],
        [NaN, NaN],
      ],
      extent: undefined,
    },
  ])('computes exact diverging endpoints for $values', ({ values, expected, extent }) => {
    const data = createTable({ t: [0], a: [values[0]], b: [values[1]], c: [values[2]] })
    const before = layers.map((layer) => data.valueAt(layer.y, 0))
    const layout = stackLayout(data, options)
    expect(endpoints(layout, 0)).toEqual(expected)
    expect(barExtent(mark(data), 'value')).toEqual(extent)
    expect(layers.map((layer) => data.valueAt(layer.y, 0))).toEqual(before)
    expect(stackLayout(data, options)).toBe(layout)
    expect(() => layout.layers[0].lowerAt(-1)).toThrow('outside')
  })

  test('grouped gaps affect only their own slot; zero and empty extents are exact', () => {
    const data = createTable({ t: [0, 1], a: [3, NaN], b: [-2, NaN], c: [4, 0] })
    const grouped = mark(data, 'grouped')
    expect(endpoints(barEndpoints(grouped), 0)).toEqual([
      [0, 3],
      [-2, 0],
      [0, 4],
    ])
    expect(endpoints(barEndpoints(grouped), 1)).toEqual([
      [NaN, NaN],
      [NaN, NaN],
      [0, 0],
    ])
    expect(barExtent(grouped, 'value')).toEqual([-2, 4])
    data.clear()
    expect(barExtent(grouped, 'value')).toBeUndefined()
    expect(barExtent(grouped, 'category')).toBeUndefined()
  })

  test('named stacks keep independent totals, gaps, slots and union extents', () => {
    const data = createTable({ t: [0, 1], a: [3, NaN], b: [4, 2], c: [5, 6], d: [-2, -3] })
    const named = [
      { id: 'a', y: 'a', stack: 'A' },
      { id: 'c', y: 'c', stack: 'B' },
      { id: 'b', y: 'b', stack: 'A' },
      { id: 'd', y: 'd', stack: 'B' },
    ]
    const current = bar(data, {
      x: 't',
      layers: named,
      layout: 'stacked',
      width: 10,
      scales: { x: 't', y: 'q' },
    })
    let layout = barEndpoints(current)
    expect(endpoints(layout, 0)).toEqual([
      [0, 3],
      [0, 5],
      [3, 7],
      [-2, 0],
    ])
    expect(endpoints(layout, 1)).toEqual([
      [NaN, NaN],
      [0, 6],
      [NaN, NaN],
      [-3, 0],
    ])
    expect(layout.layers.map((layer) => layer.slot)).toEqual([0, 1, 0, 1])
    expect(layout.layers[0].positiveAt(0)).toBe(7)
    expect(layout.layers[1].positiveAt(0)).toBe(5)
    expect(layout.layers[1].negativeAt(0)).toBe(-2)
    expect(barExtent(current, 'value')).toEqual([-3, 7])
    expect(barExtent(current, 'value', [0, 0])).toEqual([-2, 7])

    current.update({ layers: named.map((layer) => ({ ...layer, visible: layer.stack === 'B' })) })
    layout = barEndpoints(current)
    expect(layout.slots).toBe(2)
    expect(layout.layers.map((layer) => layer.slot)).toEqual([0, 1, 0, 1])
    expect(endpoints(layout, 1)).toEqual([
      [NaN, NaN],
      [0, 6],
      [NaN, NaN],
      [-3, 0],
    ])
    current.update({ layers: named })
    expect(barExtent(current, 'value')).toEqual([-3, 6]) // replacement retains hidden IDs
    current.update({ layers: named.map((layer) => ({ ...layer, visible: true })) })
    expect(barExtent(current, 'value')).toEqual([-3, 7])

    current.update({ layers: [...named].reverse() })
    expect(barEndpoints(current).layers.map((layer) => layer.slot)).toEqual([0, 1, 0, 1])
    expect(endpoints(barEndpoints(current), 0)).toEqual([
      [-2, 0],
      [0, 4],
      [0, 5],
      [4, 7],
    ])
    current.update({ layers: named.map((layer) => ({ ...layer, stack: 'B' })) })
    expect(barEndpoints(current).slots).toBe(1)
    expect(barExtent(current, 'value')).toEqual([-2, 12])
    current.update({ layers: named.filter((layer) => layer.stack === 'B') })
    expect(barEndpoints(current).slots).toBe(1)
    expect(barExtent(current, 'value')).toEqual([-3, 6])
  })

  test('hiding missing layers repairs only their stack and reorder changes accumulation', () => {
    const data = createTable({ t: [0], a: [3], b: [NaN], c: [4] })
    const current = mark(data)
    current.update({ layers: layers.map((layer) => ({ ...layer, visible: layer.id !== 'b' })) })
    expect(endpoints(barEndpoints(current), 0)).toEqual([
      [0, 3],
      [NaN, NaN],
      [3, 7],
    ])
    current.update({ layers: [...layers].reverse() })
    expect(endpoints(barEndpoints(current), 0)).toEqual([
      [0, 4],
      [NaN, NaN],
      [4, 7],
    ])
    current.update({ layers: layers.map((layer) => ({ ...layer, visible: false })) })
    expect(barExtent(current, 'value')).toBeUndefined()
  })

  test('validates complete replacement arrays and option resets atomically', () => {
    const data = createTable({ t: [0], a: [1], b: [2], c: [3] })
    const current = mark(data)
    const snapshot = current.options.get()
    for (const invalid of [
      [
        { id: 'a', y: 'a', stack: 'A' },
        { id: 'b', y: 'b' },
      ],
      [{ id: 'a', y: 'a', stack: '' }],
      [
        { id: 'a', y: 'a' },
        { id: 'a', y: 'b' },
      ],
      [{ id: 'missing', y: 'missing' }],
    ]) {
      expect(() => current.update({ layers: invalid })).toThrow()
      expect(current.options.get()).toEqual(snapshot)
    }
    expect(() =>
      current.update({ layers: [{ id: 'a', y: 'a', stack: 'A' }], layout: 'grouped' }),
    ).toThrow('Grouped')
    expect(() => current.update({ layout: undefined })).toThrow('require')
    expect(() => current.update({ y: 'a' })).toThrow('mutually')
    expect(() => current.update({ id: 'new' })).toThrow('immutable')
    stackLayout(data, { ...options, layers: [layers[0]] })
    expect(() =>
      // @ts-expect-error Invalid runtime stack IDs must not alias a cached implicit stack.
      current.update({ layers: [{ id: 'a', y: 'a', stack: null }] }),
    ).toThrow('non-empty stack')
    expect(() => current.update({ groupPadding: 1 })).toThrow('[0, 1)')
    current.update({ groupPadding: 0.3, width: 30 })
    current.update({ groupPadding: undefined })
    expect(current.options.get().resolved.groupPadding).toBe(0.1)
    expect(current.options.get().resolved.width).toBe(30)
    expect(() =>
      bar(createTable({ t: [0, 0], a: [1, 2] }), {
        x: 't',
        y: 'a',
        scales: { x: 't', y: 'q' },
        width: 10,
      }),
    ).toThrow('row 1')
    expect(() =>
      mark(createTable({ t: [0], a: [Number.MAX_VALUE], b: [Number.MAX_VALUE], c: [0] })),
    ).toThrow('overflow')
  })

  test('cache shares equivalent consumers but invalidates mutations and bounds old entries', () => {
    const data = createTable({ t: [0], a: [1], b: [2], c: [3] })
    const first = stackLayout(data, options)
    expect(stackLayout(data, { ...options, layers: layers.map((layer) => ({ ...layer })) })).toBe(
      first,
    )
    for (let index = 0; index < 9; index += 1)
      stackLayout(data, { ...options, layers: [{ id: String(index), y: 'a' }] })
    expect(stackLayout(data, options)).not.toBe(first)
    const previous = stackLayout(data, options)
    data.append({ t: [1], a: [4], b: [5], c: [6] })
    expect(stackLayout(data, options)).not.toBe(previous)
    expect(endpoints(stackLayout(data, options), 1)).toEqual([
      [0, 4],
      [4, 9],
      [9, 15],
    ])
    expect(() => previous.layers[0].lowerAt(1)).toThrow('outside')
  })
})

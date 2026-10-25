import { describe, expect, test } from 'vitest'
import { bandScale, bar, createTable, linearScale } from '../../src/index.js'
import { reactive } from '../../src/core/runtime.js'
import { compositeHits } from '../../src/plot/interaction/composite-hit-testing.js'
import { barRectangles } from '../../src/plot/marks/bar/bar-geometry.js'
import { bindScale } from '../../src/scales/scale.js'

describe('composite hit-test indexes', () => {
  test('uses cached row lookup and returns the painted bar layer under the pointer', () => {
    const mark = bar(createTable({ t: ['a', 'b'], lower: [3, 2], upper: [4, 5] }), {
      x: 't',
      scales: { x: 't', y: 'q' },
      layers: [
        { id: 'lower', y: 'lower', stack: 'total' },
        { id: 'upper', y: 'upper', stack: 'total' },
      ],
      layout: 'stacked',
    })
    const scales = {
      t: bindScale(
        bandScale({ domain: ['a', 'b'], padding: 0 }),
        reactive.signal([0, 100] as const),
      ),
      q: bindScale(linearScale({ domain: [0, 10] }), reactive.signal([100, 0] as const)),
    }
    const plot = { x: 0, y: 0, width: 100, height: 100 }
    const rectangles = barRectangles(mark, scales)
    const upper = rectangles.find((rectangle) => rectangle.layerId === 'upper')!
    const hit = compositeHits(
      mark,
      scales,
      { x: upper.x + upper.width / 2, y: upper.y + upper.height / 2 },
      'xy',
      plot,
    )

    expect(hit.map((entry) => entry.layerId)).toEqual(['upper'])
    expect(hit[0].layerLabel).toBe('upper')
    expect(compositeHits(mark, scales, { x: 25, y: 50 }, 'x', plot)).toHaveLength(2)
  })

  test('keeps the implicit bar layer id but omits its label until layers are declared', () => {
    const mark = bar(createTable({ t: ['a'], value: [0.4] }), {
      x: 't',
      y: 'value',
      scales: { x: 't', y: 'q' },
    })
    const scales = {
      t: bindScale(bandScale({ domain: ['a'] }), reactive.signal([0, 100] as const)),
      q: bindScale(linearScale({ domain: [0, 1] }), reactive.signal([100, 0] as const)),
    }
    const hits = () =>
      compositeHits(mark, scales, { x: 50, y: 80 }, 'xy', { x: 0, y: 0, width: 100, height: 100 })
    expect(hits()[0]).toMatchObject({ layerId: 'single', value: 0.4 })
    expect(hits()[0].layerLabel).toBeUndefined()
    mark.update({ y: undefined, layers: [{ id: 'single', y: 'value' }], layout: 'grouped' })
    expect(hits()[0].layerLabel).toBe('single')
    mark.update({ layers: [{ id: 'single', y: 'value', label: 'Rain' }] })
    expect(hits()[0].layerLabel).toBe('Rain')
    mark.update({ layers: undefined, y: 'value' })
    expect(hits()[0].layerLabel).toBeUndefined()
  })
})

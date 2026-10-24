import { describe, expect, test } from 'vitest'
import { bandScale, linearScale } from '../../src/index.js'
import { reactive } from '../../src/core/runtime.js'
import { bindScale } from '../../src/scales/scale.js'
import {
  brushHandleNames,
  moveBounds,
  orderedBounds,
  projectSelection,
  resizeBounds,
  selectionFor,
  validBounds,
} from '../../src/plot/plugins/brush/brush-selection.js'

const region = Object.freeze({ x0: 20, x1: 480, y0: 20, y1: 280 })
const origin = Object.freeze({ x0: 100, x1: 300, y0: 80, y1: 200 })

describe('brush bounds', () => {
  test('orders drag endpoints and validates only the selected axes', () => {
    expect(orderedBounds(300, 200, 100, 80)).toEqual(origin)
    const flat = { ...origin, y1: origin.y0 }
    expect(validBounds(flat, 'x')).toBe(true)
    expect(validBounds(flat, 'y')).toBe(false)
    expect(validBounds(flat, 'xy')).toBe(false)
  })

  test.each([
    ['x', { x0: 280, x1: 480, y0: 80, y1: 200 }],
    ['y', { x0: 100, x1: 300, y0: 160, y1: 280 }],
    ['xy', { x0: 280, x1: 480, y0: 160, y1: 280 }],
    [undefined, origin],
  ] as const)('constrains movement in mode %s without changing the origin', (mode, expected) => {
    expect(moveBounds(origin, region, mode, 900, 900)).toEqual(expected)
    expect(moveBounds(origin, region, mode, -900, -900)).toEqual({
      x0: mode?.includes('x') ? 20 : 100,
      x1: mode?.includes('x') ? 220 : 300,
      y0: mode?.includes('y') ? 20 : 80,
      y1: mode?.includes('y') ? 140 : 200,
    })
  })

  test.each(brushHandleNames)(
    'orders crossed %s resize bounds without mutating the origin',
    (name) => {
      const x = name.includes('w') ? 350 : 50
      const y = name.includes('n') ? 230 : 50
      expect(resizeBounds(origin, name, x, y)).toEqual({
        x0: name.includes('w') ? 300 : name.includes('e') ? 50 : 100,
        x1: name.includes('w') ? 350 : name.includes('e') ? 100 : 300,
        y0: name.includes('n') ? 200 : name.includes('s') ? 50 : 80,
        y1: name.includes('n') ? 230 : name.includes('s') ? 80 : 200,
      })
    },
  )
})

describe('brush selection conversion', () => {
  function scales() {
    return {
      scales: {
        x: bindScale(
          linearScale({ domain: [0, 460], reverse: true }),
          reactive.signal([20, 480] as const),
        ),
        y: bindScale(
          bandScale({ domain: ['a', 'b', 'c'], paddingInner: 0, paddingOuter: 0 }),
          reactive.signal([20, 260] as const),
        ),
      },
      direction: (name: string): 'x' | 'y' => (name === 'x' ? 'x' : 'y'),
    }
  }

  test('round trips reversed continuous and band ranges and freezes published selections', () => {
    const context = scales()
    const bounds = { x0: 100, x1: 300, y0: 100, y1: 180 }
    const selection = selectionFor(bounds, 'xy', context)!
    expect(selection).toEqual({
      mode: 'xy',
      scales: { x: [expect.closeTo(180, 10), expect.closeTo(380, 10)], y: ['b'] },
    })
    expect(Object.isFrozen(selection)).toBe(true)
    expect(Object.isFrozen(selection.scales)).toBe(true)
    expect(Object.isFrozen(selection.scales.x)).toBe(true)
    expect(Object.isFrozen(selection.scales.y)).toBe(true)
    expect(projectSelection(selection, region, context)).toEqual({
      ...bounds,
      x0: expect.closeTo(bounds.x0, 10),
      x1: expect.closeTo(bounds.x1, 10),
    })
  })

  test('clips projected bounds without mutating the region and ignores missing band categories', () => {
    const context = scales()
    expect(projectSelection({ mode: 'x', scales: { x: [-100, 600] } }, region, context)).toEqual(
      region,
    )
    expect(
      projectSelection({ mode: 'y', scales: { y: ['missing', 'b'] } }, region, context),
    ).toEqual({ ...region, y0: 100, y1: 180 })
    expect(
      projectSelection({ mode: 'y', scales: { y: ['missing'] } }, region, context),
    ).toBeUndefined()
  })

  test('rejects empty continuous and band intersections', () => {
    const context = scales()
    expect(selectionFor({ ...region, x1: region.x0 }, 'x', context)).toBeUndefined()
    expect(selectionFor({ ...region, y0: 260 }, 'y', context)).toBeUndefined()
    expect(
      projectSelection({ mode: 'x', scales: { x: [500, 600] } }, region, context),
    ).toBeUndefined()
  })
})

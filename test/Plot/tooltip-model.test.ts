import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  bandScale,
  bar,
  createTable,
  crosshair,
  line,
  linearScale,
  tooltip,
} from '../../src/index.js'
import { reactive } from '../../src/core/runtime.js'
import { computeTooltipModel } from '../../src/plot/plugins/tooltip/tooltip-model.js'
import type { PlotContext } from '../../src/plot/plugins/plugin-definition.js'
import { bindScale } from '../../src/scales/scale.js'
import { barRectangles } from '../../src/plot/marks/bar/bar-geometry.js'

function setup() {
  const first = line({
    id: '<First>',
    x: 'x',
    y: 'y',
    xValues: [5],
    yValues: [20.12345],
    stroke: 'blue',
    markers: { size: 6, fill: 'red', stroke: 'black', strokeWidth: 2 },
  })
  const second = line({
    id: 'Second',
    x: 'x',
    y: 'y',
    xValues: [5],
    yValues: [20.12345],
  })
  const pointer = reactive.signal({ px: 50, py: 50, inside: true, x: new Map<string, number>() })
  const context = {
    scales: {
      x: bindScale(linearScale({ domain: [0, 10] }), reactive.signal([0, 100] as const)),
      y: bindScale(linearScale({ domain: [0, 40] }), reactive.signal([100, 0] as const)),
    },
    inspectCrosshair: vi.fn<PlotContext['inspectCrosshair']>(),
  }
  const pathContext = vi.fn<() => CanvasRenderingContext2D | undefined>()
  const handle = tooltip({ digits: 2 })
  const model = () =>
    computeTooltipModel(
      handle.options.get().resolved,
      context,
      {
        marks: [first, second],
        pointer: pointer.get(),
        region: { x: 0, y: 0, width: 100, height: 100 },
      },
      pathContext,
    )
  return { first, second, context, pointer, pathContext, handle, model }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('tooltip model', () => {
  test('computes text, accessibility and symbols without constructing DOM', () => {
    const { model, pathContext } = setup()
    const result = model()
    expect(result.entries).toHaveLength(2)
    expect(result.entries[0]).toEqual({
      label: '<First>',
      color: 'blue',
      details: ' · x: 5 · y: 20.12',
      accessibleLabel: '<First> · 5 · y: 20.12',
      symbol: { size: 12, radius: '50%', fill: 'red', border: '2px solid black' },
    })
    expect(result.accessibleLabel).toBe('<First> · 5 · y: 20.12; Second · 5 · y: 20.12')
    expect(result.point).toEqual({ x: 50, y: 50 })
    expect(pathContext).not.toHaveBeenCalled()
  })

  test('preserves target order and chooses the first hit on an xy distance tie', () => {
    const { first, second, handle, model } = setup()
    handle.update({ marks: [second, first] })
    expect(model().entries.map((entry) => entry.label)).toEqual(['Second', '<First>'])
    handle.update({ axis: 'xy' })
    expect(model().entries.map((entry) => entry.label)).toEqual(['Second'])
  })

  test('omits x only when requested and returns an empty model outside the plot', () => {
    const { handle, model, pointer } = setup()
    handle.update({ showX: false })
    expect(model().entries[0].details).toBe(' · y: 20.12')
    expect(model().entries[0].accessibleLabel).toBe('<First> · y: 20.12')
    pointer.set({ ...pointer.get(), inside: false })
    expect(model().entries).toEqual([])
    expect(model().accessibleLabel).toBe('')
  })

  test('reuses linked snap hits and suppresses only identically formatted visible coordinates', () => {
    const { first, context, handle, model } = setup()
    const guide = crosshair({ mode: 'xy', snap: { mark: first, axis: 'xy' } })
    const hit = { index: 0, x: 5, y: 20.12345, px: 50, py: 49.691375, distance: 0 }
    const inspection = {
      point: { x: hit.px, y: hit.py },
      visible: true,
      hit,
      hits: [hit],
      layers: [],
      options: guide.options.get().resolved,
      coordinates: [
        {
          axis: 'x' as const,
          scale: 'x',
          value: 5,
          digits: undefined,
          position: 50,
          layerId: undefined,
        },
        {
          axis: 'y' as const,
          scale: 'y',
          value: hit.y,
          digits: 2,
          position: hit.py,
          layerId: undefined,
        },
      ],
    }
    context.inspectCrosshair.mockReturnValue(inspection)
    handle.update({ crosshair: guide })
    expect(model().entries).toHaveLength(1)
    expect(model().entries[0].details).toBe('')
    expect(model().entries[0].accessibleLabel).toBe('<First> · 5 · y: 20.12')
    expect(model().point).toEqual(inspection.point)
    handle.update({ digits: 3 })
    expect(model().entries[0].details).toBe(' · 20.123')
    context.inspectCrosshair.mockReturnValue({ ...inspection, visible: false })
    expect(model().entries).toEqual([])
  })

  test.each(['vertical', 'horizontal'] as const)(
    'formats %s composite layers and keeps their raw values distinct from bounds',
    (orientation) => {
      const mark = bar(
        createTable({ category: ['one'], observed: [3.12345], forecast: [4.23456] }),
        {
          id: 'flow',
          x: 'category',
          scales: orientation === 'vertical' ? { x: 'x', y: 'y' } : { x: 'y', y: 'x' },
          orientation,
          layout: 'stacked',
          layers: [
            { id: 'observed', y: 'observed', stack: 'total' },
            { id: 'forecast', y: 'forecast', stack: 'total', label: 'Forecast', fill: 'red' },
          ],
        },
      )
      const category = bandScale({ domain: ['one'] })
      const value = linearScale({ domain: [0, 10] })
      const scales = {
        x: bindScale(
          orientation === 'vertical' ? category : value,
          reactive.signal([0, 100] as const),
        ),
        y: bindScale(
          orientation === 'vertical' ? value : category,
          reactive.signal([100, 0] as const),
        ),
      }
      const rectangle = barRectangles(mark, scales).find((entry) => entry.layerId === 'forecast')!
      const options = tooltip({ axis: 'xy', digits: 2 }).options.get().resolved
      const result = computeTooltipModel(
        options,
        { scales, inspectCrosshair: vi.fn<PlotContext['inspectCrosshair']>() },
        {
          marks: [mark],
          region: { x: 0, y: 0, width: 100, height: 100 },
          pointer: {
            inside: true,
            px: rectangle.x + rectangle.width / 2,
            py: rectangle.y + rectangle.height / 2,
            x: new Map(),
          },
        },
        () => undefined,
      )
      const categoryLabel = orientation === 'vertical' ? 'x: one' : 'y: one'
      expect(result.entries).toHaveLength(1)
      expect(result.entries[0]).toMatchObject({
        label: 'flow · Forecast',
        color: 'red',
        details: ` · ${categoryLabel} · 4.23 · stack: total · bounds: 3.12–7.36`,
        accessibleLabel: `flow · Forecast · ${orientation === 'vertical' ? 'one' : categoryLabel} · 4.23 · stack: total · bounds: 3.12–7.36`,
        symbol: { size: 8, radius: '1px', fill: 'red', border: undefined },
      })
    },
  )
})

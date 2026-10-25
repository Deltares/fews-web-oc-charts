import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  bandScale,
  bar,
  colorScale,
  createGrid,
  createTable,
  createSeries,
  series,
  crosshair,
  line,
  linearScale,
  heatmap,
  timeScale,
  tooltip,
  type TooltipFormatContext,
} from '../../src/index.js'
import { reactive } from '../../src/core/runtime.js'
import { computeTooltipModel } from '../../src/plot/plugins/tooltip/tooltip-model.js'
import type { PlotContext } from '../../src/plot/plugins/plugin-definition.js'
import { bindScale } from '../../src/scales/scale.js'
import { barRectangles } from '../../src/plot/marks/bar/bar-geometry.js'
import { lineDefinition } from '../../src/plot/marks/line/line-mark.js'
import { resolveTheme } from '../../src/theme/theme.js'
import { lineLegendSymbol } from '../../src/plot/marks/mark-styles.js'

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
    theme: reactive.signal(resolveTheme(document.documentElement, 'light', false)),
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
  test('queries each selected mark through its registered hit function', () => {
    const { first, second, context, pathContext, handle, model } = setup()
    const hits = vi.spyOn(lineDefinition, 'hits')

    expect(model().entries).toHaveLength(2)
    expect(hits).toHaveBeenCalledTimes(2)
    expect(hits).toHaveBeenNthCalledWith(1, first, {
      scales: context.scales,
      point: { x: 50, y: 50 },
      axis: 'x',
      plot: { x: 0, y: 0, width: 100, height: 100 },
      pathContext,
    })
    expect(hits.mock.calls[1][0]).toBe(second)

    hits.mockClear()
    handle.update({ marks: [second] })
    expect(model().entries).toHaveLength(1)
    expect(hits).toHaveBeenCalledTimes(1)
    expect(hits.mock.calls[0][0]).toBe(second)
  })

  test('computes text, accessibility and symbols without constructing DOM', () => {
    const { model, pathContext, first, context } = setup()
    const result = model()
    expect(result.entries).toHaveLength(2)
    expect(result.entries[0]).toEqual({
      label: '<First>',
      color: 'blue',
      details: ' · x: 5 · y: 20.12',
      accessibleLabel: '<First> · 5 · y: 20.12',
      symbol: lineLegendSymbol(first, context.theme.get()),
    })
    expect(result.accessibleLabel).toBe('<First> · 5 · y: 20.12; Second · 5 · y: 20.12')
    expect(result.point).toEqual({ x: 50, y: 50 })
    expect(pathContext).not.toHaveBeenCalled()
  })

  test('formats raw point values with mark context and appends units to visible and accessible text', () => {
    const { first, handle, model } = setup()
    const formatValue = vi.fn((value: string | number, info: TooltipFormatContext) =>
      info.axis === 'y' ? `(${info.defaultText})` : String(value),
    )
    const formatUnit = vi.fn((info: TooltipFormatContext) => (info.axis === 'y' ? 'm' : ''))
    handle.update({ marks: [first], formatValue, formatUnit })
    const result = model()
    expect(result.entries[0].details).toBe(' · x: 5 · y: (20.12) m')
    expect(result.accessibleLabel).toBe('<First> · 5 · y: (20.12) m')
    expect(formatValue).toHaveBeenCalledWith(
      20.12345,
      expect.objectContaining({
        mark: first,
        hit: expect.objectContaining({ index: 0, y: 20.12345 }),
        axis: 'y',
        scale: 'y',
        digits: 2,
        defaultText: '20.12',
      }),
    )
    expect(formatUnit).toHaveBeenCalledWith(expect.objectContaining({ defaultText: '(20.12)' }))
    expect(first.yValues[0]).toBe(20.12345)

    handle.update({ formatValue: undefined, formatUnit: undefined })
    expect(model().entries[0].details).toBe(' · x: 5 · y: 20.12')
  })

  test('keeps locale/time-zone defaults available to value formatters', () => {
    const { context, handle, model } = setup()
    context.scales.x = bindScale(
      timeScale({ domain: [0, 10], locale: 'en-GB', timeZone: 'UTC' }),
      reactive.signal([0, 100] as const),
    )
    handle.update({ formatValue: (_value, info) => `[${info.defaultText}]` })
    const expected = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'UTC',
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(5))
    expect(model().entries[0].details).toBe(` · [${expected}] · y: [20.12]`)
  })

  test('propagates formatter errors and rejects non-string results', () => {
    const { handle, model } = setup()
    const error = new Error('format failed')
    handle.update({
      formatValue: () => {
        throw error
      },
    })
    expect(model).toThrow(error)
    // @ts-expect-error Runtime callers must also return strings.
    handle.update({ formatValue: () => 42 })
    expect(model).toThrow('tooltip.formatValue must return a string.')
    // @ts-expect-error Runtime callers must also return strings.
    handle.update({ formatValue: undefined, formatUnit: () => null })
    expect(model).toThrow('tooltip.formatUnit must return a string.')
  })

  test('preserves target order and chooses the first hit on an xy distance tie', () => {
    const { first, second, handle, model } = setup()
    handle.update({ marks: [second, first] })
    expect(model().entries.map((entry) => entry.label)).toEqual(['Second', '<First>'])
    handle.update({ axis: 'xy' })
    expect(model().entries.map((entry) => entry.label)).toEqual(['Second'])
  })

  test('preserves line dashes, area and marker styles and reacts to style changes', () => {
    const { handle, context, pointer, pathContext } = setup()
    const first = series(createSeries({ x: [5], y: [20] }), {
      x: 'x',
      y: 'y',
      line: { stroke: 'blue' },
      markers: { size: 6, fill: 'red', stroke: 'black', strokeWidth: 2 },
    })
    const model = () =>
      computeTooltipModel(
        handle.options.get().resolved,
        context,
        {
          marks: [first],
          pointer: pointer.get(),
          region: { x: 0, y: 0, width: 100, height: 100 },
        },
        pathContext,
      )
    first.update({
      line: { strokeDasharray: '6 3', width: 3 },
      area: { to: 0, fill: 'orange', opacity: 0.3 },
    })
    expect(model().entries[0].symbol).toMatchObject({
      type: 'composite',
      parts: [
        { type: 'area', fill: 'orange', opacity: 0.3 },
        { type: 'line', stroke: 'blue', strokeWidth: 3, strokeDasharray: '6 3' },
        { type: 'marker', shape: 'circle', size: 6, fill: 'red', stroke: 'black', strokeWidth: 2 },
      ],
    })
    first.update({ line: false, area: false })
    expect(model().entries[0].symbol).toMatchObject({
      type: 'composite',
      parts: [{ type: 'marker', shape: 'circle', fill: 'red' }],
    })
    handle.update({
      formatValue: (_value, info) => `[${info.defaultText}]`,
      formatUnit: (info) => (info.axis === 'y' ? 'm' : ''),
    })
    expect(model().entries[0].details).toBe(' · x: [5] · y: [20] m')
    expect(model().accessibleLabel).toBe('Series 1 · [5] · y: [20] m')
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
    const hits = vi.spyOn(lineDefinition, 'hits')
    const guide = crosshair({ mode: 'xy', snap: { mark: first, axis: 'xy' } })
    const hit = { index: 0, x: 5, y: 20.12345, px: 50, py: 49.691375, distance: 0 }
    const inspection = {
      point: { x: hit.px, y: hit.py },
      visible: true,
      hit,
      hits: [hit],
      layers: [],
      axes: 'xy',
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
    handle.update({ digits: 2, formatValue: (_value, info) => info.defaultText })
    expect(model().entries[0].details).toBe('')
    handle.update({ formatUnit: (info) => (info.axis === 'y' ? 'm' : '') })
    expect(model().entries[0].details).toBe(' · 20.12 m')
    expect(model().entries[0].accessibleLabel).toBe('<First> · 5 · y: 20.12 m')
    handle.update({ formatUnit: undefined, formatValue: (_value, info) => `[${info.defaultText}]` })
    expect(model().entries[0].details).toBe(' · x: [5] · [20.12]')
    context.inspectCrosshair.mockReturnValue({ ...inspection, visible: false })
    expect(model().entries).toEqual([])
    expect(hits).not.toHaveBeenCalled()
  })

  test.each([
    { layers: undefined, names: ['rain'] },
    {
      layers: [
        { id: 'single', y: 'value' },
        { id: 'forecast', y: 'value', label: 'Forecast' },
      ],
      names: ['rain · single', 'rain · Forecast'],
    },
  ])('omits unstacked bounds and only names declared layers ($names)', ({ layers, names }) => {
    const { context, pointer, pathContext } = setup()
    const mark = bar(createTable({ category: [5], value: [0.4] }), {
      id: 'rain',
      x: 'category',
      y: layers ? undefined : 'value',
      scales: { x: 'x', y: 'y' },
      width: 20,
      layers,
      layout: layers ? 'grouped' : undefined,
    })
    const formatRange = vi.fn(
      (_lower: string | number, _upper: string | number, info: TooltipFormatContext) =>
        info.defaultText,
    )
    const handle = tooltip({ showX: false, formatRange })
    const model = () =>
      computeTooltipModel(
        handle.options.get().resolved,
        context,
        {
          marks: [mark],
          pointer: pointer.get(),
          region: { x: 0, y: 0, width: 100, height: 100 },
        },
        pathContext,
      )
    expect(model().entries.map((entry) => entry.label)).toEqual(names)
    for (const entry of model().entries) {
      expect(entry.details).toBe(' · 0.4')
      expect(entry.accessibleLabel).toBe(`${entry.label} · 0.4`)
    }
    expect(formatRange).not.toHaveBeenCalled()

    handle.update({ bounds: 'always', formatUnit: (info) => (info.axis === 'y' ? 'mm' : '') })
    for (const entry of model().entries) {
      expect(entry.details).toBe(' · 0.4 mm · bounds: 0–0.4 mm')
      expect(entry.accessibleLabel).toBe(`${entry.label}${entry.details}`)
    }
    expect(formatRange).toHaveBeenCalled()

    for (const bounds of ['never', undefined] as const) {
      handle.update({ bounds })
      for (const entry of model().entries) {
        expect(entry.details).toBe(' · 0.4 mm')
        expect(entry.accessibleLabel).toBe(`${entry.label} · 0.4 mm`)
      }
    }
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
      const handle = tooltip({ axis: 'xy', digits: 2 })
      const model = () =>
        computeTooltipModel(
          handle.options.get().resolved,
          {
            scales,
            theme: reactive.signal(resolveTheme(document.documentElement, 'light', false)),
            inspectCrosshair: vi.fn<PlotContext['inspectCrosshair']>(),
          },
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
      const result = model()
      const categoryLabel = orientation === 'vertical' ? 'x: one' : 'y: one'
      expect(result.entries).toHaveLength(1)
      expect(result.entries[0]).toMatchObject({
        label: 'flow · Forecast',
        color: 'red',
        details: ` · ${categoryLabel} · 4.23 · stack: total · bounds: 3.12–7.36`,
        accessibleLabel: `flow · Forecast · ${orientation === 'vertical' ? 'one' : categoryLabel} · 4.23 · stack: total · bounds: 3.12–7.36`,
        symbol: { type: 'bar', fill: 'red' },
      })
      const axis = orientation === 'vertical' ? 'y' : 'x'
      const formatRange = vi.fn(
        (lower: string | number, upper: string | number, info: TooltipFormatContext) =>
          `[${info.defaultText}] (${lower}, ${upper})`,
      )
      handle.update({
        formatValue: (_value, info) =>
          info.axis === axis ? `<${info.defaultText}>` : info.defaultText,
        formatUnit: (info) => (info.axis === axis ? 'm' : ''),
      })
      expect(model().entries[0].details).toBe(
        ` · ${categoryLabel} · <4.23> m · stack: total · bounds: <3.12>–<7.36> m`,
      )
      handle.update({ formatRange })
      const formatted = model().entries[0]
      expect(formatted.details).toBe(
        ` · ${categoryLabel} · <4.23> m · stack: total · bounds: [<3.12>–<7.36>] (3.12345, 7.35801) m`,
      )
      expect(formatted.accessibleLabel).toContain(formatted.details.slice(3 + categoryLabel.length))
      expect(formatRange).toHaveBeenCalledWith(
        3.12345,
        7.35801,
        expect.objectContaining({
          mark,
          axis,
          scale: axis,
          digits: 2,
          defaultText: '<3.12>–<7.36>',
          hit: expect.objectContaining({ layerId: 'forecast', stack: 'total' }),
        }),
      )
      formatRange.mockClear()
      handle.update({ bounds: 'never' })
      expect(model().entries[0].details).toBe(` · ${categoryLabel} · <4.23> m · stack: total`)
      expect(model().accessibleLabel).not.toContain('bounds:')
      expect(formatRange).not.toHaveBeenCalled()
      handle.update({ bounds: 'always' })
      expect(model().entries[0].details).toBe(formatted.details)
      handle.update({ bounds: undefined })
      expect(model().entries[0].details).toBe(formatted.details)
      // @ts-expect-error Runtime callers must also return strings.
      handle.update({ formatRange: () => false })
      expect(model).toThrow('tooltip.formatRange must return a string.')
    },
  )

  test('formats heatmap values and both coordinate ranges, with one unit per range', () => {
    const { context, pointer, pathContext } = setup()
    const mark = heatmap(createGrid({ xEdges: [0, 10], yEdges: [0, 40], values: [1.2345] }), {
      id: 'grid',
      scales: { x: 'x', y: 'y' },
      color: colorScale({ colors: ['black', 'white'] }),
    })
    const handle = tooltip({ digits: 2 })
    const model = () =>
      computeTooltipModel(
        handle.options.get().resolved,
        context,
        {
          marks: [mark],
          pointer: pointer.get(),
          region: { x: 0, y: 0, width: 100, height: 100 },
        },
        pathContext,
      )
    expect(model().entries[0].details).toBe(' · x: 0–10 · y: 0–40 · value: 1.23')
    const formatRange = vi.fn(
      (_lower: string | number, _upper: string | number, info: TooltipFormatContext) =>
        `[${info.defaultText}]`,
    )
    const formatValue = vi.fn(
      (_value: string | number, info: TooltipFormatContext) => info.defaultText,
    )
    handle.update({
      formatRange,
      formatValue,
      formatUnit: (info) => (info.axis === 'value' ? 'K' : 'm'),
    })
    expect(model().entries[0].details).toBe(' · x: [0–10] m · y: [0–40] m · value: 1.23 K')
    expect(model().accessibleLabel).toBe('grid · x: [0–10] m · y: [0–40] m · value: 1.23 K')
    expect(formatValue).toHaveBeenCalledWith(
      1.2345,
      expect.objectContaining({
        mark,
        axis: 'value',
        scale: undefined,
        digits: 2,
        defaultText: '1.23',
      }),
    )
    expect(formatRange).toHaveBeenCalledWith(
      0,
      10,
      expect.objectContaining({ axis: 'x', scale: 'x' }),
    )
    handle.update({ bounds: 'never' })
    expect(model().entries[0].details).toBe(' · x: [0–10] m · y: [0–40] m · value: 1.23 K')
    formatRange.mockClear()
    handle.update({ showX: false })
    expect(model().entries[0].details).toBe(' · y: [0–40] m · value: 1.23 K')
    expect(formatRange).toHaveBeenCalledTimes(1)
    handle.update({ formatRange: undefined, formatUnit: undefined, formatValue: undefined })
    expect(model().entries[0].details).toBe(' · y: 0–40 · value: 1.23')
  })
})

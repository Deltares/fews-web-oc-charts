import { describe, expect, test } from 'vitest'
import { linearScale, timeScale, bandScale, degreesScale, axis, layout } from '../../src/index.js'

describe('named scale domain state', () => {
  test('owns input arrays and resolves nice, includeZero, symmetric and defaults', () => {
    const input = [2, 8]
    const scale = linearScale({ domain: input, includeZero: true, nice: true })
    input[1] = 100
    expect(scale.domain.get()).toEqual([0, 8])
    scale.update({ symmetric: true })
    expect(scale.domain.get()).toEqual([-8, 8])
    scale.update({ domain: undefined, defaultDomain: [4, 10], symmetric: undefined })
    expect(scale.domain.get()).toEqual([0, 10])
    scale.update({ includeZero: undefined })
    expect(scale.domain.get()).toEqual([4, 10])
    expect(degreesScale().domain.get()).toEqual([0, 360])
  })

  test('rejects invalid updates without publishing partial state', () => {
    const scale = linearScale({ domain: [1, 5] })
    expect(() => scale.update({ domain: [5, 1], reverse: true })).toThrow(/ascending pair/)
    expect(scale.domain.get()).toEqual([1, 5])
    expect(scale.options.get().resolved.reverse).toBe(false)
    expect(() => scale.domain.set([NaN, 2])).toThrow(/finite numbers/)
    expect(() => timeScale({ domain: [0, 9e15] })).toThrow(/Date range/)
    expect(() => timeScale({ timeZone: 'invalid' })).toThrow()
    expect(() => bandScale({ domain: ['a', 'a'] })).toThrow(/unique strings/)
    expect(() => linearScale({ padding: 1 })).toThrow(/less than 1/)
    // @ts-expect-error null is not an unset alias.
    expect(() => scale.update({ domain: null })).toThrow(/scale.domain/)
    expect(() =>
      linearScale({ domain: [-Number.MAX_VALUE, Number.MAX_VALUE], padding: 0.5 }),
    ).toThrow(/overflowed/)
    // @ts-expect-error Unknown options must fail at runtime as well as compile time.
    expect(() => scale.update({ type: 'band' })).toThrow(/scale.type/)
  })

  test('retains explicit no-op state without scheduling an effective change', () => {
    const scale = linearScale()
    const version = scale.options.version
    scale.update({ reverse: false })
    expect(scale.options.get().explicit.reverse).toBe(false)
    expect(scale.options.version).toBe(version)
    scale.update({ reverse: undefined })
    expect(scale.options.get().explicit.reverse).toBeUndefined()
    expect(scale.options.version).toBe(version)
  })

  test('validates independent categorical padding without changing defaults', () => {
    const scale = bandScale({ paddingInner: 0.2, paddingOuter: 0.4 })
    expect(scale.options.get().resolved).toMatchObject({
      paddingInner: 0.2,
      paddingOuter: 0.4,
    })
    expect(() => scale.update({ paddingInner: 1 })).toThrow()
    expect(scale.options.get().resolved.paddingInner).toBe(0.2)
    expect(() => linearScale({ paddingOuter: 0.1 })).toThrow()
    scale.update({ paddingInner: undefined })
    expect(scale.options.get().resolved.paddingInner).toBeUndefined()
  })

  test('axis options support callback reset and reject immutable ID changes', () => {
    const formatter = () => 'label'
    const handle = axis('q', { id: 'axis', label: 'Flow', grid: true, format: formatter })
    expect(handle.options.get().resolved.format).toBe(formatter)
    handle.update({ label: '', grid: false, format: undefined })
    expect(handle.options.get().resolved).toMatchObject({ label: '', grid: false })
    expect(handle.options.get().resolved.format).toBeUndefined()
    expect(() => handle.update({ id: undefined })).toThrow(/immutable/)
    expect(() => handle.update({ tickCount: 0 })).toThrow(/positive integer/)
  })

  test('validates axis crossings without publishing invalid updates', () => {
    const handle = axis('q', { crossAt: { scale: 'x', value: 0 } })
    handle.update({ crossAt: { value: 'category' } })
    expect(handle.options.get().resolved.crossAt).toEqual({ scale: 'x', value: 'category' })
    const version = handle.options.version
    expect(() => handle.update({ crossAt: { scale: '' } })).toThrow(
      'axis.crossAt.scale must name a plot scale.',
    )
    for (const value of [NaN, Infinity, -Infinity]) {
      expect(() => handle.update({ crossAt: { value } })).toThrow(
        new TypeError('axis.crossAt.value must be a finite number or string.'),
      )
    }
    // @ts-expect-error Unknown crossing options must fail at runtime as well as compile time.
    expect(() => handle.update({ crossAt: { unknown: true } })).toThrow(
      'Unknown option "axis.crossAt.unknown".',
    )
    expect(handle.options.version).toBe(version)
    expect(handle.options.get().resolved.crossAt).toEqual({ scale: 'x', value: 'category' })
    handle.update({ crossAt: undefined })
    expect(handle.options.get().resolved.crossAt).toBeUndefined()
  })

  test('validates axis time formatting without publishing invalid updates', () => {
    const handle = axis('t', { locale: 'en-US', timeZone: 'UTC' })
    const version = handle.options.version
    // @ts-expect-error Non-string locales must fail at runtime as well as compile time.
    expect(() => handle.update({ locale: 42 })).toThrow('axis.locale must be a string.')
    // @ts-expect-error Non-string time zones must fail at runtime as well as compile time.
    expect(() => handle.update({ timeZone: 42 })).toThrow('axis.timeZone must be a string.')
    expect(() => handle.update({ locale: 'invalid_locale' })).toThrow(RangeError)
    expect(() => handle.update({ timeZone: 'invalid' })).toThrow(RangeError)
    expect(handle.options.version).toBe(version)
    expect(handle.options.get().resolved).toMatchObject({ locale: 'en-US', timeZone: 'UTC' })
    handle.update({ locale: undefined, timeZone: undefined })
    expect(handle.options.get().resolved.locale).toBeUndefined()
    expect(handle.options.get().resolved.timeZone).toBeUndefined()
  })
})

describe('pure plot layout', () => {
  test('stacks axes in array order from the plot outwards', () => {
    const result = layout(
      { width: 500, height: 300 },
      [
        { position: 'left', thickness: 30 },
        { position: 'left', thickness: 40 },
        { position: 'bottom', thickness: 20 },
      ],
      { top: 10, right: 10, bottom: 10, left: 10 },
      20,
    )
    expect(result.plot).toEqual({ x: 80, y: 30, width: 410, height: 240 })
    expect(result.axes[0]).toEqual({ x: 50, y: 30, width: 30, height: 240 })
    expect(result.axes[1]).toEqual({ x: 10, y: 30, width: 40, height: 240 })
    expect(result.title).toEqual({ x: 80, y: 10, width: 410, height: 20 })
    expect(Object.isFrozen(result)).toBe(true)
  })

  test('supports zero-sized containers and rejects invalid geometry', () => {
    expect(layout({ width: 0, height: 0 }).plot).toEqual({ x: 0, y: 0, width: 0, height: 0 })
    expect(() => layout({ width: -1, height: 100 })).toThrow(/size.width/)
    expect(() =>
      layout({ width: 100, height: 100 }, [{ position: 'left', thickness: NaN }]),
    ).toThrow(/axis.thickness/)
  })
})

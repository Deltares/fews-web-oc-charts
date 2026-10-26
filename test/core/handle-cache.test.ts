import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  axis,
  brush,
  crosshair,
  handleCache,
  linearScale,
  timeScale,
  zoom,
  type ScaleHandle,
} from '../../src/index.js'

describe('handleCache', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', () => 0)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  test('reuses handles and keeps live state when the configuration is unchanged', () => {
    const handles = handleCache()
    const build = (domain: [number, number]) =>
      handles.collect(() => handles.use('y', linearScale, { domain, nice: false }))
    const first = build([0, 10])
    const typed: ScaleHandle<'linear'> = first
    typed.domain.set([2, 4])

    const version = first.options.version
    expect(build([0, 10])).toBe(first)
    expect(first.options.version).toBe(version)
    expect(first.domain.get()).toEqual([2, 4])

    expect(build([0, 20])).toBe(first)
    expect(first.options.get().explicit).toEqual({ domain: [0, 20], nice: false })
    expect(first.domain.get()).toEqual([0, 20])
  })

  test('unsets options removed from the configuration, including nested ones', () => {
    const handles = handleCache()
    const first = handles.use('x', axis, 'x', {
      label: 'Time',
      position: 'bottom',
      grid: true,
    })
    expect(first.options.get().explicit).toMatchObject({ label: 'Time', grid: true })
    expect(handles.use('x', axis, 'x', { position: 'bottom' })).toBe(first)
    expect(first.options.get().explicit).toEqual({ position: 'bottom' })

    const cross = handles.use('crosshair', crosshair, { mode: 'x', labels: { x: 'x', y: 'y' } })
    expect(handles.use('crosshair', crosshair, { labels: { x: 'x' } })).toBe(cross)
    expect(cross.options.get().explicit).toEqual({ labels: { x: 'x' } })
  })

  test('recreates handles when the factory or identity arguments change', () => {
    const handles = handleCache()
    const wheel = handles.use('zoom', zoom, { wheel: 'x' })
    expect(handles.use('zoom', zoom, {})).toBe(wheel)
    expect(wheel.options.get().explicit).toEqual({})
    const time = handles.use('x', timeScale, {})
    expect(handles.use('x', timeScale)).toBe(time)
    const linear = handles.use('x', linearScale, {})
    expect(linear).not.toBe(time)
    expect(linear.kind).toBe('linear')

    const left = handles.use('axis', axis, 'y0', { position: 'left' })
    expect(handles.use('axis', axis, 'y0', { position: 'right' })).toBe(left)
    expect(handles.use('axis', axis, 'y1', { position: 'right' })).not.toBe(left)
  })

  test('compares nested library handles by identity', () => {
    const handles = handleCache()
    const first = linearScale()
    const second = linearScale()
    const overview = handles.use('brush', brush, { persistent: true, targets: { x: first } })
    const version = overview.options.version
    handles.use('brush', brush, { persistent: true, targets: { x: first } })
    expect(overview.options.version).toBe(version)
    handles.use('brush', brush, { persistent: true, targets: { x: second } })
    expect(overview.options.get().resolved.targets?.x).toBe(second)
  })

  test('collect forgets unused keys, rejects duplicates and keeps entries on failure', () => {
    const handles = handleCache()
    const [a] = handles.collect(() => [
      handles.use('a', linearScale),
      handles.use('b', linearScale),
    ])
    expect(handles.size).toBe(2)
    handles.collect(() => handles.use('a', linearScale))
    expect(handles.has('b')).toBe(false)
    expect(() =>
      handles.collect(() => {
        handles.use('a', linearScale)
        handles.use('a', linearScale)
      }),
    ).toThrow(/used twice/)
    expect(() =>
      handles.collect(() => {
        throw new Error('build failed')
      }),
    ).toThrow(/build failed/)
    expect(handles.collect(() => handles.use('a', linearScale))).toBe(a)
    expect(() => handles.collect(() => handles.collect(() => 1))).toThrow(/nested/)

    expect(handles.delete('a')).toBe(true)
    expect(handles.use('a', linearScale)).not.toBe(a)
    handles.clear()
    expect(handles.size).toBe(0)
  })

  test('validates keys, factories and returned handles', () => {
    const handles = handleCache()
    expect(() => handles.use('', linearScale)).toThrow(/non-empty/)
    expect(() => handles.use('a', (() => ({})) as unknown as typeof linearScale)).toThrow(/update/)
    expect(handles.size).toBe(0)
  })

  test('keeps the previous options when an update is rejected', () => {
    const handles = handleCache()
    const scale = handles.use('y', linearScale, { domain: [0, 1] })
    expect(() => handles.use('y', linearScale, { domain: [0, NaN] })).toThrow()
    expect(scale.domain.get()).toEqual([0, 1])
    scale.domain.set([5, 6])
    handles.use('y', linearScale, { domain: [0, 1] })
    expect(scale.domain.get()).toEqual([5, 6])
  })
})

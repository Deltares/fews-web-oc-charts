import { describe, expect, test } from 'vitest'
import { reactive } from '../../src/core/runtime.js'
import { bandScale, bindScale, linearScale } from '../../src/scales/scale.js'
import { crosshair } from '../../src/plot/plugins/crosshair/crosshair.js'
import {
  projectSharedPointer,
  publishSharedPointer,
  releaseSharedPointer,
  sharedPointer,
} from '../../src/sync/shared-pointer.js'

describe('shared domain pointer state and projection', () => {
  test('owns immutable snapshots and suppresses identical publications from one source', () => {
    const pointer = sharedPointer()
    const source = Symbol()
    const scale = linearScale({ domain: [0, 100] })
    const values = [{ scale, value: 25 }]
    publishSharedPointer(pointer, source, values)
    const snapshot = pointer.state.get()
    values[0].value = 99
    values.push({ scale, value: 30 })
    expect(snapshot.values).toEqual([{ scale, value: 25 }])
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(Object.isFrozen(snapshot.values)).toBe(true)
    expect(Object.isFrozen(snapshot.values[0])).toBe(true)
    const version = pointer.state.version
    publishSharedPointer(pointer, source, [{ scale, value: 25 }])
    expect(pointer.state.version).toBe(version)
    expect(pointer.state.get()).toBe(snapshot)
    expect(reactive.isSignal(pointer.state)).toBe(true)
  })

  test('last publisher owns state; old leave/destroy never clears the new source', () => {
    const pointer = sharedPointer()
    const scale = linearScale()
    const first = Symbol()
    const second = Symbol()
    publishSharedPointer(pointer, first, [{ scale, value: 0.25 }])
    publishSharedPointer(pointer, second, [{ scale, value: 0.75 }])
    const state = pointer.state.get()
    releaseSharedPointer(pointer, first)
    publishSharedPointer(pointer, first, [])
    expect(pointer.state.get()).toBe(state)
    releaseSharedPointer(pointer, second)
    expect(pointer.state.get()).toEqual({ active: false, source: undefined, values: [] })
    const version = pointer.state.version
    releaseSharedPointer(pointer, second)
    expect(pointer.state.version).toBe(version)
  })

  test('projects shared identities through unequal, reversed bindings and domain changes', () => {
    const pointer = sharedPointer()
    const scale = linearScale({ domain: [0, 100], reverse: true })
    const region = { x: 20, y: 10, width: 760, height: 260 }
    const binding = bindScale(scale, reactive.signal([20, 780] as const))
    const project = () =>
      projectSharedPointer(pointer, 'xy', {}, { differentLocalName: binding }, () => 'x', region)
    publishSharedPointer(pointer, Symbol(), [{ scale, value: 25 }])
    expect(project()).toEqual({ point: { x: 590, y: 140 }, axes: 'x', inside: true })
    const version = pointer.state.version
    scale.domain.set([0, 200])
    expect(project().point.x).toBe(685)
    expect(pointer.state.version).toBe(version)
    scale.domain.set([50, 100])
    expect(project().inside).toBe(false)
    expect(pointer.state.get().active).toBe(true)
    scale.domain.set([0, 100])
    expect(project().inside).toBe(true)
    expect(pointer.state.version).toBe(version)
  })

  test.each(['x', 'y', 'xy'] as const)(
    'filters %s directions, requested modes and unrelated identities',
    (by) => {
      const pointer = sharedPointer({ by })
      const x = linearScale({ domain: [0, 100] })
      const y = linearScale({ domain: [0, 100] })
      const unrelated = linearScale({ domain: [0, 100] })
      const region = { x: 20, y: 10, width: 760, height: 260 }
      const scales = {
        t: bindScale(x, reactive.signal([20, 780] as const)),
        q: bindScale(y, reactive.signal([270, 10] as const)),
        other: bindScale(unrelated, reactive.signal([20, 780] as const)),
      }
      const direction = (name: string) => (name === 'q' ? 'y' : 'x')
      publishSharedPointer(pointer, Symbol(), [
        { scale: x, value: 25 },
        { scale: y, value: 75 },
      ])
      const result = projectSharedPointer(pointer, 'xy', {}, scales, direction, region)
      expect(result.axes).toBe(by)
      expect(result.point.x).toBe(by.includes('x') ? 210 : 400)
      expect(result.point.y).toBe(by.includes('y') ? 75 : 140)
      expect(projectSharedPointer(pointer, 'x', {}, scales, direction, region).inside).toBe(
        by.includes('x'),
      )
      expect(
        projectSharedPointer(pointer, 'xy', {}, { other: scales.other }, direction, region).inside,
      ).toBe(false)
      expect(
        projectSharedPointer(pointer, 'xy', {}, scales, direction, { ...region, width: 0 }).inside,
      ).toBe(false)
    },
  )

  test('clips xy axes independently and honors an explicit local binding preference', () => {
    const pointer = sharedPointer({ by: 'xy' })
    const scale = linearScale({ domain: [0, 100] })
    const y = linearScale({ domain: [0, 100] })
    const region = { x: 20, y: 10, width: 760, height: 260 }
    const scales = {
      a: bindScale(scale, reactive.signal([20, 780] as const)),
      b: bindScale(scale, reactive.signal([20, 400] as const)),
      y: bindScale(y, reactive.signal([270, 10] as const)),
    }
    publishSharedPointer(pointer, Symbol(), [
      { scale, value: 25 },
      { scale: y, value: 200 },
    ])
    const projected = projectSharedPointer(
      pointer,
      'xy',
      { x: 'b' },
      scales,
      (name) => (name === 'y' ? 'y' : 'x'),
      region,
    )
    expect(projected).toEqual({ point: { x: 115, y: 140 }, axes: 'x', inside: true })
  })

  test('projects categories and hides missing categories without corrupting shared state', () => {
    const pointer = sharedPointer()
    const scale = bandScale({ domain: ['a', 'b', 'c'] })
    const binding = bindScale(scale, reactive.signal([0, 300] as const))
    const region = { x: 0, y: 0, width: 300, height: 200 }
    publishSharedPointer(pointer, Symbol(), [{ scale, value: 'b' }])
    const project = () => projectSharedPointer(pointer, 'x', {}, { x: binding }, () => 'x', region)
    expect(project().point.x).toBe(binding.project('b'))
    expect(project().inside).toBe(true)
    scale.domain.set(['a', 'c'])
    expect(project().inside).toBe(false)
    expect(pointer.state.get().values[0].value).toBe('b')
  })

  test('clips extreme out-of-domain values before projection can overflow', () => {
    const pointer = sharedPointer()
    const scale = linearScale({ domain: [0, 1e300] })
    const binding = bindScale(scale, reactive.signal([0, 500] as const))
    const region = { x: 0, y: 0, width: 500, height: 200 }
    publishSharedPointer(pointer, Symbol(), [{ scale, value: 1e300 }])
    scale.domain.set([0, 1e-300])
    expect(projectSharedPointer(pointer, 'x', {}, { x: binding }, () => 'x', region).inside).toBe(
      false,
    )
    expect(pointer.state.get().active).toBe(true)
  })

  test('validates options and keeps shared handles atomic in crosshair updates', () => {
    expect(() => sharedPointer({ by: 'bad' as 'x' })).toThrow(/by/)
    expect(() => sharedPointer({ unknown: true } as object)).toThrow(/Unknown option/)
    const pointer = sharedPointer({ by: 'xy' })
    const handle = crosshair({ pointer })
    expect(handle.options.get().resolved.pointer).toBe(pointer)
    expect(() => handle.update({ pointer: { by: 'x' } })).toThrow(/sharedPointer/)
    expect(handle.options.get().resolved.pointer).toBe(pointer)
    handle.update({ pointer: undefined })
    expect(handle.options.get().resolved.pointer).toBeUndefined()
  })
})

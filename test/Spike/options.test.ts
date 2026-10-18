import { describe, expect, test } from 'vitest'
import { createOptionState } from '../../src/spike/core/options.js'

interface Options {
  line: {
    stroke: string
    width: number
    dash: number[]
  }
  markers: boolean | { radius: number }
  limit: number
  label: string
  description?: string | null
  onSelect: (value: number) => number
  store: { getValue(): number }
}

function makeDefaults(): Options {
  return {
    line: { stroke: 'navy', width: 1, dash: [] },
    markers: { radius: 2 },
    limit: 10,
    label: 'default',
    description: 'inherited',
    onSelect: (value) => value,
    store: { getValue: () => 0 },
  }
}

describe('phase 1 runtime option state', () => {
  test('preserves empty option objects so optional components can be enabled with defaults', () => {
    const state = createOptionState<{ markers: false | { size?: number } }>(
      { markers: {} },
      { defaults: () => ({ markers: false }) },
    )
    expect(state.getSnapshot().resolved.markers).toEqual({})
    state.update({ markers: { size: 4 } })
    state.update({ markers: { size: undefined } })
    expect(state.getSnapshot().resolved.markers).toEqual({})
    state.update({ markers: undefined })
    expect(state.getSnapshot().resolved.markers).toBe(false)
    state.update({ markers: {} })
    expect(state.getSnapshot().resolved.markers).toEqual({})
  })

  test('patches nested values and unsets overrides back to current defaults', () => {
    let inheritedStroke = 'navy'
    const state = createOptionState<Options>(
      {
        line: { stroke: 'red', width: 2, dash: [] },
        markers: false,
        limit: 0,
        label: '',
        onSelect: (value) => value,
        store: { getValue: () => 1 },
      },
      {
        defaults: () => ({
          ...makeDefaults(),
          line: { ...makeDefaults().line, stroke: inheritedStroke },
        }),
      },
    )

    expect(
      state.update({
        line: { width: 3, stroke: undefined },
        markers: undefined,
        description: null,
      }),
    ).toBe(true)
    expect(state.getSnapshot().resolved).toMatchObject({
      line: { stroke: 'navy', width: 3 },
      markers: { radius: 2 },
      limit: 0,
      label: '',
      description: null,
    })
    expect(state.update({ description: undefined })).toBe(true)
    expect(state.getSnapshot().resolved.description).toBe('inherited')

    inheritedStroke = 'teal'
    expect(state.getSnapshot().resolved.line.stroke).toBe('teal')
    expect(state.update({ line: undefined })).toBe(true)
    expect(state.getSnapshot().resolved.line).toEqual({
      stroke: 'teal',
      width: 1,
      dash: [],
    })
  })

  test('replaces arrays and preserves callback and atomic reference identity', () => {
    const onSelect = (value: number) => value * 2
    const store = { getValue: () => 42 }
    const dash = [3, 4]
    const state = createOptionState<Options>(
      {
        line: { stroke: 'red', width: 2, dash: [1, 2] },
        markers: false,
        limit: 4,
        label: 'custom',
        onSelect: (value) => value,
        store: { getValue: () => 0 },
      },
      {
        defaults: makeDefaults,
        isAtomicReference: (value) => value === store,
      },
    )

    state.update({ line: { dash }, onSelect, store })
    dash[0] = 99
    const snapshot = state.getSnapshot()
    expect(snapshot.resolved.line.dash).toEqual([3, 4])
    expect(snapshot.resolved.onSelect).toBe(onSelect)
    expect(snapshot.resolved.store).toBe(store)
  })

  test('setConfig replaces prior nested overrides and resets omitted options', () => {
    const state = createOptionState<Options>(
      {
        line: { stroke: 'red', width: 5, dash: [1] },
        markers: false,
        limit: 0,
        label: 'custom',
        onSelect: (value) => value,
        store: { getValue: () => 1 },
      },
      { defaults: makeDefaults },
    )

    expect(
      state.setConfig({
        line: { stroke: 'green', width: 2, dash: [] },
        markers: { radius: 4 },
        limit: 10,
        label: 'next',
        onSelect: (value) => value,
        store: { getValue: () => 2 },
      }),
    ).toBe(true)
    expect(state.getSnapshot().explicit).toMatchObject({
      line: { stroke: 'green', width: 2 },
      label: 'next',
    })

    state.setConfig({
      line: { stroke: 'purple', width: 1, dash: [] },
      markers: false,
      onSelect: makeDefaults().onSelect,
      store: makeDefaults().store,
    })
    expect(state.getSnapshot().resolved.line.stroke).toBe('purple')
    expect(state.getSnapshot().resolved.line.width).toBe(1)
    expect(state.getSnapshot().resolved.limit).toBe(10)
    expect(state.getSnapshot().resolved.label).toBe('default')
    expect(state.getSnapshot().explicit).not.toHaveProperty('limit')
    expect(state.getSnapshot().explicit).not.toHaveProperty('label')
  })

  test('validates atomically and returns false for effective no-op patches', () => {
    const state = createOptionState<Options>(
      {
        line: { stroke: 'red', width: 2, dash: [] },
        markers: false,
        limit: 10,
        label: 'default',
        onSelect: (value) => value,
        store: { getValue: () => 0 },
      },
      {
        defaults: makeDefaults,
        validate: (resolved) => {
          if (resolved.line.width < 0) throw new Error('line.width must be non-negative')
        },
      },
    )
    const before = state.getSnapshot()

    expect(state.update({ line: { width: 2 } })).toBe(false)
    expect(() => state.update({ line: { width: -1 } })).toThrow('line.width must be non-negative')
    expect(state.getSnapshot()).toEqual(before)
  })

  test('copies and freezes owned option snapshots without freezing references', () => {
    const store = { getValue: () => 1 }
    const initial: Options = {
      line: { stroke: 'red', width: 2, dash: [1, 2] },
      markers: false,
      limit: 10,
      label: 'custom',
      onSelect: (value) => value,
      store,
    }
    const state = createOptionState<Options>(initial, {
      defaults: makeDefaults,
      isAtomicReference: (value) => value === store,
    })
    initial.line.dash[0] = 9
    const snapshot = state.getSnapshot()

    expect(snapshot.resolved.line.dash).toEqual([1, 2])
    expect(Object.isFrozen(snapshot.resolved.line)).toBe(true)
    expect(Object.isFrozen(snapshot.resolved.line.dash)).toBe(true)
    expect(Reflect.set(snapshot.resolved.line, 'stroke', 'changed')).toBe(false)
    expect(Object.isFrozen(store)).toBe(false)
    expect(snapshot.resolved.store).toBe(store)
  })
})

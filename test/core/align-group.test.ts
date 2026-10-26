import { expect, test } from 'vitest'
import { alignGroup } from '../../src/index.js'
import { connectAlignGroup } from '../../src/layout/align-group.js'

test('aligns natural bounds, handles different widths and shrinks after changes or removal', () => {
  const group = alignGroup()
  const first = connectAlignGroup(group)
  const second = connectAlignGroup(group)
  expect(group.bounds.get()).toBeUndefined()
  first.report(500, 40, 20)
  second.report(600, 80, 50)
  expect(group.bounds.get()).toEqual({ left: 80, right: 480 })
  const version = group.bounds.version
  first.report(500, 40, 20)
  second.report(600, 80, 50)
  expect(group.bounds.version).toBe(version)
  second.report(400, 30, 50)
  expect(group.bounds.get()).toEqual({ left: 40, right: 350 })
  second.dispose()
  expect(group.bounds.get()).toEqual({ left: 40, right: 480 })
  first.dispose()
  expect(group.bounds.get()).toBeUndefined()
  first.dispose()
  expect(() => first.report(500, 40, 20)).toThrow(/disposed/)
})

test('validates measurements without publishing and supports empty plot areas', () => {
  const group = alignGroup()
  const member = connectAlignGroup(group)
  try {
    member.report(0, 10, 20)
    expect(group.bounds.get()).toEqual({ left: 0, right: 0 })
    const version = group.bounds.version
    expect(() => member.report(NaN, 10, 20)).toThrow()
    expect(() => member.report(100, -1, 20)).toThrow()
    expect(group.bounds.version).toBe(version)
    member.report(500, 10, 20)
    expect(group.bounds.get()).toEqual({ left: 10, right: 480 })
  } finally {
    member.dispose()
  }
})

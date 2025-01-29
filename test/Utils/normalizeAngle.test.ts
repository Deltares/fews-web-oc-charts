import { describe, expect, test } from 'vitest'
import { normalizeAngle } from '../../src/Utils/normalizeAngle.js'

describe("normalizeAngle", () => {
  test("normalized 360 to be 0", () => {
    const step = normalizeAngle(360)
    expect(step).toBe(0)
  })

  test("normalized 720 to be 0", () => {
    const step = normalizeAngle(720)
    expect(step).toBe(0)
  })

  test("normalized -360 to be 0", () => {
    const step = normalizeAngle(-360)
    expect(step).toBe(0)
  })

  test("normalized 361 to be 1", () => {
    const step = normalizeAngle(361)
    expect(step).toBe(1)
  })

  test("normalized 180 to be unchanged", () => {
    const step = normalizeAngle(180)
    expect(step).toBe(180)
  })

  test("normalized 0 to be unchanged", () => {
    const step = normalizeAngle(0)
    expect(step).toBe(0)
  })
})

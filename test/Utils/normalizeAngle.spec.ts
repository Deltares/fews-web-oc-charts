import { normalizeAngle } from '../../src/Utils/normalizeAngle.js'

describe("normalizeAngle", () => {
  it("normalized 360 to be 0", () => {
    const step = normalizeAngle(360)
    expect(step).toBe(0)
  })

  it("normalized 720 to be 0", () => {
    const step = normalizeAngle(720)
    expect(step).toBe(0)
  })

  it("normalized -360 to be 0", () => {
    const step = normalizeAngle(-360)
    expect(step).toBe(0)
  })

  it("normalized 361 to be 1", () => {
    const step = normalizeAngle(361)
    expect(step).toBe(1)
  })

  it("normalized 180 to be unchanged", () => {
    const step = normalizeAngle(180)
    expect(step).toBe(180)
  })

  it("normalized 0 to be unchanged", () => {
    const step = normalizeAngle(0)
    expect(step).toBe(0)
  })
})

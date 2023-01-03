import { niceDegreeSteps } from '../../src/Utils/niceDegreeSteps.js'

/**
 * Dummy test
 */
describe("niceDegreeSteps", () => {
  it("step for 100", () => {
    const step = niceDegreeSteps(100)
    expect(step).toBe(90)
  })

  it("step for 99", () => {
    const step = niceDegreeSteps(99)
    expect(step).toBe(45)
  })

  it("step for 50", () => {
    const step = niceDegreeSteps(50)
    expect(step).toBe(45)
  })

  it("step for 49", () => {
    const step = niceDegreeSteps(49)
    expect(step).toBe(15)
  })

  it("step for 20", () => {
    const step = niceDegreeSteps(20)
    expect(step).toBe(15)
  })

  it("step for 19", () => {
    const step = niceDegreeSteps(19)
    expect(step).toBe(19)
  })
})

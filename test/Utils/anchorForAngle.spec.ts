import { AxisOrientation } from '../../src/Types/axisOrientation.js'
import { anchorForAngle } from '../../src/Utils/anchorForAngle.js'

describe("anchor for axis orientation top", () => {
  const orientation = AxisOrientation.Top

  it("anchor for default" , () => {
    const step = anchorForAngle(0, orientation)
    expect(step).toBe('middle')
  })

  it("anchor for acute positive angles" , () => {
    const step = anchorForAngle(1, orientation)
    expect(step).toBe('end')
  })

  it("anchor for acute negative angles" , () => {
    const step = anchorForAngle(-1, orientation)
    expect(step).toBe('start')
  })

  it("anchor for straight angle" , () => {
    const step = anchorForAngle(180, orientation)
    expect(step).toBe('middle')
  })

  it("anchor for obtuse positive angles" , () => {
    const step = anchorForAngle(181, orientation)
    expect(step).toBe('start')
  })

  it("anchor for obtuse negative angles" , () => {
    const step = anchorForAngle(-181, orientation)
    expect(step).toBe('end')
  })
})

describe("anchor for axis orientation bottom", () => {
  const orientation = AxisOrientation.Bottom
  it("anchor for default" , () => {
    const step = anchorForAngle(0, orientation)
    expect(step).toBe('middle')
  })

  it("anchor for acute positive angles" , () => {
    const step = anchorForAngle(1, orientation)
    expect(step).toBe('start')
  })

  it("anchor for acute negative angles" , () => {
    const step = anchorForAngle(-1, orientation)
    expect(step).toBe('end')
  })

  it("anchor for straight angle" , () => {
    const step = anchorForAngle(180, orientation)
    expect(step).toBe('middle')
  })

  it("anchor for obtuse positive angles" , () => {
    const step = anchorForAngle(181, orientation)
    expect(step).toBe('end')
  })

  it("anchor for obtuse negative angles" , () => {
    const step = anchorForAngle(-181, orientation)
    expect(step).toBe('start')
  })

})

describe("anchor for axis orientation left", () => {
  const orientation = AxisOrientation.Left
  it("anchor for default" , () => {
    const step = anchorForAngle(0, orientation)
    expect(step).toBe('end')
  })

  it("anchor for acute positive angles" , () => {
    const step = anchorForAngle(1, orientation)
    expect(step).toBe('end')
  })

  it("anchor for acute negative angles" , () => {
    const step = anchorForAngle(-1, orientation)
    expect(step).toBe('end')
  })

  it("anchor for straight angle" , () => {
    const step = anchorForAngle(180, orientation)
    expect(step).toBe('start')
  })

  it("anchor for obtuse positive angles" , () => {
    const step = anchorForAngle(181, orientation)
    expect(step).toBe('start')
  })

  it("anchor for obtuse negative angles" , () => {
    const step = anchorForAngle(-181, orientation)
    expect(step).toBe('start')
  })

})

describe("anchor for axis orientation right", () => {
  const orientation = AxisOrientation.Right
  it("anchor for default" , () => {
    const step = anchorForAngle(0, orientation)
    expect(step).toBe('start')
  })

  it("anchor for acute positive angles" , () => {
    const step = anchorForAngle(1, orientation)
    expect(step).toBe('start')
  })

  it("anchor for acute negative angles" , () => {
    const step = anchorForAngle(-1, orientation)
    expect(step).toBe('start')
  })

  it("anchor for straight angle" , () => {
    const step = anchorForAngle(180, orientation)
    expect(step).toBe('end')
  })

  it("anchor for obtuse positive angles" , () => {
    const step = anchorForAngle(181, orientation)
    expect(step).toBe('end')
  })

  it("anchor for obtuse negative angles" , () => {
    const step = anchorForAngle(-181, orientation)
    expect(step).toBe('end')
  })

})

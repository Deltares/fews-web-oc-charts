import { describe, expect, test } from 'vitest'
import { AxisOrientation } from '../../src/Axis/axisOrientation.js'
import { textAnchorForAngle } from '../../src/Utils/textAnchorForAngle.js'

describe("anchor for axis orientation top", () => {
  const orientation = AxisOrientation.Top

  test("anchor for default" , () => {
    const step = textAnchorForAngle(0, orientation)
    expect(step).toBe('middle')
  })

  test("anchor for acute positive angles" , () => {
    const step = textAnchorForAngle(1, orientation)
    expect(step).toBe('end')
  })

  test("anchor for acute negative angles" , () => {
    const step = textAnchorForAngle(-1, orientation)
    expect(step).toBe('start')
  })

  test("anchor for straight angle" , () => {
    const step = textAnchorForAngle(180, orientation)
    expect(step).toBe('middle')
  })

  test("anchor for obtuse positive angles" , () => {
    const step = textAnchorForAngle(181, orientation)
    expect(step).toBe('start')
  })

  test("anchor for obtuse negative angles" , () => {
    const step = textAnchorForAngle(-181, orientation)
    expect(step).toBe('end')
  })
})

describe("anchor for axis orientation bottom", () => {
  const orientation = AxisOrientation.Bottom
  test("anchor for default" , () => {
    const step = textAnchorForAngle(0, orientation)
    expect(step).toBe('middle')
  })

  test("anchor for acute positive angles" , () => {
    const step = textAnchorForAngle(1, orientation)
    expect(step).toBe('start')
  })

  test("anchor for acute negative angles" , () => {
    const step = textAnchorForAngle(-1, orientation)
    expect(step).toBe('end')
  })

  test("anchor for straight angle" , () => {
    const step = textAnchorForAngle(180, orientation)
    expect(step).toBe('middle')
  })

  test("anchor for obtuse positive angles" , () => {
    const step = textAnchorForAngle(181, orientation)
    expect(step).toBe('end')
  })

  test("anchor for obtuse negative angles" , () => {
    const step = textAnchorForAngle(-181, orientation)
    expect(step).toBe('start')
  })

})

describe("anchor for axis orientation left", () => {
  const orientation = AxisOrientation.Left
  test("anchor for default" , () => {
    const step = textAnchorForAngle(0, orientation)
    expect(step).toBe('end')
  })

  test("anchor for acute positive angles" , () => {
    const step = textAnchorForAngle(1, orientation)
    expect(step).toBe('end')
  })

  test("anchor for acute negative angles" , () => {
    const step = textAnchorForAngle(-1, orientation)
    expect(step).toBe('end')
  })

  test("anchor for straight angle" , () => {
    const step = textAnchorForAngle(180, orientation)
    expect(step).toBe('start')
  })

  test("anchor for obtuse positive angles" , () => {
    const step = textAnchorForAngle(181, orientation)
    expect(step).toBe('start')
  })

  test("anchor for obtuse negative angles" , () => {
    const step = textAnchorForAngle(-181, orientation)
    expect(step).toBe('start')
  })

})

describe("anchor for axis orientation right", () => {
  const orientation = AxisOrientation.Right
  test("anchor for default" , () => {
    const step = textAnchorForAngle(0, orientation)
    expect(step).toBe('start')
  })

  test("anchor for acute positive angles" , () => {
    const step = textAnchorForAngle(1, orientation)
    expect(step).toBe('start')
  })

  test("anchor for acute negative angles" , () => {
    const step = textAnchorForAngle(-1, orientation)
    expect(step).toBe('start')
  })

  test("anchor for straight angle" , () => {
    const step = textAnchorForAngle(180, orientation)
    expect(step).toBe('end')
  })

  test("anchor for obtuse positive angles" , () => {
    const step = textAnchorForAngle(181, orientation)
    expect(step).toBe('end')
  })

  test("anchor for obtuse negative angles" , () => {
    const step = textAnchorForAngle(-181, orientation)
    expect(step).toBe('end')
  })

})

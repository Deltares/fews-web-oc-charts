import { AxisOrientation } from "../Types/axisOrientation.js"
import { normalizeAngle } from "./normalizeAngle.js"

export function anchorForAngle(angle, orientation) {
  let rotate
  switch (orientation) {
    case AxisOrientation.Top:
      rotate = 180
      break
    case AxisOrientation.Right:
      rotate = -90
      break
    case AxisOrientation.Bottom:
      rotate = 0
      break
    case AxisOrientation.Left:
    default:
      rotate = 90
  }
  const normalizedAngle = normalizeAngle(angle - rotate)
  if (normalizedAngle === 0) {
    return 'middle'
  } else if (normalizedAngle < 180) {
    return 'start'
  } else if (normalizedAngle > 180) {
    return 'end'
  }
  return 'middle'
}

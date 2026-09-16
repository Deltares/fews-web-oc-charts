import { AxisOrientation } from '../Axis/axisOrientation.js'
import { normalizeAngle } from './normalizeAngle.js'

const rotationByOrientation: Record<AxisOrientation, number> = {
  [AxisOrientation.Top]: 180,
  [AxisOrientation.Right]: -90,
  [AxisOrientation.Bottom]: 0,
  [AxisOrientation.Left]: 90,
}

export function textAnchorForAngle(
  angle: number,
  orientation: AxisOrientation,
): 'start' | 'middle' | 'end' {
  const rotation = rotationByOrientation[orientation]
  const normalizedAngle = normalizeAngle(angle - rotation)

  if (normalizedAngle === 0 || normalizedAngle === 180) {
    return 'middle'
  }

  return normalizedAngle < 180 ? 'start' : 'end'
}

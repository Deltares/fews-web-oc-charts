export function normalizeAngle(angle) {
  return angle - 360 * Math.floor((angle) / 360)
}

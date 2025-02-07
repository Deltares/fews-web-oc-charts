/**
 * Normalizes an angle to be within the range of 0 to 360 degrees.
 * @param angle - The angle to normalize.
 * @returns The normalized angle.
 */
export function normalizeAngle(angle) {
  return angle - 360 * Math.floor(angle / 360)
}

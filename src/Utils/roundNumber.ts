/**
 * Rounds a number up to the nearest multiple of the specified step.
 *
 * @param value - The number to be rounded up.
 * @param step - The step to which the number should be rounded up.
 * @returns The smallest multiple of the step that is greater than or equal to the value.
 */
export function ceilByStep(value: number, step: number) {
  return Math.ceil(value / step) * step  
}

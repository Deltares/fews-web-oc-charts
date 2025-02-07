/**
 * Returns a nice degree step based on the given step value.
 * @param step - The step value.
 * @returns The nice degree step.
 */
//
export function niceDegreeSteps(step) {
  if (step >= 100) {
    return 90
  } else if (step >= 50) {
    return 45
  } else if (step >= 20) {
    return 15
  }
  return step
}

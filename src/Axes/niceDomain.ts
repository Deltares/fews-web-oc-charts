import { AxisType } from '../Axis/axisType.js'

const valueSteps = [1, 2, 2.5, 5, 10] // keep the 10 at the end
const degreeSteps = [1, 5, 15, 30, 45, 60, 90] // keep the 10 at the end

export function niceDomain(
  domain: [number, number] | undefined,
  count: number,
  axisType = AxisType.value,
): [number, number] | undefined {
  if (axisType === AxisType.band) return domain
  if (domain === undefined) return
  // Minimal increment to avoid round extreme values to be on the edge of the chart
  let max = domain[1]
  let min = domain[0]
  if (min === max) {
    if (min === 0) {
      max = 1
    } else {
      min = min * (1 - Math.sign(min) * 0.1)
      max = max * (1 + Math.sign(max) * 0.1)
    }
  }
  const epsilon = (max - min) * 1e-6
  max += epsilon
  min -= epsilon
  const range = max - min

  // First approximation
  const roughStep = range / (count - 1)
  let step: number
  // Normalize rough step to find the normalized one that fits best
  if (axisType === AxisType.degrees) {
    step = degreeSteps.find((n) => n >= roughStep) ?? degreeSteps[degreeSteps.length - 1]
  } else {
    const stepPower = Math.pow(10, -Math.floor(Math.log10(Math.abs(roughStep))))
    const normalizedStep = roughStep * stepPower
    const goodNormalizedStep =
      valueSteps.find((n) => n >= normalizedStep) ?? valueSteps[valueSteps.length - 1]
    step = goodNormalizedStep / stepPower
  }

  // Determine the scale limits based on the chosen step.
  const scaleMax = Math.abs(domain[1]) < epsilon ? 0 : (Math.ceil(max / step) + 1) * step
  const scaleMin = Math.abs(domain[0]) < epsilon ? 0 : (Math.floor(min / step) - 1) * step
  return [scaleMin, scaleMax]
}

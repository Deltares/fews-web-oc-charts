import * as d3 from 'd3'

const valueSteps = [1, 2, 2.5, 5, 10 ] // keep the 10 at the end
// const degreeSteeps = [1, 5, 15, 45, 90] // keep the 10 at the end

export function niceDomain(scale: any, count: number)
{
    // Minimal increment to avoid round extreme values to be on the edge of the chart

  const domain = scale.domain()
  let max = domain[1]
  let min = domain[0]
  const epsilon = (max - min) / 1e6
  max += epsilon
  min -= epsilon
  let range = max - min

  // First approximation
  let roughStep = range / (count - 1)

  // Normalize rough step to find the normalized one that fits best
  let stepPower = Math.pow(10, -Math.floor(Math.log10( Math.abs(roughStep))))
  var normalizedStep = roughStep * stepPower
  let goodNormalizedStep = valueSteps.find(n => n >= normalizedStep)
  const step = goodNormalizedStep / stepPower

  // Determine the scale limits based on the chosen step.
  let scaleMax = Math.ceil(max / step) * step
  let scaleMin = Math.floor(min / step) * step
  scale.domain([scaleMin, scaleMax])
}

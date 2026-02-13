interface DomainOptions {
  defaultDomain: [number | undefined, number | undefined]
  dataExtent: [number, number]
  bufferRatio?: number
}

const valueSteps = [1, 2, 2.5, 5, 10] // keep the 10 at the end

export function getNiceDomain(options: DomainOptions): [number, number] {
  const { defaultDomain, dataExtent, bufferRatio = 0.1 } = options

  const [defaultMin = Infinity, defaultMax = -Infinity] = defaultDomain ?? [undefined, undefined]
  const [dataMin, dataMax] = dataExtent
  const dataRange = dataMax - dataMin
  const minExceeds = dataMin < defaultMin
  const maxExceeds = dataMax > defaultMax

  let bufferBase = 0
  if (minExceeds && maxExceeds) {
    bufferBase = dataRange === 0 ? Math.abs(dataMin) || 1 : dataRange
  } else if (minExceeds) {
    bufferBase = defaultMax - dataMin
  } else if (maxExceeds) {
    bufferBase = dataMax - defaultMin
  }

  // First approximation
  const roughStep = bufferBase * bufferRatio
  const stepPower = Math.pow(10, -Math.floor(Math.log10(Math.abs(roughStep))))
  const normalizedStep = roughStep * stepPower
  const goodNormalizedStep = valueSteps.find((n) => n >= normalizedStep)
  const step = goodNormalizedStep / stepPower

  const minCandidate = minExceeds ? (Math.floor(dataMin / step) - 1) * step : defaultMin
  const maxCandidate = maxExceeds ? (Math.ceil(dataMax / step) + 1) * step : defaultMax

  // Expand domain to accommodate data with buffer (but not if default domain is at 0)
  const domain: [number, number] = [
    Math.min(defaultMin, minCandidate),
    Math.max(defaultMax, maxCandidate),
  ]

  return domain
}

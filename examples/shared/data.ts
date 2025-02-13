export interface ExampleEvent<T extends Date | number> {
  x: T
  y: number
}

export interface ExamplePolarEvent {
  angular: number
  radial: number
}

export function generateExampleValueSeriesData(
  rangeX: [number, number],
  rangeY: [number, number],
  numX: number,
): ExampleEvent<number>[] {
  const [minX, maxX] = rangeX
  const stepX = (maxX - minX) / (numX - 1)

  const [minY, maxY] = rangeY
  const distY = maxY - minY
  // Compute factor and offset for a sine in the range [-1, 1] to obtain the specified y-range.
  const factor = distY / 2
  const offset = minY + factor

  const numPeriods = 2.8
  const offsetStart = 1.2

  // Generate sine as example data.
  const events: ExampleEvent<number>[] = []
  for (let i = 0; i < numX; i++) {
    // Make sure the last step is exactly the end of the x-range, which we may
    // otherwise not exactly end up with due to rounding errors.
    const x = i === numX - 1 ? maxX : minX + i * stepX

    const xSine = Math.PI * (numPeriods * (i / (numX - 1)) + offsetStart)
    const y = factor * Math.sin(xSine) + offset

    events.push({ x, y })
  }
  return events
}

export function generateExampleTimeSeriesData(
  rangeX: [Date, Date],
  rangeY: [number, number],
  numX: number,
): ExampleEvent<Date>[] {
  const startTimestamp = rangeX[0].getTime()
  const endTimestamp = rangeX[1].getTime()

  const valueEvents = generateExampleValueSeriesData([startTimestamp, endTimestamp], rangeY, numX)
  return valueEvents.map((event) => ({ x: new Date(event.x), y: event.y }))
}

export function generateExamplePolarData(
  rangeAngular: [number, number],
  rangeRadial: [number, number],
  numPoints: number,
): ExamplePolarEvent[] {
  const computeFactorOffset = (range: [number, number]) => {
    const [min, max] = range
    const factor = max - min
    const offset = min
    return [factor, offset]
  }
  const [factorAngular, offsetAngular] = computeFactorOffset(rangeAngular)
  const [factorRadial, offsetRadial] = computeFactorOffset(rangeRadial)

  const exampleData: ExamplePolarEvent[] = []
  for (let i = 0; i < numPoints; i++) {
    const s = i / (numPoints - 1)

    const angular = factorAngular * s + offsetAngular
    const radial = factorRadial * s + offsetRadial
    exampleData.push({ angular, radial })
  }
  return exampleData
}

export interface ExampleEvent<T extends Date | number> {
  x: T
  y: number
}

export function generateExampleData(
  rangeX: [Date, Date],
  rangeY: [number, number],
  numX: number,
): ExampleEvent<Date>[] {
  const startTimestamp = rangeX[0].getTime()
  const endTimestamp = rangeX[1].getTime()
  const stepTimestamp = (endTimestamp - startTimestamp) / (numX - 1)

  const [minY, maxY] = rangeY
  const distY = maxY - minY
  // Compute factor and offset for a sine in the range [-1, 1] to obtain the specified y-range.
  const factor = distY / 2
  const offset = minY + factor

  const numPeriods = 2.8
  const offsetStart = 1.2

  // Generate sine as example data.
  const events: ExampleEvent<Date>[] = []
  for (let i = 0; i < numX; i++) {
    // Make sure the last step is exactly our end timestamp, that we may
    // otherwise not exactly end up with due to rounding errors.
    const timestamp = i === numX - 1 ? endTimestamp : startTimestamp + i * stepTimestamp
    const x = new Date(timestamp)

    const xSine = Math.PI * (numPeriods * (i / (numX - 1)) + offsetStart)
    const y = factor * Math.sin(xSine) + offset

    events.push({ x, y })
  }
  return events
}

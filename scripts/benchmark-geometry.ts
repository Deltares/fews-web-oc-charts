export type PathPoint = readonly [x: number, y: number]

/**
 * Stroked dense and decimated paths antialias differently even when they trace the same curve, so
 * they can't be compared by pixels. M4 decimation instead guarantees that every pixel column keeps
 * the data's extent, and that can be checked exactly.
 */
export interface PathDeviation {
  /** The largest difference in a column's minimum or maximum y, in pixels. */
  readonly maxDeviation: number
  /** Columns that only one of the paths covers. */
  readonly missingColumns: number
}

const pathCommand = /[ML]\s*(-?[\d.]+(?:e[-+]?\d+)?)[ ,]\s*(-?[\d.]+(?:e[-+]?\d+)?)/gi

export function parsePathPoints(path: string): PathPoint[] {
  return Array.from(path.matchAll(pathCommand), (match) => [Number(match[1]), Number(match[2])])
}

interface ColumnExtents {
  readonly low: Float64Array
  readonly high: Float64Array
}

/** The y extent of a polyline inside each pixel column of a plot. */
function columnExtents(points: readonly PathPoint[], width: number): ColumnExtents {
  const low = new Float64Array(width).fill(Infinity)
  const high = new Float64Array(width).fill(-Infinity)
  const add = (column: number, y: number) => {
    if (column < 0 || column >= width) return
    if (y < low[column]) low[column] = y
    if (y > high[column]) high[column] = y
  }
  for (let index = 1; index < points.length; index += 1) {
    const [x0, y0] = points[index - 1]
    const [x1, y1] = points[index]
    const yAt = (x: number) => (x1 === x0 ? y0 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0))
    const first = Math.floor(Math.min(x0, x1))
    const last = Math.floor(Math.max(x0, x1))
    add(Math.floor(x0), y0)
    add(Math.floor(x1), y1)
    // A segment crossing a column boundary belongs to the columns on both sides of it.
    for (let boundary = first + 1; boundary <= last; boundary += 1) {
      add(boundary - 1, yAt(boundary))
      add(boundary, yAt(boundary))
    }
  }
  return { low, high }
}

export function pathDeviation(
  reference: readonly PathPoint[],
  actual: readonly PathPoint[],
  width: number,
): PathDeviation {
  const expected = columnExtents(reference, width)
  const measured = columnExtents(actual, width)
  let maxDeviation = 0
  let missingColumns = 0
  for (let column = 0; column < width; column += 1) {
    const hasExpected = expected.low[column] !== Infinity
    const hasMeasured = measured.low[column] !== Infinity
    if (hasExpected !== hasMeasured) {
      missingColumns += 1
    } else if (hasExpected) {
      maxDeviation = Math.max(
        maxDeviation,
        Math.abs(expected.low[column] - measured.low[column]),
        Math.abs(expected.high[column] - measured.high[column]),
      )
    }
  }
  return { maxDeviation, missingColumns }
}

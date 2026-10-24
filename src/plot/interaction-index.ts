export const maxInteractionIndexEntries = 100_000
export const maxInteractionCandidates = 512

export function sameInteractionKey(
  previous: readonly unknown[] | undefined,
  next: readonly unknown[],
) {
  return previous?.length === next.length && next.every((value, index) => value === previous[index])
}

export function lowerBound<T>(values: readonly T[], target: number, value: (item: T) => number) {
  let low = 0
  let high = values.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (value(values[middle]) < target) low = middle + 1
    else high = middle
  }
  return low
}

export interface SpatialGridBounds {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface SpatialGrid<T> {
  at(x: number, y: number): readonly T[]
}

export function createSpatialGrid<T>(
  entries: readonly T[],
  bounds: (entry: T) => SpatialGridBounds,
  plot: SpatialGridBounds,
): SpatialGrid<T> {
  const cellSize = 32
  const maxCellsPerEntry = 64
  const cells = new Map<string, T[]>()
  const broad: T[] = []
  const cellKey = (x: number, y: number) => `${x}:${y}`
  let memberships = 0

  for (const entry of entries) {
    const box = bounds(entry)
    const x0 = Math.max(box.x, plot.x)
    const y0 = Math.max(box.y, plot.y)
    const x1 = Math.min(box.x + box.width, plot.x + plot.width)
    const y1 = Math.min(box.y + box.height, plot.y + plot.height)
    if (x0 > x1 || y0 > y1) continue

    const left = Math.floor((x0 - plot.x) / cellSize)
    const right = Math.floor((x1 - plot.x) / cellSize)
    const top = Math.floor((y0 - plot.y) / cellSize)
    const bottom = Math.floor((y1 - plot.y) / cellSize)
    const covered = (right - left + 1) * (bottom - top + 1)
    if (covered > maxCellsPerEntry) {
      broad.push(entry)
      if (broad.length > maxInteractionCandidates) {
        throw new RangeError(
          `Hit testing exceeded the ${maxInteractionCandidates}-rectangle broad-phase budget.`,
        )
      }
      continue
    }
    for (let row = top; row <= bottom; row += 1) {
      for (let column = left; column <= right; column += 1) {
        const key = cellKey(column, row)
        const bucket = cells.get(key) ?? []
        bucket.push(entry)
        memberships += 1
        if (memberships > maxInteractionIndexEntries * 2) {
          throw new RangeError(
            `Hit testing exceeded the ${maxInteractionIndexEntries * 2}-cell membership budget.`,
          )
        }
        if (bucket.length > maxInteractionCandidates) {
          throw new RangeError(
            `Hit testing exceeded the ${maxInteractionCandidates}-rectangle cell budget.`,
          )
        }
        cells.set(key, bucket)
      }
    }
  }

  return {
    at(x, y) {
      const column = Math.floor((x - plot.x) / cellSize)
      const row = Math.floor((y - plot.y) / cellSize)
      const bucket = cells.get(cellKey(column, row)) ?? []
      if (bucket.length + broad.length > maxInteractionCandidates) {
        throw new RangeError(
          `Hit testing exceeded the ${maxInteractionCandidates}-rectangle query budget.`,
        )
      }
      return [...broad, ...bucket]
    },
  }
}

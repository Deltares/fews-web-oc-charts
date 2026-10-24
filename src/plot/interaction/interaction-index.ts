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

interface SpatialGridCellRange {
  readonly left: number
  readonly right: number
  readonly top: number
  readonly bottom: number
}

function clippedBounds(box: SpatialGridBounds, plot: SpatialGridBounds) {
  const x0 = Math.max(box.x, plot.x)
  const y0 = Math.max(box.y, plot.y)
  const x1 = Math.min(box.x + box.width, plot.x + plot.width)
  const y1 = Math.min(box.y + box.height, plot.y + plot.height)
  return x0 > x1 || y0 > y1 ? undefined : { x0, y0, x1, y1 }
}

function cellRange(
  box: NonNullable<ReturnType<typeof clippedBounds>>,
  plot: SpatialGridBounds,
  cellSize: number,
): SpatialGridCellRange {
  return {
    left: Math.floor((box.x0 - plot.x) / cellSize),
    right: Math.floor((box.x1 - plot.x) / cellSize),
    top: Math.floor((box.y0 - plot.y) / cellSize),
    bottom: Math.floor((box.y1 - plot.y) / cellSize),
  }
}

function addBroadEntry<T>(entry: T, broad: T[]) {
  broad.push(entry)
  if (broad.length > maxInteractionCandidates) {
    throw new RangeError(
      `Hit testing exceeded the ${maxInteractionCandidates}-rectangle broad-phase budget.`,
    )
  }
}

function addEntryToCells<T>(
  entry: T,
  range: SpatialGridCellRange,
  cells: Map<string, T[]>,
  cellKey: (x: number, y: number) => string,
  memberships: { count: number },
) {
  for (let row = range.top; row <= range.bottom; row += 1) {
    for (let column = range.left; column <= range.right; column += 1) {
      const key = cellKey(column, row)
      const bucket = cells.get(key) ?? []
      bucket.push(entry)
      memberships.count += 1
      if (memberships.count > maxInteractionIndexEntries * 2) {
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
  const memberships = { count: 0 }

  for (const entry of entries) {
    const clipped = clippedBounds(bounds(entry), plot)
    if (!clipped) continue
    const range = cellRange(clipped, plot, cellSize)
    const covered = (range.right - range.left + 1) * (range.bottom - range.top + 1)
    if (covered > maxCellsPerEntry) {
      addBroadEntry(entry, broad)
      continue
    }
    addEntryToCells(entry, range, cells, cellKey, memberships)
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

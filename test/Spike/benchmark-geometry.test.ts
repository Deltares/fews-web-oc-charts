import { describe, expect, test } from 'vite-plus/test'
import { parsePathPoints, pathDeviation, type PathPoint } from '../../scripts/benchmark-geometry'

const width = 100
const curve = (x: number) => 50 + 30 * Math.sin(x / 10)

/** A dense polyline through the curve. */
const dense: PathPoint[] = Array.from({ length: width * 100 + 1 }, (_, index) => {
  const x = index / 100
  return [x, curve(x)]
})

/** Keeps each column's first, lowest, highest and last point, like M4 decimation. */
function decimate(points: readonly PathPoint[]): PathPoint[] {
  const columns = new Map<number, PathPoint[]>()
  for (const point of points) {
    const column = Math.min(width - 1, Math.floor(point[0]))
    columns.set(column, [...(columns.get(column) ?? []), point])
  }
  return [...columns.values()].flatMap((group) => {
    const byY = [...group].sort((left, right) => left[1] - right[1])
    const kept = new Set([group[0], byY[0], byY.at(-1)!, group.at(-1)!])
    return group.filter((point) => kept.has(point))
  })
}

describe('pathDeviation', () => {
  const decimated = decimate(dense)

  test('finds no deviation between a dense path and its decimation', () => {
    expect(decimated.length).toBeLessThan(dense.length / 10)
    const { maxDeviation, missingColumns } = pathDeviation(dense, decimated, width)
    expect(maxDeviation).toBeLessThan(0.005)
    expect(missingColumns).toBe(0)
  })

  test.each<[string, (points: PathPoint[]) => PathPoint[]]>([
    ['a vertical shift', (points) => points.map(([x, y]) => [x, y + 0.5])],
    ['a horizontal shift', (points) => points.map(([x, y]) => [x + 3, y])],
    ['a wrong y scale', (points) => points.map(([x, y]) => [x, 50 + (y - 50) * 0.95])],
    ['a removed section', (points) => points.filter(([x]) => x < 40 || x > 45)],
    [
      'one moved point',
      (points) => points.map(([x, y]) => (x === points[200][0] ? [x, y + 4] : [x, y])),
    ],
  ])('detects %s', (_name, fault) => {
    const { maxDeviation, missingColumns } = pathDeviation(dense, fault(decimated), width)
    expect(maxDeviation > 0.005 || missingColumns > 0).toBe(true)
  })

  test('reports columns that only one path covers', () => {
    const truncated = decimated.filter(([x]) => x < 90)
    expect(pathDeviation(dense, truncated, width).missingColumns).toBeGreaterThan(5)
  })
})

describe('parsePathPoints', () => {
  test('reads move and line commands, with comma or space separators and exponents', () => {
    expect(parsePathPoints('M0,1L2.5 -3L1e2,4.5e-1')).toEqual([
      [0, 1],
      [2.5, -3],
      [100, 0.45],
    ])
  })
})

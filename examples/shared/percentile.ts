export function percentile<T extends number | number[]>(
  p: T,
  data: number[],
): T extends number ? number : number[] {
  const points = data
  points.sort(function (a, b) {
    return a - b
  })
  if (Array.isArray(p)) {
    const result: number[] = []
    for (let i = 0; i < p.length; ++i) {
      const x = p[i] * (points.length + 1)
      const x1 = Math.floor(x)
      const frac = x - x1
      result.push(points[x1 - 1] + frac * (points[x1] - points[x1 - 1]))
    }
    return result as T extends number ? number : number[]
  } else {
    const v = typeof p === 'number' ? p : 0
    const x = v * (points.length + 1)
    const x1 = Math.floor(x)
    const frac = x - x1
    return (points[x1 - 1] + frac * (points[x1] - points[x1 - 1])) as T extends number
      ? number
      : number[]
  }
}

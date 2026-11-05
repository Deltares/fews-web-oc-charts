import type { ScaleHandle, ScaleValue } from '../../scales/scale.js'
import { markDefinition, type PlotMark } from './marks.js'

export function markExtents(
  marks: readonly PlotMark[],
  scales: Readonly<Record<string, ScaleHandle>>,
  name: string,
  mode: 'data' | 'visible',
): readonly ScaleValue[] | undefined {
  const categories = new Set<string>()
  let low = Infinity
  let high = -Infinity
  const context = {
    scale: name,
    scales,
    mode,
    add(value: ScaleValue) {
      if (typeof value === 'string') categories.add(value)
      else {
        low = Math.min(low, value)
        high = Math.max(high, value)
      }
    },
  }
  for (const mark of marks) markDefinition(mark).extents(mark, context)
  if (scales[name].kind === 'band') {
    return categories.size ? Object.freeze([...categories]) : undefined
  }
  return low <= high ? Object.freeze([low, high]) : undefined
}

import { autoscaleWindow, type ScaleHandle, type ScaleValue } from '../scales/scale.js'
import { isLineMark, type LineMark, type LineValue } from './line.js'
import { isSeriesMark, type SeriesMark } from './series.js'

function valid(value: LineValue): value is ScaleValue {
  return typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))
}

function within(value: ScaleValue, domain: readonly ScaleValue[]) {
  return typeof value === 'string'
    ? domain.includes(value)
    : value >= Number(domain[0]) && value <= Number(domain[1])
}

export function markExtents(
  marks: readonly (LineMark | SeriesMark)[],
  scales: Readonly<Record<string, ScaleHandle>>,
  name: string,
  mode: 'data' | 'visible',
): readonly ScaleValue[] | undefined {
  const categories = new Set<string>()
  let low = Infinity
  let high = -Infinity
  function add(value: ScaleValue) {
    if (typeof value === 'string') categories.add(value)
    else {
      low = Math.min(low, value)
      high = Math.max(high, value)
    }
  }
  for (const mark of marks) {
    const store = isSeriesMark(mark) ? mark.data : undefined
    if (isSeriesMark(mark)) {
      mark.options.get()
      if (!mark.visible) continue
    }
    if ((!mark.line && !mark.markers && !mark.area) || (mark.x !== name && mark.y !== name)) {
      continue
    }
    const coordinate = mark.x === name ? 'x' : 'y'
    const other = scales[coordinate === 'x' ? mark.y : mark.x]
    const window = mode === 'visible' ? autoscaleWindow(other) : undefined
    const staticMark = isLineMark(mark) ? mark : undefined
    if (store) {
      const _version = store.version
    }
    const length = store?.length ?? staticMark?.xValues.length ?? 0
    let eligible = false
    for (let index = 0; index < length; index += 1) {
      const x = store ? store.xAt(index) : staticMark?.xValues[index]
      const y = store ? store.yAt(index) : staticMark?.yValues[index]
      if (!valid(x) || !valid(y)) continue
      const opposite = coordinate === 'x' ? y : x
      if (window && !within(opposite, window)) continue
      add(coordinate === 'x' ? x : y)
      eligible = true
    }
    if (eligible && coordinate === 'y' && mark.area) add(mark.area.to)
  }
  if (scales[name].kind === 'band') {
    return categories.size ? Object.freeze([...categories]) : undefined
  }
  return low <= high ? Object.freeze([low, high]) : undefined
}

import { autoscaleWindow, type ScaleHandle, type ScaleValue } from '../scales/scale.js'
import { isBandMark, type BandMark } from './band.js'
import { isLineMark, type LineMark, type LineValue } from './line.js'
import { isSeriesMark, type SeriesMark } from './series.js'
import { isBarMark, type BarMark } from './bar.js'
import { barExtent } from './bar-geometry.js'
import { isStackedAreaMark, type StackedAreaMark } from './stacked-area.js'
import { stackedAreaExtent } from './render-stacked-areas.js'
import { isRuleMark, type RuleMark } from './rule.js'

function valid(value: LineValue): value is ScaleValue {
  return typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))
}

function within(value: ScaleValue, domain: readonly ScaleValue[]) {
  return typeof value === 'string'
    ? domain.includes(value)
    : value >= Number(domain[0]) && value <= Number(domain[1])
}

export function markExtents(
  marks: readonly (LineMark | SeriesMark | BandMark | BarMark | StackedAreaMark | RuleMark)[],
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
    if (isRuleMark(mark)) continue
    if (isStackedAreaMark(mark)) {
      const coordinate = mark.x === name ? 'x' : mark.y === name ? 'y' : undefined
      if (!coordinate) continue
      const opposite = coordinate === 'x' ? mark.y : mark.x
      const window = mode === 'visible' ? autoscaleWindow(scales[opposite]) : undefined
      stackedAreaExtent(mark, coordinate, window)?.forEach(add)
      continue
    }
    if (isBarMark(mark)) {
      const options = mark.options.get().resolved
      const coordinate =
        options.scales.x === name ? 'category' : options.scales.y === name ? 'value' : undefined
      if (!coordinate) continue
      const opposite = coordinate === 'category' ? options.scales.y : options.scales.x
      const window = mode === 'visible' ? autoscaleWindow(scales[opposite]) : undefined
      const extent = barExtent(mark, coordinate, window)
      extent?.forEach(add)
      continue
    }
    if (isBandMark(mark)) {
      const coordinate = mark.x === name ? 'x' : mark.y === name ? 'y' : undefined
      if (!coordinate) continue
      const oppositeName = coordinate === 'x' ? mark.y : mark.x
      const window = mode === 'visible' ? autoscaleWindow(scales[oppositeName]) : undefined
      for (let index = 0; index < mark.xValues.length; index += 1) {
        const x = mark.xValues[index]
        const y = mark.yValues[index]
        if (!x || !y) continue
        const extent = coordinate === 'x' ? x : y
        const opposite = coordinate === 'x' ? y : x
        if (window && (opposite[1] < Number(window[0]) || opposite[0] > Number(window[1]))) {
          continue
        }
        add(extent[0])
        add(extent[1])
      }
      continue
    }
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

import { autoscaleWindow, type ScaleHandle } from '../../scales/scale.js'
import { isLineMark } from '../marks/line/line.js'
import type { PlotMark } from '../marks/marks.js'
import { isStaticMarkVisible } from '../marks/static-legend.js'
import { skewTTemperature } from './skew-t-geometry.js'

export function skewTMarkExtents(
  marks: readonly PlotMark[],
  scales: Readonly<Record<string, ScaleHandle>>,
  name: string,
  mode: 'data' | 'visible',
  skew: number,
): readonly number[] | undefined {
  const temperature = Object.values(scales).find((scale) => scale.kind === 'linear')!
  const pressure = Object.values(scales).find((scale) => scale.kind === 'log')!
  const isTemperature = scales[name] === temperature
  // Raw pressure extents must not depend on temperature or their own resolved domain.
  const pressureWindow =
    isTemperature || mode === 'visible' ? autoscaleWindow(pressure).map(Number) : undefined
  const bottomPressure = pressureWindow?.[pressure.options.get().resolved.reverse ? 1 : 0]
  const temperatureWindow =
    !isTemperature && mode === 'visible' ? autoscaleWindow(temperature).map(Number) : undefined
  let low = Infinity
  let high = -Infinity
  for (const mark of marks) {
    if (!isLineMark(mark)) throw new Error('Skew-T extents require line() marks.')
    if ((!mark.line && !mark.markers) || !isStaticMarkVisible(mark)) continue
    for (let index = 0; index < mark.xValues.length; index += 1) {
      const t = mark.xValues[index]
      const p = mark.yValues[index]
      if (
        typeof t !== 'number' ||
        typeof p !== 'number' ||
        !Number.isFinite(t) ||
        !Number.isFinite(p)
      ) {
        continue
      }
      const projected =
        bottomPressure === undefined ? t : skewTTemperature(t, p, bottomPressure, skew)
      if (
        mode === 'visible' &&
        (isTemperature
          ? p < pressureWindow![0] || p > pressureWindow![1]
          : projected < temperatureWindow![0] || projected > temperatureWindow![1])
      ) {
        continue
      }
      const value = isTemperature ? projected : p
      low = Math.min(low, value)
      high = Math.max(high, value)
    }
  }
  return low <= high ? Object.freeze([low, high]) : undefined
}

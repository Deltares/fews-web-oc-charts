import type { ScaleBinding } from '../scales/scale.js'

export interface SkewTOptions {
  /** Temperature offset in Celsius per unit of natural-log pressure. */
  skew: number
}

export interface SkewTPoint {
  readonly x: number
  readonly y: number
}

export interface SoundingPoint {
  readonly temperature: number
  readonly pressure: number
}

export function skewTTemperature(
  temperature: number,
  pressure: number,
  bottomPressure: number,
  skew: number,
) {
  if (!Number.isFinite(temperature)) throw new Error('Skew-T temperature must be finite.')
  if (!Number.isFinite(pressure) || pressure <= 0) {
    throw new Error('Skew-T pressure must be finite and strictly positive.')
  }
  return temperature + skew * (Math.log(bottomPressure) - Math.log(pressure))
}

function temperatureOffset(pressureScale: ScaleBinding, pressure: number, skew: number) {
  const bottomPressure = pressureScale.invert(Math.max(...pressureScale.range.get()))
  return skewTTemperature(0, pressure, bottomPressure, skew)
}

export function projectSkewTPoint(
  temperatureScale: ScaleBinding,
  pressureScale: ScaleBinding,
  temperature: number,
  pressure: number,
  skew: number,
): SkewTPoint {
  if (!Number.isFinite(temperature)) throw new Error('Skew-T temperature must be finite.')
  return {
    x: temperatureScale.project(temperature + temperatureOffset(pressureScale, pressure, skew)),
    y: pressureScale.project(pressure),
  }
}

export function invertSkewTPoint(
  temperatureScale: ScaleBinding,
  pressureScale: ScaleBinding,
  x: number,
  y: number,
  skew: number,
): SoundingPoint {
  const pressure = pressureScale.invert(y)
  return {
    temperature: temperatureScale.invert(x) - temperatureOffset(pressureScale, pressure, skew),
    pressure,
  }
}

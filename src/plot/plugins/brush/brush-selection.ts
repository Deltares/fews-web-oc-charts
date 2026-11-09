import type { ScaleValue } from '../../../scales/scale.js'
import type { PlotContext } from '../plugin-definition.js'
import type { BrushSelection, BrushSelectionMode } from './brush.js'

export const brushHandleNames = ['w', 'e', 'n', 's', 'nw', 'ne', 'sw', 'se'] as const
export type BrushHandleName = (typeof brushHandleNames)[number]
export interface BrushBounds {
  readonly x0: number
  readonly x1: number
  readonly y0: number
  readonly y1: number
}

type ScaleContext = Pick<PlotContext, 'scales' | 'direction'>

export function clamp(value: number, low: number, high: number) {
  return Math.max(low, Math.min(high, value))
}

export function selectedScales(context: ScaleContext, mode: BrushSelectionMode) {
  return Object.entries(context.scales).flatMap(([name, binding]) => {
    const orientation = context.direction(name)
    if ((orientation !== 'x' && orientation !== 'y') || !mode.includes(orientation)) return []
    return [{ name, binding, orientation }]
  })
}

export function validBounds(bounds: BrushBounds, mode: BrushSelectionMode) {
  return (
    (!mode.includes('x') || bounds.x1 > bounds.x0) && (!mode.includes('y') || bounds.y1 > bounds.y0)
  )
}

export function orderedBounds(x0: number, y0: number, x1: number, y1: number): BrushBounds {
  return {
    x0: Math.min(x0, x1),
    x1: Math.max(x0, x1),
    y0: Math.min(y0, y1),
    y1: Math.max(y0, y1),
  }
}

export function moveBounds(
  origin: BrushBounds,
  region: BrushBounds,
  mode: BrushSelectionMode | undefined,
  dx: number,
  dy: number,
): BrushBounds {
  const shiftX = mode?.includes('x') ? clamp(dx, region.x0 - origin.x0, region.x1 - origin.x1) : 0
  const shiftY = mode?.includes('y') ? clamp(dy, region.y0 - origin.y0, region.y1 - origin.y1) : 0
  return {
    x0: origin.x0 + shiftX,
    x1: origin.x1 + shiftX,
    y0: origin.y0 + shiftY,
    y1: origin.y1 + shiftY,
  }
}

export function resizeBounds(
  origin: BrushBounds,
  handle: BrushHandleName,
  x: number,
  y: number,
): BrushBounds {
  return orderedBounds(
    handle.includes('w') ? x : origin.x0,
    handle.includes('n') ? y : origin.y0,
    handle.includes('e') ? x : origin.x1,
    handle.includes('s') ? y : origin.y1,
  )
}

export function projectSelection(
  value: BrushSelection,
  region: BrushBounds,
  context: ScaleContext,
): BrushBounds | undefined {
  const bounds = { ...region }
  const projected = new Set<string>()
  for (const { name, binding, orientation } of selectedScales(context, value.mode)) {
    const range = value.scales[name]
    if (!range || projected.has(orientation)) continue
    const pixels = range.flatMap((entry) => {
      if (binding.scale.kind === 'band' && !binding.scale.domain.get().includes(entry)) return []
      const pixel = binding.project(entry)
      return binding.scale.kind === 'band' ? [pixel, pixel + binding.bandwidth] : [pixel]
    })
    if (!pixels.length) return undefined
    const low = pixels.reduce((minimum, pixel) => Math.min(minimum, pixel), Infinity)
    const high = pixels.reduce((maximum, pixel) => Math.max(maximum, pixel), -Infinity)
    if (orientation === 'x') {
      bounds.x0 = clamp(low, bounds.x0, bounds.x1)
      bounds.x1 = clamp(high, bounds.x0, bounds.x1)
    } else {
      bounds.y0 = clamp(low, bounds.y0, bounds.y1)
      bounds.y1 = clamp(high, bounds.y0, bounds.y1)
    }
    projected.add(orientation)
  }
  return validBounds(bounds, value.mode) ? bounds : undefined
}

export function selectionFor(
  bounds: BrushBounds,
  mode: BrushSelectionMode,
  context: ScaleContext,
): BrushSelection | undefined {
  const ranges: Record<string, readonly ScaleValue[]> = {}
  for (const { name, binding, orientation } of selectedScales(context, mode)) {
    const start = orientation === 'x' ? bounds.x0 : bounds.y0
    const end = orientation === 'x' ? bounds.x1 : bounds.y1
    if (binding.scale.kind === 'band') {
      const categories = binding.scale.domain.get().filter((value) => {
        const bandStart = binding.project(value)
        const bandEnd = bandStart + binding.bandwidth
        return Math.max(bandStart, bandEnd) > start && Math.min(bandStart, bandEnd) < end
      })
      if (categories.length) ranges[name] = Object.freeze(categories)
    } else {
      const first = binding.invert(start)
      const second = binding.invert(end)
      if (!Number.isFinite(first) || !Number.isFinite(second) || first === second) continue
      ranges[name] = Object.freeze([Math.min(first, second), Math.max(first, second)])
    }
  }
  if (!Object.keys(ranges).length) return undefined
  return Object.freeze({ mode, scales: Object.freeze(ranges) })
}

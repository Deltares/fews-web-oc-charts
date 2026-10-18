import type { AxisSide } from '../plot/axis.js'
import { finiteNonnegative } from '../core/validation.js'

export interface Size {
  width: number
  height: number
}
export interface Margins {
  top: number
  right: number
  bottom: number
  left: number
}
export interface Region extends Size {
  x: number
  y: number
}
export interface AxisMeasure {
  position: AxisSide
  thickness: number
}
export interface PlotLayout {
  readonly plot: Readonly<Region>
  readonly axes: readonly Readonly<Region>[]
  readonly title: Readonly<Region>
  readonly margins: Readonly<Margins>
}

export function layout(
  size: Size,
  axes: readonly AxisMeasure[] = [],
  margins: Margins = { top: 8, right: 8, bottom: 8, left: 8 },
  titleHeight = 0,
): PlotLayout {
  finiteNonnegative(size.width, 'size.width')
  finiteNonnegative(size.height, 'size.height')
  finiteNonnegative(titleHeight, 'titleHeight')
  for (const side of ['top', 'right', 'bottom', 'left'] as const) {
    finiteNonnegative(margins[side], `margins.${side}`)
  }
  const used = { ...margins, top: margins.top + titleHeight }
  for (const entry of axes) {
    finiteNonnegative(entry.thickness, 'axis.thickness')
    used[entry.position] += entry.thickness
  }
  const plot = Object.freeze({
    x: Math.min(used.left, size.width),
    y: Math.min(used.top, size.height),
    width: Math.max(0, size.width - used.left - used.right),
    height: Math.max(0, size.height - used.top - used.bottom),
  })
  const offsets: Margins = { top: 0, right: 0, bottom: 0, left: 0 }
  const bands = axes.map(({ position, thickness }) => {
    const horizontal = position === 'top' || position === 'bottom'
    const offset = offsets[position]
    offsets[position] += thickness
    return Object.freeze({
      x: horizontal
        ? plot.x
        : position === 'left'
          ? plot.x - offset - thickness
          : plot.x + plot.width + offset,
      y: !horizontal
        ? plot.y
        : position === 'top'
          ? plot.y - offset - thickness
          : plot.y + plot.height + offset,
      width: horizontal ? plot.width : thickness,
      height: horizontal ? thickness : plot.height,
    })
  })
  return Object.freeze({
    plot,
    axes: Object.freeze(bands),
    title: Object.freeze({ x: plot.x, y: margins.top, width: plot.width, height: titleHeight }),
    margins: Object.freeze(used),
  })
}

export function createTextMeasurer() {
  let context: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null | undefined
  const cache = new Map<string, number>()
  return {
    measure(text: string, font: string): number {
      const key = `${font}\0${text}`
      const cached = cache.get(key)
      if (cached !== undefined) return cached
      context ??=
        typeof OffscreenCanvas === 'function'
          ? new OffscreenCanvas(1, 1).getContext('2d')
          : document.createElement('canvas').getContext('2d')
      if (!context) throw new Error('A 2D context is required to measure axis labels.')
      context.font = font
      const width = context.measureText(text).width
      if (cache.size >= 512) cache.clear()
      cache.set(key, width)
      return width
    },
    clear() {
      cache.clear()
      context = undefined
    },
  }
}

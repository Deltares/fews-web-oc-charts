import type { CrosshairHandle } from './crosshair.js'
import type { PlotContext } from './plugin-definition.js'
import { nearestPoint } from './point-hit-testing.js'
import type { ScaleValue } from '../scales/scale.js'

export function displayInspectionValue(
  value: ScaleValue,
  context: PlotContext,
  scaleName: string,
  digits?: number,
) {
  const scale = context.scales[scaleName]?.scale
  if (scale?.kind === 'time' && typeof value === 'number') {
    const options = scale.options.get().resolved
    return new Intl.DateTimeFormat(options.locale, {
      timeZone: options.timeZone,
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value))
  }
  if (typeof value === 'number' && digits !== undefined) {
    return String(Number(value.toFixed(digits)))
  }
  return String(value)
}

export function inspectCrosshair(
  handle: CrosshairHandle,
  context: Omit<PlotContext, 'scope' | 'inspectCrosshair'>,
) {
  const options = handle.options.get().resolved
  context.options.get()
  const pointer = context.pointer.get()
  const region = context.regions.get().plot
  const point = { x: pointer.px + region.x, y: pointer.py + region.y }
  const hit =
    pointer.inside && options.snap
      ? nearestPoint(options.snap.mark, context.scales, point, options.snap.axis, region)
      : undefined
  const visible = pointer.inside && (!options.snap || !!hit)
  const resolved = hit ? { x: hit.px, y: hit.py } : point
  const coordinates = (['x', 'y'] as const).flatMap((axis) => {
    const scaleName = options.labels?.[axis]
    if (!visible || !options.mode.includes(axis) || !scaleName) return []
    const binding = context.scales[scaleName]
    if (!binding) return []
    const domain = binding.scale.domain.get()
    if (binding.scale.kind === 'band' && !domain.length) return []
    const value =
      hit && options.snap?.mark[axis] === scaleName
        ? hit[axis]
        : binding.scale.kind === 'band'
          ? domain.reduce((closest, value) =>
              Math.abs(binding.project(value) - resolved[axis]) <
              Math.abs(binding.project(closest) - resolved[axis])
                ? value
                : closest,
            )
          : binding.invert(resolved[axis])
    const digits =
      hit && options.snap?.mark[axis] === scaleName
        ? axis === 'y'
          ? options.snap.mark.digits
          : undefined
        : 2
    return [{ axis, scale: scaleName, value, digits }]
  })
  return { point: resolved, visible, hit, options, coordinates }
}

export type CrosshairInspection = ReturnType<typeof inspectCrosshair>

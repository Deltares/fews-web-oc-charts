import type { CrosshairHandle, CrosshairSnapOptions } from './crosshair.js'
import type { PlotContext } from './plugin-definition.js'
import { nearestPoint, type PointHit } from './point-hit-testing.js'
import type { ScaleValue } from '../scales/scale.js'
import { isLineMark } from './line.js'
import { isSeriesMark } from './series.js'
import { isBarMark } from './bar.js'
import { isStackedAreaMark } from './stacked-area.js'
import { compositeHits, type CompositeHit } from './composite-hit-testing.js'
import type { PlotLayout } from '../layout/layout.js'

let areaPathContext: CanvasRenderingContext2D | undefined

export interface CrosshairLayerGuide {
  readonly hit: CompositeHit
  /** SVG y coordinate of the layer's cumulative upper bound. */
  readonly py: number
}

function snapHits(
  snap: CrosshairSnapOptions,
  context: Omit<PlotContext, 'scope' | 'inspectCrosshair'>,
  point: { readonly x: number; readonly y: number },
  regions: PlotLayout,
): readonly (PointHit | CompositeHit)[] {
  if (isLineMark(snap.mark) || isSeriesMark(snap.mark)) {
    const hit = nearestPoint(snap.mark, context.scales, point, snap.axis, regions.plot)
    return hit ? [hit] : []
  }

  if (isStackedAreaMark(snap.mark)) {
    areaPathContext ??= document.createElement('canvas').getContext('2d') ?? undefined
    if (!areaPathContext) {
      throw new Error('Crosshair snapping to stacked areas requires a 2D canvas context.')
    }
  } else if (!isBarMark(snap.mark)) {
    return []
  }
  return compositeHits(snap.mark, context.scales, point, snap.axis, regions.plot, areaPathContext)
}

function nearestHit<T extends PointHit | CompositeHit>(
  hits: readonly T[],
  point: { readonly y: number },
) {
  return hits.reduce<T | undefined>(
    (nearest, hit) =>
      !nearest || Math.abs(hit.py - point.y) < Math.abs(nearest.py - point.y) ? hit : nearest,
    undefined,
  )
}

/** Vertical composites snapped along x get one horizontal guide per visible layer. */
function layerGuides(
  snap: CrosshairSnapOptions | undefined,
  hits: readonly (PointHit | CompositeHit)[],
  context: Omit<PlotContext, 'scope' | 'inspectCrosshair'>,
): readonly CrosshairLayerGuide[] {
  if (snap?.axis !== 'x') return []
  const vertical =
    isStackedAreaMark(snap.mark) ||
    (isBarMark(snap.mark) && snap.mark.options.get().resolved.orientation === 'vertical')
  if (!vertical) return []
  const valueScale = context.scales[snap.mark.y]
  return hits.flatMap((hit) => {
    if (!('layerId' in hit) || !Number.isFinite(hit.upper)) return []
    const py = valueScale.project(hit.upper)
    return Number.isFinite(py) ? [Object.freeze({ hit, py })] : []
  })
}

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
  const regions = context.regions.get()
  const region = regions.plot
  const point = { x: pointer.px + region.x, y: pointer.py + region.y }
  const hits = pointer.inside && options.snap ? snapHits(options.snap, context, point, regions) : []
  const hit = nearestHit(hits, point)
  const layers = layerGuides(options.snap, hits, context)
  const visible = pointer.inside && (!options.snap || !!hit)
  const resolved = hit ? { x: hit.px, y: hit.py } : point
  const coordinates = (['x', 'y'] as const).flatMap((axis) => {
    const scaleName = options.labels?.[axis]
    if (!visible || !scaleName) return []
    if (axis === 'y' && layers.length) {
      if (scaleName !== options.snap?.mark.y) return []
      return layers.map(({ hit: layer, py }) => ({
        axis,
        scale: scaleName,
        value: layer.upper as ScaleValue,
        digits: 2 as number | undefined,
        position: py,
        layerId: layer.layerId as string | undefined,
      }))
    }
    if (!options.mode.includes(axis)) return []
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
        ? (isLineMark(options.snap.mark) || isSeriesMark(options.snap.mark)) && axis === 'y'
          ? options.snap.mark.digits
          : axis === 'y'
            ? 2
            : undefined
        : 2
    return [
      {
        axis,
        scale: scaleName,
        value,
        digits,
        position: resolved[axis],
        layerId: undefined as string | undefined,
      },
    ]
  })
  return { point: resolved, visible, hit, hits, layers, options, coordinates }
}

export type CrosshairInspection = ReturnType<typeof inspectCrosshair>

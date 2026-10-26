import type { PlotContext } from './plugin-definition.js'
import type { CrosshairHandle } from './crosshair/crosshair.js'
import type { CrosshairInspection } from '../interaction/inspection.js'
import type { HeatmapHit } from '../interaction/heatmap-hit-testing.js'
import type { PlotPointer } from '../interaction/pointer-hub.js'
import type { Region } from '../../layout/layout.js'
import { isLineMark, type LineMark } from '../marks/line/line.js'
import { isSeriesMark, type SeriesMark } from '../marks/line/series.js'
import { isBarMark, type BarMark } from '../marks/bar/bar.js'
import { isStackedAreaMark, type StackedAreaMark } from '../marks/stacked-area/stacked-area.js'
import { isHistogramMark, type HistogramMark } from '../marks/histogram/histogram.js'
import { isHeatmapMark, type HeatmapMark } from '../marks/heatmap/heatmap.js'
import { markDefinition } from '../marks/marks.js'
import type { MarkHit } from '../marks/mark-definition.js'
import type { ThemeTokens } from '../../theme/theme.js'
import { resolveMarkColor } from '../../theme/color-contrast.js'

/** Marks that can be inspected by pointer plugins such as tooltip() and highlight(). */
export type HoverMark =
  LineMark | SeriesMark | BarMark | StackedAreaMark | HistogramMark | HeatmapMark

export interface HoverHit {
  readonly mark: HoverMark
  readonly hit: MarkHit
  /** Position of the mark in the inspected mark list. */
  readonly index: number
}

export interface HoverSelection {
  readonly point: { readonly x: number; readonly y: number }
  readonly inspection: CrosshairInspection | undefined
  readonly hits: readonly HoverHit[]
}

export function isHoverMark(mark: object): mark is HoverMark {
  return (
    isLineMark(mark) ||
    isSeriesMark(mark) ||
    isBarMark(mark) ||
    isStackedAreaMark(mark) ||
    isHistogramMark(mark) ||
    isHeatmapMark(mark)
  )
}

export function isHeatmapHit(hit: MarkHit): hit is HeatmapHit {
  return 'xStart' in hit
}

/** Selects the hits under the pointer, following an installed crosshair when given. */
export function selectHoverHits(
  options: {
    readonly axis: 'x' | 'y' | 'xy'
    readonly marks?: readonly HoverMark[]
    readonly crosshair?: CrosshairHandle
  },
  context: Pick<PlotContext, 'scales' | 'inspectCrosshair'>,
  state: {
    readonly marks: readonly object[]
    readonly pointer: PlotPointer
    readonly region: Readonly<Region>
  },
  pathContext: () => CanvasRenderingContext2D | undefined,
): HoverSelection {
  const { pointer, region } = state
  const marks = options.marks ?? state.marks.filter(isHoverMark)
  const inspection = options.crosshair ? context.inspectCrosshair(options.crosshair) : undefined
  const point = inspection?.point ?? { x: pointer.px + region.x, y: pointer.py + region.y }
  const axis = inspection?.options.snap?.axis ?? options.axis
  const hits: HoverHit[] =
    pointer.inside && (!inspection || inspection.visible)
      ? marks.flatMap<HoverHit>((mark, index): HoverHit[] => {
          if (axis === 'xy' && inspection?.options.snap && mark !== inspection.options.snap.mark) {
            return []
          }
          const markHits =
            inspection?.options.snap?.mark === mark
              ? inspection.hits
              : (markDefinition(mark).hits?.(mark, {
                  scales: context.scales,
                  point,
                  axis,
                  plot: region,
                  pathContext,
                }) ?? [])
          return markHits.map((hit) => ({ mark, hit, index }))
        })
      : []
  const selected =
    axis === 'xy'
      ? hits.reduce<HoverHit[]>(
          (closest, item) =>
            !closest.length || item.hit.distance < closest[0].hit.distance ? [item] : closest,
          [],
        )
      : hits
  return { point, inspection, hits: selected }
}

/** Resolves the color of the hovered datum, including composite layers and heatmap cells. */
export function markColor(
  mark: HoverMark,
  hit: MarkHit,
  tokens: ThemeTokens,
  role: 'mark' | 'text' = 'mark',
  background = tokens.background,
) {
  const resolve = (color: string | undefined) =>
    resolveMarkColor(
      color ??
        (tokens.colorContrast === 'auto'
          ? tokens.accent
          : 'var(--fews-chart-accent, currentColor)'),
      tokens,
      role,
      background,
    )
  if ('layerId' in hit && (isBarMark(mark) || isStackedAreaMark(mark))) {
    const options = mark.options.get().resolved
    const layer = options.layers?.find((candidate) => candidate.id === hit.layerId)
    return resolve(layer?.fill ?? options.fill)
  }
  if (isLineMark(mark) || isSeriesMark(mark)) {
    return resolve(mark.stroke ?? mark.markers?.fill)
  }
  if (isHistogramMark(mark)) {
    return resolve(mark.options.get().resolved.fill)
  }
  if (isHeatmapMark(mark) && isHeatmapHit(hit)) {
    return mark.options.get().resolved.color.map(hit.value)
  }
  return resolve(undefined)
}

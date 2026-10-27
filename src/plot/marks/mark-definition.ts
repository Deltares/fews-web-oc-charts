import type { Region } from '../../layout/layout.js'
import {
  autoscaleWindow,
  type ScaleBinding,
  type ScaleHandle,
  type ScaleValue,
} from '../../scales/scale.js'
import type { ThemeTokens } from '../../theme/theme.js'
import type { SymbolSpec } from '../plugins/legend/legend.js'
import type { PointHit } from '../interaction/point-hit-testing.js'
import type { CompositeHit } from '../interaction/composite-hit-testing.js'
import type { HeatmapHit } from '../interaction/heatmap-hit-testing.js'
import type { EnsembleHit } from '../interaction/ensemble-hit-testing.js'

export type MarkHit = PointHit | CompositeHit | HeatmapHit | EnsembleHit

export interface MarkHitContext {
  readonly scales: Readonly<Record<string, ScaleBinding>>
  readonly point: { readonly x: number; readonly y: number }
  readonly axis: 'x' | 'y' | 'xy'
  readonly plot: Readonly<Region>
  pathContext(this: void): CanvasRenderingContext2D | undefined
}

/** Pixel-space shape drawn over a hovered datum; strokes default to `currentColor`. */
export type HighlightShape =
  | {
      readonly type: 'circle'
      readonly cx: number
      readonly cy: number
      readonly r: number
      readonly fill: string
      readonly stroke?: string
    }
  | {
      readonly type: 'rect'
      readonly x: number
      readonly y: number
      readonly width: number
      readonly height: number
      readonly fill?: string
      readonly stroke?: string
    }
  | { readonly type: 'path'; readonly d: string; readonly fill?: string; readonly stroke?: string }

export interface MarkHighlightContext {
  readonly scales: Readonly<Record<string, ScaleBinding>>
  /** Resolved color of the hovered datum. */
  readonly color: string
  readonly tokens: ThemeTokens
}

export interface MarkLegendLayer {
  readonly id: string
  readonly label?: string
  readonly stack?: string
  readonly symbol: SymbolSpec
  visible(): boolean
  setVisible(this: void, visible: boolean): void
}

export interface MarkLegend {
  readonly label?: string
  /** Legend group heading; marks sharing a group are toggled together. */
  readonly group?: string
  readonly symbol: SymbolSpec
  readonly layers?: readonly MarkLegendLayer[]
  visible(): boolean
  setVisible(this: void, visible: boolean): void
}

export type CoordinateSystem = 'cartesian' | 'polar' | 'skewT'
export type Orientation = 'x' | 'y' | 'angular' | 'radial'

export interface MarkValidationContext {
  readonly coordinateSystem: CoordinateSystem
  readonly scales: Readonly<Record<string, ScaleHandle>>
  direction(this: void, scale: string): Orientation
}

export interface MarkRenderContext {
  readonly skew?: number
  readonly localCoordinates?: boolean
  readonly coordinateSystem: CoordinateSystem
  readonly scales: Readonly<Record<string, ScaleBinding>>
  readonly plot: Readonly<Region>
  direction(this: void, scale: string): Orientation
}

export interface MarkExtentContext {
  readonly scale: string
  readonly scales: Readonly<Record<string, ScaleHandle>>
  readonly mode: 'data' | 'visible'
  add(this: void, value: ScaleValue): void
}

/**
 * Owns the rendering resources of one plotted mark. All kinds reuse a renderer for
 * the same kind and explicit id, or for the same handle when no id is supplied.
 * Position never determines identity. Replacements must refresh geometry and style,
 * including removing obsolete child nodes. Unmatched renderers are destroyed.
 */
export interface MarkRenderer<M> {
  /** Appends the renderer's nodes to the marks layer; called in plot order when the mark list changes. */
  mount(layer: SVGGElement, mark: M): void
  geometry(mark: M, context: MarkRenderContext): void
  style(mark: M, tokens: ThemeTokens): void
  destroy(): void
}

/** Everything a plot needs to know about one kind of mark. */
export interface MarkDefinition<M extends object> {
  /** Factory name used in error messages, e.g. `line`. */
  readonly name: string
  is(value: object): value is M
  validate(mark: M, context: MarkValidationContext): void
  extents(mark: M, context: MarkExtentContext): void
  createRenderer(): MarkRenderer<M>
  /** Returns datum hits; omitted for marks without an inspection contract. */
  hits?(mark: M, context: MarkHitContext): readonly MarkHit[]
  /** Returns shapes that mark one of this mark's hits as selected. */
  highlight?(mark: M, hit: MarkHit, context: MarkHighlightContext): readonly HighlightShape[]
  /** Supplies symbols and visibility operations without reading data or rendered nodes. */
  legend?(mark: M, tokens: ThemeTokens): MarkLegend | undefined
  /** Reads reactive state for this handle; subscriptions are replaced even when its renderer is reused. */
  track?(mark: M): void
  /** Registers validation of option updates against the plot; returns a disposer. */
  validateUpdates?(mark: M, context: () => MarkValidationContext): () => void
}

export function createKeyCache() {
  let previous: readonly unknown[] | undefined
  return {
    changed(key: readonly unknown[]) {
      const last = previous
      if (last?.length === key.length && key.every((value, index) => value === last[index])) {
        return false
      }
      previous = key
      return true
    },
    clear() {
      previous = undefined
    },
  }
}

export function scaleKey(binding: ScaleBinding): unknown[] {
  return [
    binding,
    binding.scale.domain.version,
    binding.scale.options.version,
    ...binding.range.get(),
  ]
}

export function accent(tokens: ThemeTokens) {
  return tokens.colorContrast === 'auto'
    ? tokens.accent
    : `var(--fews-chart-accent, ${tokens.accent})`
}

export function setMarkId(node: SVGElement | undefined, id: string | undefined) {
  if (!node) return
  if (id) node.dataset.markId = id
  else delete node.dataset.markId
}

export function isScaleValue(value: unknown): value is ScaleValue {
  return typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))
}

export function extentWindow(context: MarkExtentContext, opposite: string) {
  return context.mode === 'visible' ? autoscaleWindow(context.scales[opposite]) : undefined
}

export function withinWindow(value: ScaleValue, window: readonly ScaleValue[]) {
  return typeof value === 'string'
    ? window.includes(value)
    : value >= Number(window[0]) && value <= Number(window[1])
}

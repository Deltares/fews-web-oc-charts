import type { Region } from '../layout/layout.js'
import {
  autoscaleWindow,
  type ScaleBinding,
  type ScaleHandle,
  type ScaleValue,
} from '../scales/scale.js'
import type { ThemeTokens } from '../theme/theme.js'

export type CoordinateSystem = 'cartesian' | 'polar'
export type Orientation = 'x' | 'y' | 'angular' | 'radial'

export interface MarkValidationContext {
  readonly coordinateSystem: CoordinateSystem
  readonly scales: Readonly<Record<string, ScaleHandle>>
  direction(scale: string): Orientation
}

export interface MarkRenderContext {
  readonly coordinateSystem: CoordinateSystem
  readonly scales: Readonly<Record<string, ScaleBinding>>
  readonly plot: Readonly<Region>
  direction(scale: string): Orientation
}

export interface MarkExtentContext {
  readonly scale: string
  readonly scales: Readonly<Record<string, ScaleHandle>>
  readonly mode: 'data' | 'visible'
  add(value: ScaleValue): void
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
  return `var(--fews-chart-accent, ${tokens.accent})`
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

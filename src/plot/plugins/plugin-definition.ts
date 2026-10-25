import type { OptionStateSnapshot } from '../../core/options.js'
import type { ReactiveScope, ReadonlySignal } from '../../core/reactive.js'
import type { PlotLayout, Size } from '../../layout/layout.js'
import type { ScaleBinding, ScaleHandle } from '../../scales/scale.js'
import type { PlotOptions } from '../create-plot.js'
import type { CoordinateSystem, Orientation } from '../marks/mark-definition.js'
import type {
  GestureHandler,
  GestureType,
  PlotPointer,
  PlotPosition,
} from '../interaction/pointer-hub.js'
import type { LegendModel } from './legend/legend.js'
import type { CrosshairHandle } from './crosshair/crosshair.js'
import type { CrosshairInspection } from '../interaction/inspection.js'
import type { ThemeTokens } from '../../theme/theme.js'

/** The read-only view of a plot that an installed plugin receives. */
export interface PlotContext {
  readonly owner: symbol
  readonly element: SVGSVGElement
  readonly coordinateSystem: CoordinateSystem
  readonly options: ReadonlySignal<OptionStateSnapshot<PlotOptions>>
  readonly size: ReadonlySignal<Readonly<Size>>
  readonly regions: ReadonlySignal<PlotLayout>
  readonly pointer: ReadonlySignal<PlotPointer>
  /** Observes local input publications only, never a projected shared pointer. */
  onPointer(listener: (pointer: PlotPointer) => void): () => void
  readonly legend: LegendModel
  readonly theme: ReadonlySignal<ThemeTokens>
  /** Measures an application-layout viewport instead of the original plot host. */
  useViewport(element: HTMLElement): () => void
  /** Plot-local scale bindings with ranges in SVG coordinates. */
  readonly scales: Readonly<Record<string, ScaleBinding>>
  /** Owned by the installed plugin and disposed when it is removed. */
  readonly scope: ReactiveScope
  inspectCrosshair(handle: CrosshairHandle): CrosshairInspection
  direction(name: string): Orientation
  locate(event: { readonly clientX: number; readonly clientY: number }): PlotPosition | undefined
  /** Registers a gesture handler that is released automatically with the plugin. */
  on<K extends GestureType>(type: K, handler: GestureHandler<K>): () => void
}

export interface PluginValidationContext {
  readonly owner?: symbol
  readonly coordinateSystem: CoordinateSystem
  readonly plugins: readonly object[]
  readonly marks: readonly object[]
  readonly scales: Readonly<Record<string, ScaleHandle>>
  direction(name: string): Orientation
}

export interface InstalledPlugin {
  destroy?(): void
}

export interface PluginDefinition<H extends object> {
  readonly name: string
  is(value: object): value is H
  validate?(plugin: H, context: PluginValidationContext): void
  install(plugin: H, context: PlotContext): InstalledPlugin
}

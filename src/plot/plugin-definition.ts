import type { OptionStateSnapshot } from '../core/options.js'
import type { ReactiveScope, ReadonlySignal } from '../core/reactive.js'
import type { PlotLayout, Size } from '../layout/layout.js'
import type { ScaleBinding, ScaleHandle } from '../scales/scale.js'
import type { PlotOptions } from './create-plot.js'
import type { CoordinateSystem, Orientation } from './mark-definition.js'
import type { GestureHandler, GestureType, PlotPointer, PlotPosition } from './pointer-hub.js'

/** The read-only view of a plot that an installed plugin receives. */
export interface PlotContext {
  readonly element: SVGSVGElement
  readonly coordinateSystem: CoordinateSystem
  readonly options: ReadonlySignal<OptionStateSnapshot<PlotOptions>>
  readonly size: ReadonlySignal<Readonly<Size>>
  readonly regions: ReadonlySignal<PlotLayout>
  readonly pointer: ReadonlySignal<PlotPointer>
  /** Plot-local scale bindings with ranges in SVG coordinates. */
  readonly scales: Readonly<Record<string, ScaleBinding>>
  /** Owned by the installed plugin and disposed when it is removed. */
  readonly scope: ReactiveScope
  direction(name: string): Orientation
  locate(event: { readonly clientX: number; readonly clientY: number }): PlotPosition | undefined
  /** Registers a gesture handler that is released automatically with the plugin. */
  on<K extends GestureType>(type: K, handler: GestureHandler<K>): () => void
}

export interface PluginValidationContext {
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

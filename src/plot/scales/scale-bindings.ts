import { reactive } from '../../core/runtime.js'
import type { ReadonlySignal, ReactiveScope } from '../../core/reactive.js'
import {
  bindScale,
  registerScaleExtents,
  type ScaleBinding,
  type ScaleHandle,
  type ScaleRange,
} from '../../scales/scale.js'
import type { PlotLayout } from '../../layout/layout.js'
import type { CoordinateSystem, Orientation } from '../marks/mark-definition.js'
import { markExtents } from '../marks/mark-extents.js'
import { skewTMarkExtents } from '../coordinates/skew-t-extents.js'
import { direction } from '../plot-validation.js'
import type { PlotOptions } from '../create-plot.js'

export interface ScaleBindingsContext {
  readonly scope: ReactiveScope
  readonly coordinateSystem: CoordinateSystem
  readonly regions: ReadonlySignal<PlotLayout>
  readonly options: () => PlotOptions
}

export interface ScaleBindings {
  /** Bindings whose ranges are in SVG coordinates; used by axes, layout and interaction. */
  readonly scales: Readonly<Record<string, ScaleBinding>>
  /** Bindings used to project marks; plot-local for inset Cartesian layouts. */
  readonly markScales: Readonly<Record<string, ScaleBinding>>
  reconcile(current: PlotOptions): void
  /** Tracks every bound scale's domain and options; returns values for change detection. */
  trackDependencies(): unknown[]
  dispose(): void
}

interface BindingEntry {
  readonly scale: ScaleHandle
  readonly direction: Orientation
  readonly binding: ScaleBinding
  readonly markBinding: ScaleBinding
  readonly scope: ReactiveScope
  stopExtents(): void
}

const empty: Readonly<Record<string, ScaleBinding>> = Object.freeze({})

export function createScaleBindings(context: ScaleBindingsContext): ScaleBindings {
  const { coordinateSystem, regions, options } = context
  const scope = context.scope.createScope()
  const entries = new Map<string, BindingEntry>()
  let scales = empty
  let markScales = empty

  function release(entry: BindingEntry) {
    entry.stopExtents()
    entry.scope.dispose()
  }

  function svgRange(scale: ScaleHandle, orientation: Orientation) {
    return reactive.computed<ScaleRange>(
      () => {
        const plot = regions.get().plot
        if (orientation === 'angular') {
          return Object.freeze([...(scale.options.get().resolved.range ?? [0, 2 * Math.PI])])
        }
        if (orientation === 'radial') {
          const radius = Math.min(plot.width, plot.height) / 2
          const innerRadius = scale.options.get().resolved.innerRadius ?? 0
          return Object.freeze([radius * innerRadius, radius])
        }
        return Object.freeze(
          orientation === 'x' ? [plot.x, plot.x + plot.width] : [plot.y + plot.height, plot.y],
        )
      },
      (a, b) => a[0] === b[0] && a[1] === b[1],
    )
  }

  function markRange(binding: ScaleBinding, orientation: Orientation) {
    return reactive.computed<ScaleRange>(() => {
      if (options().axisLayout !== 'inset' || coordinateSystem === 'polar') {
        return binding.range.get()
      }
      const plot = regions.get().plot
      return Object.freeze(orientation === 'x' ? [0, plot.width] : [plot.height, 0])
    })
  }

  function bind(name: string, scale: ScaleHandle, current: PlotOptions): BindingEntry {
    const bindingScope = scope.createScope()
    const orientation = direction(current, name, undefined, undefined, coordinateSystem)
    const binding = bindingScope.run(() => bindScale(scale, svgRange(scale, orientation)))
    const markBinding = bindingScope.run(() => bindScale(scale, markRange(binding, orientation)))
    const stopExtents = registerScaleExtents(scale, (mode) => {
      const config = options()
      if (config.scales[name] !== scale) return undefined
      if (coordinateSystem === 'skewT') {
        return skewTMarkExtents(config.marks, config.scales, name, mode, config.skewT!.skew)
      }
      return markExtents(config.marks, config.scales, name, mode)
    })
    return {
      scale,
      direction: orientation,
      binding,
      markBinding,
      scope: bindingScope,
      stopExtents,
    }
  }

  return {
    get scales() {
      return scales
    },
    get markScales() {
      return markScales
    },
    reconcile(current) {
      for (const [name, entry] of entries) {
        if (
          entry.scale !== current.scales[name] ||
          entry.direction !== direction(current, name, undefined, undefined, coordinateSystem)
        ) {
          release(entry)
          entries.delete(name)
        }
      }
      for (const [name, scale] of Object.entries(current.scales)) {
        if (!entries.has(name)) entries.set(name, bind(name, scale, current))
      }
      const localMarks = current.axisLayout === 'inset' && coordinateSystem === 'cartesian'
      scales = Object.freeze(
        Object.fromEntries([...entries].map(([name, entry]) => [name, entry.binding])),
      )
      markScales = Object.freeze(
        Object.fromEntries(
          [...entries].map(([name, entry]) => [
            name,
            localMarks ? entry.markBinding : entry.binding,
          ]),
        ),
      )
    },
    trackDependencies() {
      const dependencies: unknown[] = []
      for (const entry of entries.values()) {
        entry.scale.domain.get()
        entry.scale.options.get()
        dependencies.push(entry.binding, entry.scale.domain.version, entry.scale.options.version)
      }
      return dependencies
    },
    dispose() {
      for (const entry of entries.values()) entry.stopExtents()
      scope.dispose()
      entries.clear()
      scales = empty
      markScales = empty
    },
  }
}

import type { ReactiveScope, ComputedSignal } from '../../core/reactive.js'
import { reactive } from '../../core/runtime.js'
import type { CrosshairHandle } from './crosshair/crosshair.js'
import { inspectCrosshair, type CrosshairInspection } from '../interaction/inspection.js'
import type { PlotContext, PluginDefinition, PluginValidationContext } from './plugin-definition.js'
import type { PanHandle } from './pan/pan.js'
import type { BrushHandle } from './brush/brush.js'
import type { ZoomHandle } from './zoom/zoom.js'
import type { TooltipHandle } from './tooltip/tooltip.js'
import type { HighlightHandle } from './highlight/highlight.js'
import type { LegendHandle } from './legend/legend-plugin.js'
import type { CrossSectionSelectHandle } from './cross-section-select/cross-section-select.js'

export type PlotPlugin =
  | ZoomHandle
  | PanHandle
  | BrushHandle
  | CrosshairHandle
  | TooltipHandle
  | HighlightHandle
  | LegendHandle
  | CrossSectionSelectHandle

const pluginNames = [
  'zoom',
  'pan',
  'brush',
  'crosshair',
  'tooltip',
  'highlight',
  'legend',
  'crossSectionSelect',
]

const names = pluginNames.map((name) => `${name}()`)
const supportedPlugins = `${names.slice(0, -1).join(', ')} or ${names.at(-1)}`

/**
 * Definitions are attached to handles by the public plugin factories, so a plot bundles
 * only the plugins an application creates.
 */
const definitions = new WeakMap<object, PluginDefinition<PlotPlugin>>()

/** Makes a plugin handle installable; called by each public plugin factory. */
export function registerPlugin<H extends PlotPlugin>(
  handle: H,
  definition: PluginDefinition<H>,
): H {
  definitions.set(handle, definition as unknown as PluginDefinition<PlotPlugin>)
  return handle
}

function findPluginDefinition(value: unknown): PluginDefinition<PlotPlugin> | undefined {
  if (!value || typeof value !== 'object') return undefined
  return definitions.get(value)
}

export function isPlotPlugin(value: object): value is PlotPlugin {
  return findPluginDefinition(value) !== undefined
}

export function validatePlugins(plugins: readonly unknown[], context: PluginValidationContext) {
  const definitions = plugins.map((plugin) => {
    const definition = findPluginDefinition(plugin)
    if (!definition) throw new Error(`plot.plugins accepts ${supportedPlugins} plugins only.`)
    return definition
  })
  if (new Set(plugins).size !== plugins.length) {
    throw new Error('Duplicate plugin handle in plot.plugins.')
  }
  definitions.forEach((definition, index) =>
    definition.validate?.(plugins[index] as PlotPlugin, context),
  )
}

/** Plot state supplied to the plugin host; `scales` must be a live getter. */
export type SharedPlotContext = Omit<PlotContext, 'scope' | 'inspectCrosshair'>

export interface PluginHost {
  reconcile(plugins: readonly PlotPlugin[]): void
  dispose(): void
}

interface MountedPlugin {
  readonly scope: ReactiveScope
  readonly releases: Set<() => void>
  destroy?(): void
}

export function createPluginHost(
  parentScope: ReactiveScope,
  shared: SharedPlotContext,
): PluginHost {
  const mounted = new Map<PlotPlugin, MountedPlugin>()
  const inspections = new Map<CrosshairHandle, ComputedSignal<CrosshairInspection>>()

  function uninstall(entry: MountedPlugin) {
    try {
      entry.destroy?.()
    } finally {
      for (const release of entry.releases) release()
      entry.releases.clear()
      entry.scope.dispose()
    }
  }

  function install(plugin: PlotPlugin): MountedPlugin {
    const scope = parentScope.createScope()
    const releases = new Set<() => void>()
    const context: PlotContext = {
      owner: shared.owner,
      element: shared.element,
      coordinateSystem: shared.coordinateSystem,
      options: shared.options,
      size: shared.size,
      regions: shared.regions,
      pointer: shared.pointer,
      onPointer(listener) {
        const stop = shared.onPointer(listener)
        const release = () => {
          if (releases.delete(release)) stop()
        }
        releases.add(release)
        return release
      },
      legend: shared.legend,
      theme: shared.theme,
      suspended: shared.suspended,
      useViewport: (element) => shared.useViewport(element),
      get scales() {
        return shared.scales
      },
      scope,
      inspectCrosshair(handle) {
        let inspection = inspections.get(handle)
        if (!inspection) {
          inspection = parentScope.run(() =>
            reactive.computed(() => inspectCrosshair(handle, shared)),
          )
          inspections.set(handle, inspection)
        }
        return inspection.get()
      },
      direction: (name) => shared.direction(name),
      locate: (event) => shared.locate(event),
      on(type, handler) {
        const stop = shared.on(type, handler)
        const release = () => {
          if (releases.delete(release)) stop()
        }
        releases.add(release)
        return release
      },
    }
    try {
      const installed = findPluginDefinition(plugin)!.install(plugin, context)
      return { scope, releases, destroy: installed.destroy?.bind(installed) }
    } catch (error) {
      uninstall({ scope, releases })
      throw error
    }
  }

  return {
    reconcile(plugins) {
      for (const [plugin, entry] of mounted) {
        if (!plugins.includes(plugin)) {
          mounted.delete(plugin)
          uninstall(entry)
        }
      }
      for (const [handle, inspection] of inspections) {
        if (!plugins.includes(handle)) {
          inspection.dispose()
          inspections.delete(handle)
        }
      }
      for (const plugin of plugins) {
        if (!mounted.has(plugin)) mounted.set(plugin, install(plugin))
      }
      // SVG paints in DOM order; mouseover callouts must cover persistent cross-section labels.
      const crosshair = shared.element.querySelector(':scope > [data-layer="crosshair"]')
      if (crosshair) {
        for (const section of shared.element.querySelectorAll(
          ':scope > [data-layer="cross-section-select"]',
        )) {
          if (crosshair.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING) {
            shared.element.insertBefore(section, crosshair)
          }
        }
      }
    },
    dispose() {
      const entries = [...mounted.values()].reverse()
      mounted.clear()
      for (const entry of entries) uninstall(entry)
      for (const inspection of inspections.values()) inspection.dispose()
      inspections.clear()
    },
  }
}

import type { ReactiveScope } from '../core/reactive.js'
import type { PlotContext, PluginDefinition, PluginValidationContext } from './plugin-definition.js'
import { panDefinition } from './pan-plugin.js'
import { zoomDefinition } from './zoom-plugin.js'

/** Registering a definition here is all that is needed to make a plugin installable. */
const pluginDefinitions = [zoomDefinition, panDefinition] as const

type PluginOf<D> = D extends PluginDefinition<infer H> ? H : never

export type PlotPlugin = PluginOf<(typeof pluginDefinitions)[number]>

const names = pluginDefinitions.map(({ name }) => `${name}()`)
const supportedPlugins =
  names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} or ${names.at(-1)}`

function findPluginDefinition(value: unknown): PluginDefinition<PlotPlugin> | undefined {
  if (!value || typeof value !== 'object') return undefined
  return pluginDefinitions.find((definition) => definition.is(value))
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

/** Everything in PlotContext except the per-plugin scope; `scales` must be a live getter. */
export type SharedPlotContext = Omit<PlotContext, 'scope'>

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
      element: shared.element,
      coordinateSystem: shared.coordinateSystem,
      options: shared.options,
      size: shared.size,
      regions: shared.regions,
      pointer: shared.pointer,
      get scales() {
        return shared.scales
      },
      scope,
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
      for (const plugin of plugins) {
        if (!mounted.has(plugin)) mounted.set(plugin, install(plugin))
      }
    },
    dispose() {
      const entries = [...mounted.values()].reverse()
      mounted.clear()
      for (const entry of entries) uninstall(entry)
    },
  }
}

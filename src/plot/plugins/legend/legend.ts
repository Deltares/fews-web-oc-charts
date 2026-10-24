import type { ReadonlySignal, ReactiveScope } from '../../../core/reactive.js'
import { reactive } from '../../../core/runtime.js'
import type { ThemeTokens } from '../../../theme/theme.js'
import type { MarkLegendLayer } from '../../marks/mark-definition.js'
import type { PlotMark } from '../../marks/marks.js'
import { markDefinition } from '../../marks/marks.js'

export type LegendVisibility = 'visible' | 'hidden' | 'mixed'
export type LegendActionSource = 'api' | 'built-in' | 'external' | 'programmatic'
export type LegendCommandSource = Exclude<LegendActionSource, 'programmatic'>

export type SymbolPrimitiveSpec =
  | {
      readonly type: 'line'
      readonly stroke?: string
      readonly strokeWidth?: number
      readonly strokeDasharray?: string
      readonly strokeLinecap?: 'butt' | 'round' | 'square'
      readonly strokeLinejoin?: 'miter' | 'round' | 'bevel'
      readonly opacity?: number
    }
  | {
      readonly type: 'marker'
      readonly shape: 'circle'
      readonly fill?: string
      readonly stroke?: string
      readonly strokeWidth?: number
      readonly size?: number
      readonly opacity?: number
    }
  | {
      readonly type: 'area'
      readonly fill?: string
      readonly opacity?: number
      readonly stroke?: string
      readonly strokeWidth?: number
    }
  | {
      readonly type: 'bar'
      readonly fill?: string
      readonly stroke?: string
      readonly strokeWidth?: number
      readonly opacity?: number
    }
  | {
      /** Three bottom-aligned bars of decreasing height (histogram/heatmap). */
      readonly type: 'steps'
      readonly fill?: string
      readonly stroke?: string
      readonly strokeWidth?: number
      readonly opacity?: number
    }
  | {
      /** Vertical line through the swatch centre. */
      readonly type: 'rule'
      readonly stroke?: string
      readonly strokeWidth?: number
      readonly strokeDasharray?: string
      readonly opacity?: number
    }
  | {
      /** Horizontal shaft with an arrowhead pointing right. */
      readonly type: 'arrow'
      readonly color?: string
      readonly strokeWidth?: number
      readonly opacity?: number
    }
  | {
      /** Arrowhead pointing up. */
      readonly type: 'direction'
      readonly color?: string
      readonly opacity?: number
    }
  | {
      readonly type: 'text'
      readonly text?: string
      readonly fill?: string
      readonly fontFamily?: string
      readonly fontWeight?: string | number
      readonly opacity?: number
    }

export type SymbolSpec =
  | SymbolPrimitiveSpec
  | { readonly type: 'composite'; readonly parts: readonly SymbolPrimitiveSpec[] }
  | { readonly type: 'stack'; readonly parts: readonly SymbolPrimitiveSpec[] }
  | { readonly type: 'group' }

export interface LegendEntry {
  readonly id: string
  readonly markId: string
  readonly label: string
  readonly symbol: SymbolSpec
  readonly visibility: LegendVisibility
  readonly disabled: boolean
  readonly children: readonly LegendEntry[]
}

export interface LegendVisibilityChange {
  readonly id: string
  readonly visibility: LegendVisibility
}

export interface LegendToggleEventDetail {
  readonly action: 'toggle' | 'setVisible' | 'isolate' | 'showAll' | 'programmatic'
  readonly source: LegendActionSource
  readonly changes: readonly LegendVisibilityChange[]
}

export interface LegendModel {
  readonly entries: ReadonlySignal<readonly LegendEntry[]>
  toggle(id: string, source?: LegendCommandSource): void
  setVisible(id: string, visible: boolean, source?: LegendCommandSource): void
  isolate(id: string, source?: LegendCommandSource): void
  showAll(source?: LegendCommandSource): void
  dispose(): void
}

interface CommandNode {
  readonly id: string
  readonly parentId?: string
  readonly visibility: () => LegendVisibility
  readonly setVisible: (visible: boolean) => void
}

const generatedIds = new WeakMap<object, string>()
let nextGeneratedId = 0

function markId(mark: PlotMark) {
  if (mark.id) return mark.id
  let id = generatedIds.get(mark)
  if (!id) {
    id = `mark-${++nextGeneratedId}`
    generatedIds.set(mark, id)
  }
  return id
}

function immutable<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) immutable(child)
    Object.freeze(value)
  }
  return value
}

function freezeEntry(entry: LegendEntry): LegendEntry {
  return immutable(entry)
}

function visibilityOf(values: readonly boolean[]): LegendVisibility {
  if (values.every(Boolean)) return 'visible'
  if (values.every((value) => !value)) return 'hidden'
  return 'mixed'
}

export function createLegendModel(
  parentScope: ReactiveScope,
  marks: () => readonly PlotMark[],
  element: SVGSVGElement,
  theme: () => ThemeTokens,
): LegendModel {
  const scope = parentScope.createScope()
  const entries = reactive.signal<readonly LegendEntry[]>(Object.freeze([]))
  const nodeCommands = new Map<string, CommandNode>()
  const markKeys = new WeakMap<object, string>()
  let priorSignature = ''
  let nextLabel = 0
  let disposed = false

  function buildSnapshot(): readonly LegendEntry[] {
    nodeCommands.clear()
    const ids = new Set<string>()
    const roots: LegendEntry[] = []

    for (const mark of marks()) {
      const legend = markDefinition(mark).legend?.(mark, theme())
      if (!legend) continue
      const rootId = markId(mark)
      if (ids.has(rootId)) throw new Error(`Duplicate legend entry id "${rootId}".`)
      ids.add(rootId)
      const labelIndex = (() => {
        let key = markKeys.get(mark)
        if (!key) {
          key = `Mark ${++nextLabel}`
          markKeys.set(mark, key)
        }
        return key
      })()
      const markLabel = legend.label
      const label = markLabel || mark.id || labelIndex
      const markVisible = legend.visible()
      const leafEntries: LegendEntry[] = []
      const symbol = legend.symbol
      const singleLayer =
        legend.layers?.length === 1 && !legend.layers[0].stack ? legend.layers[0] : undefined

      if (singleLayer) {
        // A single unstacked layer collapses into one leaf entry.
        const visibility = () => (legend.visible() && singleLayer.visible() ? 'visible' : 'hidden')
        nodeCommands.set(rootId, {
          id: rootId,
          visibility,
          setVisible(visible) {
            if (visible && !legend.visible()) legend.setVisible(true)
            singleLayer.setVisible(visible)
          },
        })
        roots.push(
          freezeEntry({
            id: rootId,
            markId: rootId,
            label: markLabel || singleLayer.label || mark.id || labelIndex,
            symbol: singleLayer.symbol,
            visibility: visibility(),
            disabled: false,
            children: Object.freeze([]),
          }),
        )
        continue
      }

      if (legend.layers) {
        const layers = legend.layers
        // Like v4, an unlabelled multi-layer mark has no heading; its layers are top-level entries.
        const flat = !markLabel
        const stackGroups = new Map<string, MarkLegendLayer[]>()
        for (const layer of layers) {
          if (layer.stack) {
            const group = stackGroups.get(layer.stack) ?? []
            group.push(layer)
            stackGroups.set(layer.stack, group)
          }
        }
        const createLayerEntry = (layer: MarkLegendLayer, parentId: string): LegendEntry => {
          const id = `${parentId}::layer:${encodeURIComponent(layer.id)}`
          if (ids.has(id)) throw new Error(`Duplicate legend entry id "${id}".`)
          ids.add(id)
          const layerVisible = layer.visible()
          const layerEntry = freezeEntry({
            id,
            markId: rootId,
            label: layer.label || layer.id,
            symbol: layer.symbol,
            visibility: markVisible && layerVisible ? 'visible' : 'hidden',
            disabled: false,
            children: Object.freeze([]),
          })
          nodeCommands.set(id, {
            id,
            parentId: parentId === rootId && flat ? undefined : parentId,
            visibility: () => (legend.visible() && layer.visible() ? 'visible' : 'hidden'),
            setVisible: layer.setVisible,
          })
          return layerEntry
        }

        const seenStacks = new Set<string>()
        for (const layer of layers) {
          if (!layer.stack) {
            leafEntries.push(createLayerEntry(layer, rootId))
            continue
          }
          if (seenStacks.has(layer.stack)) continue
          seenStacks.add(layer.stack)
          const stack = layer.stack
          const stackLayers = stackGroups.get(stack)!
          const groupId = `${rootId}::stack:${encodeURIComponent(stack)}`
          if (ids.has(groupId)) throw new Error(`Duplicate legend entry id "${groupId}".`)
          ids.add(groupId)
          const stackChildren = stackLayers.map((layer) => createLayerEntry(layer, groupId))
          const groupVisibility = () =>
            visibilityOf(stackLayers.map((layer) => legend.visible() && layer.visible()))
          const groupEntry = freezeEntry({
            id: groupId,
            markId: rootId,
            label: stack,
            symbol: { type: 'group' },
            visibility: groupVisibility(),
            disabled: false,
            children: Object.freeze(stackChildren),
          })
          nodeCommands.set(groupId, {
            id: groupId,
            parentId: flat ? undefined : rootId,
            visibility: groupVisibility,
            setVisible(visible) {
              for (const layer of stackLayers) layer.setVisible(visible)
            },
          })
          leafEntries.push(groupEntry)
        }

        if (flat) {
          roots.push(...leafEntries)
          continue
        }
        const rootVisibility = () =>
          legend.visible() ? visibilityOf(layers.map((layer) => layer.visible())) : 'hidden'
        nodeCommands.set(rootId, {
          id: rootId,
          visibility: rootVisibility,
          setVisible: legend.setVisible,
        })
      }

      if (!legend.layers) {
        const currentVisible = () => (legend.visible() ? 'visible' : 'hidden')
        nodeCommands.set(rootId, {
          id: rootId,
          visibility: currentVisible,
          setVisible: legend.setVisible,
        })
      }
      const rootVisibility = nodeCommands.get(rootId)?.visibility() ?? 'visible'
      roots.push(
        freezeEntry({
          id: rootId,
          markId: rootId,
          label,
          symbol,
          visibility: rootVisibility,
          disabled: false,
          children: Object.freeze(leafEntries),
        }),
      )
    }
    return Object.freeze(roots)
  }

  function signature(snapshot: readonly LegendEntry[]) {
    return JSON.stringify(snapshot)
  }

  function publish(action: LegendToggleEventDetail['action'], source: LegendActionSource) {
    const next = buildSnapshot()
    const previous = reactive.untracked(() => entries.get())
    const before = new Map<string, LegendVisibility>()
    const after = new Map<string, LegendVisibility>()
    function collect(list: readonly LegendEntry[], target: Map<string, LegendVisibility>) {
      for (const entry of list) {
        target.set(entry.id, entry.visibility)
        collect(entry.children, target)
      }
    }
    collect(previous, before)
    collect(next, after)
    const changes = [...after]
      .filter(([id, visibility]) => before.has(id) && before.get(id) !== visibility)
      .map(([id, visibility]) => Object.freeze({ id, visibility }))
    const nextSignature = signature(next)
    if (nextSignature !== priorSignature) {
      priorSignature = nextSignature
      entries.set(next)
    }
    if (changes.length) {
      const detail: LegendToggleEventDetail = Object.freeze({
        action,
        source,
        changes: Object.freeze(changes),
      })
      element.dispatchEvent(new CustomEvent('legendtoggle', { bubbles: true, detail }))
    }
  }

  function refreshFromOptions() {
    publish('programmatic', 'programmatic')
  }

  reactive.untracked(refreshFromOptions)
  scope.run(() => reactive.effect(refreshFromOptions))

  function command(id: string) {
    const node = nodeCommands.get(id)
    if (!node) throw new Error(`Unknown legend entry id "${id}".`)
    return node
  }

  function setNodeVisible(
    id: string,
    visible: boolean,
    action: LegendToggleEventDetail['action'],
    source: LegendCommandSource,
  ) {
    if (typeof visible !== 'boolean') throw new TypeError('legend visibility must be boolean.')
    const node = command(id)
    if (node.visibility() === (visible ? 'visible' : 'hidden')) return
    node.setVisible(visible)
    publish(action, source)
  }

  return {
    entries,
    toggle(id, source = 'api') {
      const node = command(id)
      setNodeVisible(id, node.visibility() !== 'visible', 'toggle', source)
    },
    setVisible(id, visible, source = 'api') {
      setNodeVisible(id, visible, 'setVisible', source)
    },
    isolate(id, source = 'api') {
      const node = command(id)
      const peers = [...nodeCommands.values()].filter(
        (candidate) => candidate.parentId === node.parentId,
      )
      if (!peers.some((peer) => peer.id === id)) {
        throw new Error(`Legend entry "${id}" cannot be isolated at its hierarchy level.`)
      }
      for (const peer of peers) peer.setVisible(peer.id === id)
      publish('isolate', source)
    },
    showAll(source = 'api') {
      for (const root of nodeCommands.values()) {
        if (root.parentId === undefined) root.setVisible(true)
      }
      publish('showAll', source)
    },
    dispose() {
      if (disposed) return
      disposed = true
      scope.dispose()
      nodeCommands.clear()
    },
  }
}

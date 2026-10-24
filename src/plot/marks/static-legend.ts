import type { Signal } from '../../core/reactive.js'
import { reactive } from '../../core/runtime.js'
import type { SymbolSpec } from '../plugins/legend/legend.js'
import type { MarkLegend } from './mark-definition.js'

export interface StaticLegendOptions {
  /** Legend label; static marks only appear in the legend when labelled. */
  label?: string
  visible?: boolean
}

export const staticLegendKeys = ['label', 'visible'] as const

interface StaticLegendState {
  readonly label: string | undefined
  readonly visible: Signal<boolean>
}

// Static marks are frozen values, so legend visibility lives beside them.
const states = new WeakMap<object, StaticLegendState>()

export function registerStaticLegend(mark: object, options: StaticLegendOptions, path: string) {
  if (options.label !== undefined && (typeof options.label !== 'string' || !options.label)) {
    throw new Error(`${path}.label must be a non-empty string.`)
  }
  if (options.visible !== undefined && typeof options.visible !== 'boolean') {
    throw new Error(`${path}.visible must be boolean.`)
  }
  states.set(mark, { label: options.label, visible: reactive.signal(options.visible ?? true) })
}

/** Reactive visibility of a static mark; marks without legend state are always visible. */
export function isStaticMarkVisible(mark: object): boolean {
  return states.get(mark)?.visible.get() ?? true
}

export function staticLegend(mark: object, symbol: SymbolSpec): MarkLegend | undefined {
  const state = states.get(mark)
  if (state?.label === undefined) return undefined
  return {
    label: state.label,
    symbol,
    visible: () => state.visible.get(),
    setVisible: (visible) => state.visible.set(visible),
  }
}

/** Hides `node` when the mark is hidden and reports whether rendering should continue. */
export function applyStaticVisibility(mark: object, ...nodes: (Element | undefined)[]): boolean {
  const visible = isStaticMarkVisible(mark)
  for (const node of nodes) {
    if (!node) continue
    if (visible) node.removeAttribute('display')
    else node.setAttribute('display', 'none')
  }
  return visible
}

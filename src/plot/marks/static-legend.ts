import type { Signal } from '../../core/reactive.js'
import { reactive } from '../../core/runtime.js'
import type { SymbolSpec } from '../plugins/legend/legend.js'
import type { MarkLegend } from './mark-definition.js'

export interface StaticLegendOptions {
  /** Legend label; static marks only appear in the legend when labelled. */
  label?: string
  visible?: boolean
  /** Legend group heading; marks sharing a group are toggled together. */
  legendGroup?: string
}

export const staticLegendKeys = ['label', 'visible', 'legendGroup'] as const

export function validateLegendGroup(value: unknown, path: string) {
  if (value !== undefined && (typeof value !== 'string' || !value)) {
    throw new Error(`${path}.legendGroup must be a non-empty string.`)
  }
}

interface StaticLegendState {
  readonly label: string | undefined
  readonly group: string | undefined
  readonly visible: Pick<Signal<boolean>, 'get' | 'set'>
}

// Static marks are frozen values, so legend visibility lives beside them.
const states = new WeakMap<object, StaticLegendState>()

export function validateStaticLegendOptions(options: StaticLegendOptions, path: string) {
  if (options.label !== undefined && (typeof options.label !== 'string' || !options.label)) {
    throw new Error(`${path}.label must be a non-empty string.`)
  }
  if (options.visible !== undefined && typeof options.visible !== 'boolean') {
    throw new Error(`${path}.visible must be boolean.`)
  }
  validateLegendGroup(options.legendGroup, path)
}

export function registerStaticLegend(mark: object, options: StaticLegendOptions, path: string) {
  validateStaticLegendOptions(options, path)
  states.set(mark, {
    label: options.label,
    group: options.legendGroup,
    visible: reactive.signal(options.visible ?? true),
  })
}

/** Uses the mark's own reactive options as the single source of legend state. */
export function registerReactiveStaticLegend(
  mark: object,
  options: () => StaticLegendOptions,
  setVisible: (visible: boolean) => void,
) {
  states.set(mark, {
    get label() {
      return options().label
    },
    get group() {
      return options().legendGroup
    },
    visible: { get: () => options().visible ?? true, set: setVisible },
  })
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
    group: state.group,
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

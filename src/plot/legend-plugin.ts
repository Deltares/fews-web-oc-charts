import './legend-plugin.css'
import { createOptionState, type OptionPatch, type OptionStateSnapshot } from '../core/options.js'
import { optionSignal, reactive } from '../core/runtime.js'
import type { ReadonlySignal } from '../core/reactive.js'
import { validateKeys } from '../core/validation.js'
import { createLegendSwatch } from './legend-swatch.js'
import type { LegendEntry } from './legend.js'
import type { PluginDefinition, PlotContext } from './plugin-definition.js'

export type LegendPosition = 'top' | 'bottom'

export interface LegendOptions {
  position: LegendPosition
}

export interface LegendHandle {
  readonly options: ReadonlySignal<OptionStateSnapshot<LegendOptions>>
  update(patch: OptionPatch<LegendOptions>): void
}

const handles = new WeakSet<object>()
const optionKeys = ['position']

export function isLegendHandle(value: object): value is LegendHandle {
  return handles.has(value)
}

export function legend(initial: OptionPatch<LegendOptions> = {}): LegendHandle {
  validateKeys(initial, optionKeys, 'legend')
  const state = createOptionState<LegendOptions>(initial, {
    defaults: () => ({ position: 'top' }),
    validate(options) {
      if (options.position !== 'top' && options.position !== 'bottom') {
        throw new Error('legend.position must be top or bottom.')
      }
    },
  })
  const optionState = optionSignal(state)
  const handle: LegendHandle = Object.freeze({
    options: optionState.snapshot,
    update(patch: OptionPatch<LegendOptions>) {
      validateKeys(patch, optionKeys, 'legend')
      if (state.update(patch)) optionState.publish()
    },
  })
  handles.add(handle)
  return handle
}

function entryElement(entry: LegendEntry): HTMLLIElement {
  const document = globalThis.document
  const item = document.createElement('li')
  const row = document.createElement('div')
  row.className = 'fews-chart-legend__row'
  row.dataset.visibility = entry.visibility

  const label = document.createElement('label')
  const checkbox = document.createElement('input')
  checkbox.type = 'checkbox'
  checkbox.checked = entry.visibility === 'visible'
  checkbox.indeterminate = entry.visibility === 'mixed'
  checkbox.disabled = entry.disabled
  checkbox.dataset.entryId = entry.id
  checkbox.setAttribute('aria-label', entry.label)
  const swatch = createLegendSwatch(entry.symbol)
  swatch.classList.add('fews-chart-legend__swatch')
  label.append(checkbox, swatch, document.createTextNode(entry.label))

  const isolate = document.createElement('button')
  isolate.type = 'button'
  isolate.textContent = 'Isolate'
  isolate.setAttribute('aria-label', `Isolate ${entry.label}`)
  isolate.disabled = entry.disabled
  isolate.dataset.entryId = entry.id
  isolate.dataset.legendAction = 'isolate'
  row.append(label, isolate)
  item.append(row)
  if (entry.children.length) {
    const children = document.createElement('ul')
    children.className = 'fews-chart-legend__list'
    for (const child of entry.children) children.append(entryElement(child))
    item.append(children)
  }
  return item
}

function installLegend(handle: LegendHandle, context: PlotContext) {
  const document = context.element.ownerDocument
  const host = context.element.parentElement
  if (!host) throw new Error('The legend plugin requires the plot SVG to be attached to a host.')

  const container = document.createElement('section')
  container.className = 'fews-chart-legend'
  container.setAttribute('aria-label', 'Chart legend')
  container.dataset.position = handle.options.get().resolved.position
  const showAll = document.createElement('button')
  showAll.type = 'button'
  showAll.className = 'fews-chart-legend__show-all'
  showAll.textContent = 'Show all'
  const list = document.createElement('ul')
  list.className = 'fews-chart-legend__list'
  container.append(showAll, list)

  const render = () => {
    const active = container.contains(document.activeElement)
      ? (document.activeElement as HTMLElement)
      : undefined
    const focusedId = active?.dataset.entryId
    const focusedAction = active?.dataset.legendAction
    const entries = context.legend.entries.get()
    list.replaceChildren(...entries.map(entryElement))
    if (focusedId) {
      const replacement = [...list.querySelectorAll<HTMLElement>('[data-entry-id]')].find(
        (element) =>
          element.dataset.entryId === focusedId && element.dataset.legendAction === focusedAction,
      )
      replacement?.focus()
    }
  }
  context.scope.run(() => reactive.effect(render))

  container.addEventListener('change', (event) => {
    const target = event.target
    if (!(target instanceof HTMLInputElement) || !target.dataset.entryId) return
    context.legend.setVisible(target.dataset.entryId, target.checked, 'built-in')
  })
  container.addEventListener('click', (event) => {
    const target = event.target
    if (!(target instanceof HTMLButtonElement)) return
    if (target.classList.contains('fews-chart-legend__show-all')) {
      context.legend.showAll('built-in')
      return
    }
    const id = target.dataset.entryId
    if (id && target.dataset.legendAction === 'isolate') context.legend.isolate(id, 'built-in')
  })

  context.scope.run(() =>
    reactive.effect(() => {
      const position = handle.options.get().resolved.position
      container.dataset.position = position
      if (position === 'top') host.insertBefore(container, context.element)
      else context.element.after(container)
    }),
  )

  return { destroy: () => container.remove() }
}

export const legendDefinition: PluginDefinition<LegendHandle> = {
  name: 'legend',
  is: isLegendHandle,
  validate(_handle, context) {
    if (context.plugins.filter((plugin) => isLegendHandle(plugin)).length > 1) {
      throw new Error('A plot can install at most one legend plugin.')
    }
  },
  install: installLegend,
}

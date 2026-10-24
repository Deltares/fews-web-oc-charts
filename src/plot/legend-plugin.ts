import { createOptionState, type OptionPatch, type OptionStateSnapshot } from '../core/options.js'
import { optionSignal, reactive } from '../core/runtime.js'
import type { ReadonlySignal } from '../core/reactive.js'
import { validateKeys } from '../core/validation.js'
import { legendSymbolPrimitives } from './legend-swatch.js'
import type { LegendEntry } from './legend.js'
import type { PluginDefinition, PlotContext } from './plugin-definition.js'
import { svgElement } from './svg.js'
import { createTextMeasurer } from '../layout/layout.js'

export type LegendPosition =
  'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

export interface LegendOptions {
  position: LegendPosition
  /** Include parent and named-stack entries; false renders only leaf series/layers. */
  showGroups: boolean
}

export interface LegendHandle {
  readonly options: ReadonlySignal<OptionStateSnapshot<LegendOptions>>
  update(patch: OptionPatch<LegendOptions>): void
}

const handles = new WeakSet<object>()
const optionKeys = ['position', 'showGroups']

export function isLegendHandle(value: object): value is LegendHandle {
  return handles.has(value)
}

export function legend(initial: OptionPatch<LegendOptions> = {}): LegendHandle {
  validateKeys(initial, optionKeys, 'legend')
  const state = createOptionState<LegendOptions>(initial, {
    defaults: () => ({ position: 'top', showGroups: true }),
    validate(options) {
      if (typeof options.showGroups !== 'boolean') {
        throw new TypeError('legend.showGroups must be boolean.')
      }
      if (
        ![
          'top',
          'bottom',
          'left',
          'right',
          'top-left',
          'top-right',
          'bottom-left',
          'bottom-right',
        ].includes(options.position)
      ) {
        throw new Error(
          'legend.position must be top, bottom, left, right, top-left, top-right, bottom-left or bottom-right.',
        )
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

const itemHeight = 26
const horizontalPadding = 8
const verticalPadding = 6
const swatchWidth = 36
const sectionGap = 7

interface FlatEntry {
  readonly entry: LegendEntry
  readonly depth: number
  readonly indent: number
  readonly heading: boolean
  readonly width: number
}

interface Placement {
  readonly item: FlatEntry
  readonly column: number
  /** Vertical offset from the top of the content area. */
  readonly y: number
  /** Draw a section divider above this entry. */
  readonly divider: boolean
}

/** Root groups start their own section; consecutive ungrouped root entries share one. */
function sectionStarts(items: readonly FlatEntry[]): boolean[] {
  let grouped = false
  return items.map((item, index) => {
    if (item.depth !== 0 || !(item.heading || grouped || index === 0)) return false
    grouped = item.heading
    return true
  })
}

function flattenEntries(
  entries: readonly LegendEntry[],
  measure: (label: string, bold: boolean) => number,
  showGroups: boolean,
  indented: boolean,
): FlatEntry[] {
  const result: FlatEntry[] = []
  function visit(items: readonly LegendEntry[], depth: number) {
    for (const entry of items) {
      if (showGroups || !entry.children.length) {
        const heading = showGroups && entry.children.length > 0
        const indent = showGroups && indented ? depth * 12 : 0
        result.push({
          entry,
          depth: showGroups ? depth : 0,
          indent,
          heading,
          width: indent + swatchWidth + 8 + measure(entry.label, heading) + 16,
        })
      }
      visit(entry.children, depth + 1)
    }
  }
  visit(entries, 0)
  return result
}

/**
 * Column-major flow used for vertical and overlay legends. Root groups are separated by a
 * gap with a divider, except at the top of a column. When the entries need more than one
 * column, the column height is reduced as far as possible to balance the columns.
 */
function columnPlacements(items: readonly FlatEntry[], capacity: number): Placement[] {
  const starts = sectionStarts(items)
  function flow(limit: number) {
    const placements: Placement[] = []
    let column = 0
    let cursor = 0
    items.forEach((item, index) => {
      let gap = starts[index] && cursor > 0 ? sectionGap : 0
      if (cursor > 0 && cursor + gap + itemHeight > limit) {
        column += 1
        cursor = 0
        gap = 0
      }
      placements.push({ item, column, y: cursor + gap, divider: gap > 0 })
      cursor += gap + itemHeight
    })
    return { placements, columns: column + 1 }
  }
  const full = flow(capacity)
  if (full.columns <= 1) return full.placements
  let low = itemHeight
  let high = Math.floor(capacity)
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (flow(middle).columns <= full.columns) high = middle
    else low = middle + 1
  }
  return flow(high).placements
}

/**
 * Row-major sections used for top/bottom legends: each top-level group starts a new
 * section with its heading in the first column. Nested groups start a new line at their
 * depth column and their entries wrap back to the column after their heading.
 * Consecutive ungrouped top-level entries share a section.
 */
function sectionPlacements(items: readonly FlatEntry[], columns: number): Placement[] {
  const starts = sectionStarts(items)
  const placements: Placement[] = []
  let row = -1
  let section = -1
  let nextColumn = columns
  let wrapColumn = 0
  let leafDepth = 0
  const place = (item: FlatEntry, column: number, divider: boolean) =>
    placements.push({
      item,
      column,
      y: row * itemHeight + Math.max(0, section) * sectionGap,
      divider,
    })
  items.forEach((item, index) => {
    const start = starts[index]
    if (start) {
      row += 1
      section += 1
      nextColumn = 0
      wrapColumn = 0
      leafDepth = 0
    }
    const divider = start && section > 0
    if (item.heading) {
      const column = Math.min(item.depth, columns - 1)
      if (nextColumn > column) row += 1
      place(item, column, divider)
      nextColumn = column + 1
      wrapColumn = Math.min(column + 1, columns - 1)
      leafDepth = item.depth + 1
      return
    }
    if (item.depth < leafDepth) {
      row += 1
      nextColumn = wrapColumn = Math.min(item.depth, columns - 1)
      leafDepth = item.depth
    } else if (nextColumn >= columns) {
      row += 1
      nextColumn = wrapColumn
    }
    place(item, nextColumn, divider)
    nextColumn += 1
  })
  return placements
}

function appendSymbol(group: SVGGElement, entry: LegendEntry) {
  for (const primitive of legendSymbolPrimitives(entry.symbol, {
    width: swatchWidth,
    height: 18,
  })) {
    const node = svgElement(primitive.type)
    for (const [name, value] of Object.entries(primitive.attributes)) {
      if (value !== undefined) node.setAttribute(name, String(value))
    }
    group.append(node)
  }
}

function appendEntry(
  layer: SVGGElement,
  item: FlatEntry,
  x: number,
  y: number,
  width: number,
  fontSize: number,
  toggle: (id: string) => void,
) {
  const { entry } = item
  const group = svgElement('g', {
    class: 'fews-chart-legend__entry',
    'data-legend-entry': entry.id,
    'data-visibility': entry.visibility,
    'data-entry-id': entry.id,
    role: 'button',
    'aria-label': entry.label,
    'aria-pressed': entry.visibility === 'mixed' ? 'mixed' : String(entry.visibility === 'visible'),
    'aria-disabled': String(entry.disabled),
    tabindex: entry.disabled ? -1 : 0,
    transform: `translate(${x} ${y})`,
    opacity: entry.visibility === 'hidden' ? 0.5 : entry.visibility === 'mixed' ? 0.75 : 1,
    cursor: entry.disabled ? 'default' : 'pointer',
  })
  group.append(
    svgElement('rect', {
      width,
      height: itemHeight,
      fill: 'transparent',
    }),
  )

  const symbol = svgElement('g', {
    class: 'fews-chart-legend__swatch',
    transform: `translate(${item.indent} 4)`,
    'aria-hidden': 'true',
  })
  appendSymbol(symbol, entry)
  group.append(symbol)

  const label = svgElement('text', {
    x: swatchWidth + 8 + item.indent,
    y: itemHeight / 2,
    'dominant-baseline': 'middle',
    'font-size': fontSize,
    ...(item.heading ? { 'font-weight': 600 } : {}),
    fill: 'currentColor',
    'pointer-events': 'none',
  })
  label.textContent = entry.label
  group.append(label)

  group.addEventListener('click', (event) => {
    event.stopPropagation()
    if (!entry.disabled) toggle(entry.id)
  })
  group.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (!entry.disabled) toggle(entry.id)
    }
  })
  layer.append(group)
}

function installLegend(handle: LegendHandle, context: PlotContext) {
  const focusStyle = svgElement('style')
  focusStyle.textContent = `
    .fews-chart-legend__entry:focus { outline: none; }
    .fews-chart-legend__entry:focus-visible {
      outline: 1px solid color-mix(in srgb, currentColor 45%, transparent);
      outline-offset: -1px;
    }
    @media (forced-colors: active) {
      .fews-chart-legend__entry:focus-visible { outline-color: Highlight; }
    }
  `
  const originalRole = context.element.getAttribute('role')
  const document = context.element.ownerDocument
  const wrapper = document.createElement('div')
  wrapper.dataset.legendLayout = ''
  wrapper.style.display = 'grid'
  wrapper.style.gap = '8px'
  const viewport = document.createElement('div')
  viewport.style.minWidth = '0'
  viewport.style.minHeight = '0'
  const external = svgElement('svg', {
    class: 'fews-chart-legend-svg',
    role: 'group',
    'aria-label': 'Chart legend',
  })
  external.style.display = 'block'
  external.style.justifySelf = 'center'
  external.style.alignSelf = 'center'
  const measurer = createTextMeasurer()
  let releaseViewport: (() => void) | undefined
  const layer = svgElement('g', {
    'data-layer': 'legend',
    class: 'fews-chart-legend',
    role: 'group',
    'aria-label': 'Chart legend',
  })

  function restoreChart() {
    if (!releaseViewport) return
    wrapper.before(context.element)
    wrapper.remove()
    releaseViewport()
    releaseViewport = undefined
  }

  function updateLayout() {
    const position = handle.options.get().resolved.position
    const overlay = position.includes('-')
    if (overlay) {
      restoreChart()
      context.element.append(layer)
      context.element.setAttribute('role', 'group')
      return
    }
    if (originalRole) context.element.setAttribute('role', originalRole)
    else context.element.removeAttribute('role')
    const options = context.options.get().resolved
    wrapper.style.width = options.width === undefined ? '100%' : `${options.width}px`
    wrapper.style.height = options.height === undefined ? '100%' : `${options.height}px`
    const horizontal = position === 'left' || position === 'right'
    const first = position === 'top' || position === 'left'
    wrapper.style.gridTemplateColumns = horizontal
      ? first
        ? 'auto minmax(0, 1fr)'
        : 'minmax(0, 1fr) auto'
      : 'minmax(0, 1fr)'
    wrapper.style.gridTemplateRows = horizontal
      ? 'minmax(0, 1fr)'
      : first
        ? 'auto minmax(0, 1fr)'
        : 'minmax(0, 1fr) auto'
    external.append(layer)
    if (!releaseViewport) {
      context.element.before(wrapper)
      viewport.append(context.element)
    }
    if (first) wrapper.replaceChildren(external, viewport)
    else wrapper.replaceChildren(viewport, external)
    if (!releaseViewport) releaseViewport = context.useViewport(viewport)
  }
  reactive.untracked(updateLayout)
  context.scope.run(() => reactive.effect(updateLayout))
  for (const type of ['pointermove', 'pointerdown', 'pointerup', 'click'] as const) {
    layer.addEventListener(type, (event) => event.stopPropagation())
  }

  const render = () => {
    const active = context.element.ownerDocument.activeElement
    const focusedId =
      active instanceof SVGElement && layer.contains(active) ? active.dataset.entryId : undefined
    const { position, showGroups } = handle.options.get().resolved
    const { width, height } = context.size.get()
    const { plot } = context.regions.get()
    const tokens = context.theme.get()
    const fontSize = tokens.fontSize
    external.style.color = `var(--fews-chart-foreground, ${tokens.foreground})`
    external.style.fontFamily = `var(--fews-chart-font-family, ${tokens.fontFamily})`
    const horizontal = position === 'top' || position === 'bottom'
    const overlay = position.includes('-')
    const items = flattenEntries(
      context.legend.entries.get(),
      (label, bold) =>
        measurer.measure(label, `${bold ? '600 ' : ''}${fontSize}px ${tokens.fontFamily}`),
      showGroups,
      !horizontal,
    )
    const itemWidth = Math.max(0, ...items.map((item) => item.width))
    const horizontalColumns = Math.max(
      1,
      Math.min(items.length, Math.floor(plot.width / Math.max(1, itemWidth))),
    )
    const placements = horizontal
      ? sectionPlacements(items, horizontalColumns)
      : columnPlacements(items, overlay ? Infinity : Math.max(itemHeight, plot.height))
    const columns = horizontal
      ? horizontalColumns
      : Math.max(1, ...placements.map((placement) => placement.column + 1))
    const cellWidth = horizontal ? Math.max(itemWidth, plot.width / columns) : itemWidth
    const contentWidth = columns * itemWidth
    const contentHeight = Math.max(0, ...placements.map((placement) => placement.y + itemHeight))
    const boxWidth = !overlay && horizontal ? width : contentWidth + horizontalPadding * 2
    const boxHeight = !overlay && !horizontal ? height : contentHeight + verticalPadding * 2
    const corners = position.split('-')
    const rightAligned = position === 'right' || corners[1] === 'right'
    const bottomAligned = position === 'bottom' || corners[0] === 'bottom'
    let x = 0
    let y = 0
    if (overlay) {
      x = rightAligned ? plot.x + plot.width - boxWidth - 8 : plot.x + 8
      y = bottomAligned ? plot.y + plot.height - boxHeight - 8 : plot.y + 8
    } else {
      external.setAttribute('width', String(boxWidth))
      external.setAttribute('height', String(boxHeight))
      external.setAttribute('viewBox', `0 0 ${boxWidth} ${boxHeight}`)
      external.style.width = horizontal ? '100%' : `${boxWidth}px`
      external.style.height = horizontal ? `${boxHeight}px` : '100%'
    }

    layer.replaceChildren(focusStyle)
    layer.dataset.position = position
    layer.dataset.overlay = String(overlay)
    const background = svgElement('rect', {
      class: 'fews-chart-legend__background',
      x,
      y,
      width: boxWidth,
      height: boxHeight,
      rx: 3,
      fill: `var(--fews-chart-legend-background, ${tokens.background})`,
      stroke: 'currentColor',
      'stroke-opacity': 0.2,
    })
    layer.append(background)
    const left = x + (horizontal ? plot.x : horizontalPadding)
    const top = y + (!overlay && !horizontal ? plot.y : verticalPadding)
    for (const { item, column, y: offset, divider } of placements) {
      const positionedY = top + offset
      const positionedX = left + column * cellWidth
      if (divider) {
        const dividerY = positionedY - sectionGap / 2
        layer.append(
          svgElement('line', {
            class: 'fews-chart-legend__divider',
            x1: horizontal ? left : positionedX,
            x2: horizontal ? left + columns * cellWidth : positionedX + cellWidth,
            y1: dividerY,
            y2: dividerY,
            stroke: 'currentColor',
            'stroke-opacity': 0.15,
            'aria-hidden': 'true',
          }),
        )
      }
      appendEntry(layer, item, positionedX, positionedY, cellWidth, fontSize, (id) =>
        context.legend.toggle(id, 'built-in'),
      )
    }
    if (focusedId) {
      const replacement = [...layer.querySelectorAll<SVGElement>('[data-entry-id]')].find(
        (element) => element.dataset.entryId === focusedId,
      )
      replacement?.focus()
    }
  }
  reactive.untracked(render)
  context.scope.run(() => reactive.effect(render))

  return {
    destroy() {
      layer.remove()
      restoreChart()
      external.remove()
      measurer.clear()
      if (originalRole) context.element.setAttribute('role', originalRole)
      else context.element.removeAttribute('role')
    },
  }
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

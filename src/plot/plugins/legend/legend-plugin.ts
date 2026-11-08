import { registerPlugin } from '../plugins.js'
import {
  createOptionState,
  type OptionPatch,
  type OptionStateSnapshot,
} from '../../../core/options.js'
import { optionSignal, reactive } from '../../../core/runtime.js'
import type { ReadonlySignal } from '../../../core/reactive.js'
import { validateKeys } from '../../../core/validation.js'
import { legendSymbolNode, legendSymbolPrimitives } from './legend-swatch.js'
import type { LegendEntry } from './legend.js'
import type { PluginDefinition, PlotContext } from '../plugin-definition.js'
import { svgElement } from '../../rendering/svg.js'
import { createTextMeasurer } from '../../../layout/layout.js'

export type LegendPosition =
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'

export interface LegendOptions {
  position: LegendPosition
  /** Include parent and named-stack entries; false renders only leaf series/layers. */
  showGroups: boolean
  /**
   * Fixed box width in CSS pixels for column legends (`left`, `right` and the corner
   * overlays); `top` and `bottom` legends span the chart and ignore it. Labels that do not
   * fit are truncated with an ellipsis and keep their full text in a `<title>`. Undefined
   * sizes the box to its content.
   */
  width?: number
}

export interface LegendHandle {
  readonly options: ReadonlySignal<OptionStateSnapshot<LegendOptions>>
  update(patch: OptionPatch<LegendOptions>): void
}

const handles = new WeakSet<object>()
const optionKeys = ['position', 'showGroups', 'width']

const visibilityOpacity: Readonly<Record<string, number>> = { hidden: 0.5, mixed: 0.75 }

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
        options.width !== undefined &&
        (typeof options.width !== 'number' || !Number.isFinite(options.width) || options.width <= 0)
      ) {
        throw new RangeError('legend.width must be a positive finite number.')
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
  return registerPlugin(handle, legendDefinition)
}

const itemHeight = 26
const horizontalPadding = 8
const verticalPadding = 6
const swatchWidth = 20
const swatchHeight = 20
const sectionGap = 7
const labelOffset = swatchWidth + 8
/** Space after a label: separates columns in content-sized legends. */
const labelTrailing = 16
/** Minimum space after a truncated label in a fixed-width legend. */
const truncatedTrailing = 6
const ellipsis = '\u2026'

type Measure = (label: string, bold: boolean) => number

/** Longest prefix of `label` that fits `room` with an ellipsis, or the label itself. */
function fitLabel(label: string, room: number, bold: boolean, measure: Measure): string {
  if (measure(label, bold) <= room) return label
  const characters = Array.from(label)
  let low = 0
  let high = characters.length - 1
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    const candidate = `${characters.slice(0, middle).join('').trimEnd()}${ellipsis}`
    if (measure(candidate, bold) <= room) low = middle
    else high = middle - 1
  }
  return low ? `${characters.slice(0, low).join('').trimEnd()}${ellipsis}` : ellipsis
}

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
  measure: Measure,
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
          width: indent + labelOffset + measure(entry.label, heading) + labelTrailing,
        })
      }
      visit(entry.children, depth + 1)
    }
  }
  visit(entries, 0)
  return result
}

/**
 * Column-major flow used for left/right and overlay legends. Root groups are separated by a
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

interface Box {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

interface LegendLayout {
  readonly placements: readonly Placement[]
  readonly columns: number
  readonly cellWidth: number
  readonly box: Box
}

/** Row-major sections for top/bottom legends; column-major flow otherwise. */
function flowEntries(
  items: readonly FlatEntry[],
  horizontal: boolean,
  columnHeight: number,
  plotWidth: number,
) {
  const itemWidth = Math.max(0, ...items.map((item) => item.width))
  if (horizontal) {
    const fitting = Math.floor(plotWidth / Math.max(1, itemWidth))
    const columns = Math.max(1, Math.min(items.length, fitting))
    return { placements: sectionPlacements(items, columns), columns, itemWidth }
  }
  const placements = columnPlacements(items, columnHeight)
  const columns = Math.max(1, ...placements.map((placement) => placement.column + 1))
  return { placements, columns, itemWidth }
}

/** Top-left corner of the legend box in the coordinates it is drawn in. */
function boxOrigin(
  position: LegendPosition,
  size: { readonly width: number; readonly height: number },
  plot: Box,
  chartHeight: number,
) {
  if (position === 'top' || position === 'bottom') return { x: 0, y: 0 }
  if (!position.includes('-')) {
    // A side box fits its entries and starts level with the plot area, moving up only
    // as far as needed to stay within the chart.
    return { x: 0, y: Math.max(0, Math.min(plot.y, chartHeight - size.height)) }
  }
  const [vertical, side] = position.split('-')
  return {
    x: side === 'right' ? plot.x + plot.width - size.width - 8 : plot.x + 8,
    y: vertical === 'bottom' ? plot.y + plot.height - size.height - 8 : plot.y + 8,
  }
}

function legendLayout(
  position: LegendPosition,
  fixedWidth: number | undefined,
  items: readonly FlatEntry[],
  chart: { readonly width: number; readonly height: number },
  plot: Box,
): LegendLayout {
  const horizontal = position === 'top' || position === 'bottom'
  // Left/right docks use the overlay layout, wrapping into columns only when one column
  // does not fit the full chart height, margins included.
  const columnHeight = position.includes('-')
    ? Infinity
    : Math.max(itemHeight, chart.height - verticalPadding * 2)
  const { placements, columns, itemWidth } = flowEntries(
    items,
    horizontal,
    columnHeight,
    plot.width,
  )
  const contentHeight = Math.max(0, ...placements.map((placement) => placement.y + itemHeight))
  const height = contentHeight + verticalPadding * 2
  let width = columns * itemWidth + horizontalPadding * 2
  let cellWidth = itemWidth
  if (horizontal) {
    width = chart.width
    cellWidth = Math.max(itemWidth, plot.width / columns)
  } else if (fixedWidth !== undefined) {
    width = fixedWidth
    cellWidth = Math.max(0, fixedWidth - horizontalPadding * 2) / columns
  }
  const origin = boxOrigin(position, { width, height }, plot, chart.height)
  return { placements, columns, cellWidth, box: { ...origin, width, height } }
}

function appendDivider(layer: SVGGElement, x: number, width: number, y: number) {
  layer.append(
    svgElement('line', {
      class: 'fews-chart-legend__divider',
      x1: x,
      x2: x + width,
      y1: y,
      y2: y,
      stroke: 'currentColor',
      'stroke-opacity': 0.15,
      'aria-hidden': 'true',
    }),
  )
}

function appendSymbol(group: SVGGElement, entry: LegendEntry) {
  for (const primitive of legendSymbolPrimitives(entry.symbol, {
    width: swatchWidth,
    height: swatchHeight,
  })) {
    group.append(legendSymbolNode(primitive))
  }
}

function appendEntry(
  layer: SVGGElement,
  item: FlatEntry,
  x: number,
  y: number,
  width: number,
  fontSize: number,
  text: string,
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
    opacity: visibilityOpacity[entry.visibility] ?? 1,
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
    transform: `translate(${item.indent} ${(itemHeight - swatchHeight) / 2})`,
    'aria-hidden': 'true',
  })
  appendSymbol(symbol, entry)
  group.append(symbol)

  const label = svgElement('text', {
    x: labelOffset + item.indent,
    y: itemHeight / 2,
    'dominant-baseline': 'middle',
    'font-size': fontSize,
    ...(item.heading ? { 'font-weight': 600 } : {}),
    fill: 'currentColor',
    'pointer-events': 'none',
  })
  label.textContent = text
  group.append(label)
  if (text !== entry.label) {
    const title = svgElement('title')
    title.textContent = entry.label
    group.append(title)
  }

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
    if (context.suspended.get()) return
    // Moving a node, even to its current position, blurs any focused descendant.
    const active = document.activeElement
    const focused = active instanceof SVGElement && layer.contains(active) ? active : undefined
    applyLayout()
    if (focused && document.activeElement !== focused) focused.focus()
  }

  function applyLayout() {
    const position = handle.options.get().resolved.position
    const overlay = position.includes('-')
    if (overlay) {
      restoreChart()
      if (context.element.lastElementChild !== layer) context.element.append(layer)
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
    const docked = first ? 'auto minmax(0, 1fr)' : 'minmax(0, 1fr) auto'
    wrapper.style.gridTemplateColumns = horizontal ? docked : 'minmax(0, 1fr)'
    wrapper.style.gridTemplateRows = horizontal ? 'minmax(0, 1fr)' : docked
    if (layer.parentNode !== external) external.append(layer)
    if (!releaseViewport) {
      context.element.before(wrapper)
      viewport.append(context.element)
    }
    const [leading, trailing] = first ? [external, viewport] : [viewport, external]
    if (
      wrapper.childElementCount !== 2 ||
      wrapper.firstElementChild !== leading ||
      wrapper.lastElementChild !== trailing
    ) {
      wrapper.replaceChildren(leading, trailing)
    }
    releaseViewport ??= context.useViewport(viewport)
  }
  reactive.untracked(updateLayout)
  context.scope.run(() => reactive.effect(updateLayout))
  for (const type of ['pointermove', 'pointerdown', 'pointerup', 'click'] as const) {
    layer.addEventListener(type, (event) => event.stopPropagation())
  }

  function focusedEntryId() {
    const active = context.element.ownerDocument.activeElement
    return active instanceof SVGElement && layer.contains(active)
      ? active.dataset.entryId
      : undefined
  }

  function restoreFocus(id: string | undefined) {
    if (!id) return
    const replacement = [...layer.querySelectorAll<SVGElement>('[data-entry-id]')].find(
      (element) => element.dataset.entryId === id,
    )
    replacement?.focus()
  }

  /** Sizes the external SVG of a docked legend; overlays draw inside the chart. */
  function sizeExternal(horizontal: boolean, box: Box, chartHeight: number) {
    const svgHeight = horizontal ? box.height : chartHeight
    external.setAttribute('width', String(box.width))
    external.setAttribute('height', String(svgHeight))
    external.setAttribute('viewBox', `0 0 ${box.width} ${svgHeight}`)
    external.style.width = horizontal ? '100%' : `${box.width}px`
    external.style.height = horizontal ? `${box.height}px` : '100%'
  }

  const render = () => {
    if (context.suspended.get()) return
    const focusedId = focusedEntryId()
    const { position, showGroups, width: fixedWidth } = handle.options.get().resolved
    const size = context.size.get()
    const { plot } = context.regions.get()
    const tokens = context.theme.get()
    const fontSize = tokens.fontSize
    external.style.color = `var(--fews-chart-foreground, ${tokens.foreground})`
    external.style.fontFamily = `var(--fews-chart-font-family, ${tokens.fontFamily})`
    const horizontal = position === 'top' || position === 'bottom'
    const overlay = position.includes('-')
    const measure: Measure = (label, bold) =>
      measurer.measure(label, `${bold ? '600 ' : ''}${fontSize}px ${tokens.fontFamily}`)
    const items = flattenEntries(context.legend.entries.get(), measure, showGroups, !horizontal)
    const { placements, columns, cellWidth, box } = legendLayout(
      position,
      fixedWidth,
      items,
      size,
      plot,
    )
    if (!overlay) sizeExternal(horizontal, box, size.height)

    layer.replaceChildren(focusStyle)
    layer.dataset.position = position
    layer.dataset.overlay = String(overlay)
    layer.append(
      svgElement('rect', {
        class: 'fews-chart-legend__background',
        ...box,
        rx: 3,
        fill: `var(--fews-chart-legend-background, ${tokens.background})`,
        stroke: 'currentColor',
        'stroke-opacity': 0.2,
      }),
    )
    const truncate = !horizontal && fixedWidth !== undefined
    const left = box.x + (horizontal ? plot.x : horizontalPadding)
    const top = box.y + verticalPadding
    // Top/bottom dividers span every column; column dividers span their own column.
    const dividerStart = (x: number) => (horizontal ? left : x)
    const dividerWidth = horizontal ? columns * cellWidth : cellWidth
    for (const { item, column, y: offset, divider } of placements) {
      const x = left + column * cellWidth
      const y = top + offset
      if (divider) appendDivider(layer, dividerStart(x), dividerWidth, y - sectionGap / 2)
      const room = cellWidth - item.indent - labelOffset - truncatedTrailing
      const text = truncate
        ? fitLabel(item.entry.label, room, item.heading, measure)
        : item.entry.label
      appendEntry(layer, item, x, y, cellWidth, fontSize, text, (id) =>
        context.legend.toggle(id, 'built-in'),
      )
    }
    restoreFocus(focusedId)
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

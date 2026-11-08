import { registerPlugin } from '../plugins.js'
import type { OptionPatch } from '../../../core/options.js'
import { reactive } from '../../../core/runtime.js'
import type { PluginDefinition, PlotContext } from '../plugin-definition.js'
import {
  isTooltipHandle,
  validateTooltipUpdates,
  type TooltipHandle,
  type TooltipMark,
  type TooltipPlacementPosition,
  type TooltipOptions,
  tooltip as createTooltipHandle,
} from './tooltip.js'
import { TooltipPosition } from '../../../Tooltip/tooltip.js'
import { calculateTooltipPlacement } from '../../../Utils/tooltipPlacement.js'
import { positionTooltipArrow } from '../../../Utils/tooltipArrow.js'
import { computeTooltipModel, type TooltipEntry, type TooltipModel } from './tooltip-model.js'
import { createLegendSwatch } from '../legend/legend-swatch.js'
import { applyFont } from '../../../theme/theme.js'

let nextTooltipId = 0

const tooltipTransforms: Partial<Record<TooltipPosition, string>> = {
  [TooltipPosition.Top]: 'translate(-50%, calc(-100% - 6px))',
  [TooltipPosition.Bottom]: 'translate(-50%, 6px)',
  [TooltipPosition.Left]: 'translate(calc(-100% - 6px), -50%)',
}

function positionTooltip(
  element: HTMLDivElement,
  context: PlotContext,
  x: number,
  y: number,
  preferred: TooltipPlacementPosition,
) {
  const rect = context.element.getBoundingClientRect()
  const size = context.size.get()
  if (rect.width <= 0 || rect.height <= 0 || size.width <= 0 || size.height <= 0) return
  const clientX = rect.left + (x / size.width) * rect.width
  const clientY = rect.top + (y / size.height) * rect.height
  const tooltipRect = element.getBoundingClientRect()
  const style = getComputedStyle(element)
  // Body zoom scales fixed-position CSS coordinates, but client rectangles are already scaled.
  const scaleX = tooltipRect.width / Number.parseFloat(style.width)
  const scaleY = tooltipRect.height / Number.parseFloat(style.height)
  const preferredPosition: Record<TooltipPlacementPosition, TooltipPosition> = {
    bottom: TooltipPosition.Bottom,
    left: TooltipPosition.Left,
    right: TooltipPosition.Right,
    top: TooltipPosition.Top,
  }
  const position = calculateTooltipPlacement({
    x: clientX / scaleX,
    y: clientY / scaleY,
    preferredPosition: preferredPosition[preferred],
    containerWidth: window.innerWidth / scaleX,
    containerHeight: window.innerHeight / scaleY,
    tooltipWidth: tooltipRect.width / scaleX,
    tooltipHeight: tooltipRect.height / scaleY,
  })
  element.style.left = `${position.x}px`
  element.style.top = `${position.y}px`
  element.style.transform = tooltipTransforms[position.position] ?? 'translate(6px, -50%)'
  positionTooltipArrow(element, position, clientX / scaleX, clientY / scaleY)
}

function renderHeader(content: HTMLDivElement, header: string) {
  const line = document.createElement('div')
  line.dataset.tooltipHeader = ''
  line.style.fontWeight = '600'
  line.style.gridColumn = '1 / -1'
  line.style.paddingBottom = '2px'
  line.textContent = header
  content.append(line)
}

function renderEntry(content: HTMLDivElement, entry: TooltipEntry, columns: boolean) {
  const row = document.createElement('div')
  row.dataset.tooltipEntry = ''
  // In columns the row's cells join the content grid, so names and values align.
  row.style.display = columns ? 'contents' : 'flex'
  row.style.alignItems = 'center'
  row.style.gap = '5px'
  const symbol = createLegendSwatch(entry.symbol, { width: 20, height: 20 })
  symbol.dataset.tooltipSymbol = ''
  symbol.setAttribute('aria-hidden', 'true')
  symbol.style.flex = 'none'
  const name = document.createElement('span')
  name.dataset.tooltipLabel = ''
  name.style.color = entry.color
  name.textContent = entry.label
  const values = document.createElement('span')
  values.dataset.tooltipValues = ''
  if (columns) {
    values.style.textAlign = 'end'
    values.style.paddingInlineStart = '12px'
    values.textContent = entry.values
  } else {
    values.textContent = entry.details
  }
  row.append(symbol, name, values)
  content.append(row)
}

function renderTooltip(element: HTMLDivElement, context: PlotContext, model: TooltipModel) {
  const theme = context.theme.get()
  applyFont(element, theme.fonts.tooltip)
  element.style.backgroundColor = theme.tooltipBackground
  element.style.color = theme.tooltipColor
  const columns = model.layout === 'columns'
  const content = document.createElement('div')
  content.dataset.tooltipContent = ''
  content.dataset.layout = model.layout
  if (columns) {
    content.style.display = 'grid'
    content.style.gridTemplateColumns = '20px auto auto'
    content.style.columnGap = '5px'
    content.style.alignItems = 'center'
  }
  if (model.header) renderHeader(content, model.header)
  for (const entry of model.entries) renderEntry(content, entry, columns)
  element.replaceChildren(content)
  element.setAttribute('aria-label', model.accessibleLabel)
  if (!model.entries.length) {
    element.style.visibility = 'hidden'
    element.setAttribute('aria-hidden', 'true')
    return
  }
  element.style.visibility = 'hidden'
  positionTooltip(element, context, model.point.x, model.point.y, model.position)
  element.style.visibility = 'visible'
  element.setAttribute('aria-hidden', 'false')
}

function installTooltip(handle: TooltipHandle, context: PlotContext) {
  validateTargets(
    handle.options.get().resolved.marks,
    context.options.get().resolved.marks,
    context,
  )
  const element = document.createElement('div')
  element.id = `fews-chart-tooltip-${nextTooltipId++}`
  element.className = 'fews-chart-tooltip'
  element.dataset.layer = 'tooltip'
  element.setAttribute('role', 'tooltip')
  element.setAttribute('aria-hidden', 'true')
  Object.assign(element.style, {
    position: 'fixed',
    zIndex: '1000',
    display: 'block',
    boxSizing: 'border-box',
    visibility: 'hidden',
    pointerEvents: 'none',
    padding: '6px 8px',
    borderRadius: '3px',
    boxShadow: '0 1px 5px rgb(0 0 0 / 25%)',
    lineHeight: '1.4',
    whiteSpace: 'nowrap',
  })
  const describedBy = new Set(
    (context.element.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean),
  )
  describedBy.add(element.id)
  context.element.setAttribute('aria-describedby', [...describedBy].join(' '))
  document.body.append(element)
  let pathContext: CanvasRenderingContext2D | undefined

  const stopValidation = validateTooltipUpdates(handle, (options) => {
    validateTargets(options.marks, context.options.get().resolved.marks, context)
    validateCrosshair(options, context.options.get().resolved.plugins)
  })

  try {
    context.scope.run(() =>
      reactive.effect(() => {
        if (context.suspended.get()) return
        const model = computeTooltipModel(
          handle.options.get().resolved,
          context,
          {
            marks: context.options.get().resolved.marks,
            pointer: context.pointer.get(),
            region: context.regions.get().plot,
          },
          () => (pathContext ??= document.createElement('canvas').getContext('2d') ?? undefined),
        )
        renderTooltip(element, context, model)
      }),
    )
  } catch (error) {
    stopValidation()
    element.remove()
    removeTooltipDescription(context.element, element.id)
    throw error
  }

  return {
    destroy() {
      stopValidation()
      element.remove()
      removeTooltipDescription(context.element, element.id)
    },
  }
}

function removeTooltipDescription(element: SVGSVGElement, id: string) {
  const remaining = (element.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .filter((value) => value && value !== id)
  if (remaining.length) element.setAttribute('aria-describedby', remaining.join(' '))
  else element.removeAttribute('aria-describedby')
}

function validateCrosshair(options: Readonly<TooltipOptions>, plugins: readonly object[]) {
  if (options.crosshair && !plugins.includes(options.crosshair)) {
    throw new Error('tooltip.crosshair must be included in plot.plugins.')
  }
}

function validateTargets(
  targets: readonly TooltipMark[] | undefined,
  marks: readonly object[],
  context: {
    readonly scales: Readonly<Record<string, unknown>>
    direction(name: string): string
  },
) {
  if (!targets) return
  for (const mark of targets) {
    if (!marks.includes(mark)) {
      throw new Error('tooltip.marks must be included in plot.marks.')
    }
    if (!Object.hasOwn(context.scales, mark.x) || !Object.hasOwn(context.scales, mark.y)) {
      throw new Error('tooltip.marks references a missing scale.')
    }
    if (context.direction(mark.x) !== 'x' || context.direction(mark.y) !== 'y') {
      throw new Error('tooltip.marks requires Cartesian x and y scales.')
    }
  }
}

export const tooltipDefinition: PluginDefinition<TooltipHandle> = {
  name: 'tooltip',
  is: isTooltipHandle,
  validate(handle, context) {
    if (context.coordinateSystem !== 'cartesian') {
      throw new Error('The tooltip plugin currently supports Cartesian plots only.')
    }
    if (context.plugins.filter(isTooltipHandle).length > 1) {
      throw new Error('A plot can install at most one tooltip plugin.')
    }
    validateTargets(handle.options.get().resolved.marks, context.marks, context)
    validateCrosshair(handle.options.get().resolved, context.plugins)
  },
  install: installTooltip,
}

export function tooltip(initial: OptionPatch<TooltipOptions> = {}): TooltipHandle {
  return registerPlugin(createTooltipHandle(initial), tooltipDefinition)
}

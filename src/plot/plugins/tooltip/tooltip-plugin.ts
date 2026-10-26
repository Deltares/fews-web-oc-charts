import { reactive } from '../../../core/runtime.js'
import type { PluginDefinition, PlotContext } from '../plugin-definition.js'
import {
  isTooltipHandle,
  validateTooltipUpdates,
  type TooltipHandle,
  type TooltipMark,
  type TooltipPlacementPosition,
  type TooltipOptions,
} from './tooltip.js'
import { TooltipPosition } from '../../../Tooltip/tooltip.js'
import { calculateTooltipPlacement } from '../../../Utils/tooltipPlacement.js'
import { positionTooltipArrow } from '../../../Utils/tooltipArrow.js'
import { computeTooltipModel, type TooltipModel } from './tooltip-model.js'
import { createLegendSwatch } from '../legend/legend-swatch.js'

let nextTooltipId = 0

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
  const preferredPosition: Record<TooltipPlacementPosition, TooltipPosition> = {
    bottom: TooltipPosition.Bottom,
    left: TooltipPosition.Left,
    right: TooltipPosition.Right,
    top: TooltipPosition.Top,
  }
  const position = calculateTooltipPlacement({
    x: clientX,
    y: clientY,
    preferredPosition: preferredPosition[preferred],
    containerWidth: window.innerWidth,
    containerHeight: window.innerHeight,
    tooltipWidth: element.offsetWidth,
    tooltipHeight: element.offsetHeight,
  })
  element.style.left = `${position.x}px`
  element.style.top = `${position.y}px`
  element.style.transform =
    position.position === TooltipPosition.Top
      ? 'translate(-50%, calc(-100% - 6px))'
      : position.position === TooltipPosition.Bottom
        ? 'translate(-50%, 6px)'
        : position.position === TooltipPosition.Left
          ? 'translate(calc(-100% - 6px), -50%)'
          : 'translate(6px, -50%)'
  positionTooltipArrow(element, position, clientX, clientY)
}

function renderTooltip(element: HTMLDivElement, context: PlotContext, model: TooltipModel) {
  const theme = context.theme.get()
  element.style.fontFamily = theme.fontFamily
  element.style.fontSize = `${theme.fontSize}px`
  element.replaceChildren()
  for (const entry of model.entries) {
    const row = document.createElement('div')
    row.dataset.tooltipEntry = ''
    row.style.display = 'flex'
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
    values.textContent = entry.details
    row.append(symbol, name, values)
    element.append(row)
  }
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
    visibility: 'hidden',
    pointerEvents: 'none',
    padding: '6px 8px',
    borderRadius: '3px',
    background: 'var(--fews-chart-tooltip-background, #fff)',
    color: 'var(--fews-chart-tooltip-color, #222)',
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

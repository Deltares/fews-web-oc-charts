import { reactive } from '../core/runtime.js'
import type { PluginDefinition, PlotContext } from './plugin-definition.js'
import {
  isTooltipHandle,
  validateTooltipUpdates,
  type TooltipHandle,
  type TooltipMark,
  type TooltipPlacementPosition,
  type TooltipOptions,
} from './tooltip.js'
import { isLineMark } from './line.js'
import { isSeriesMark } from './series.js'
import { nearestPoint } from './point-hit-testing.js'
import { TooltipPosition } from '../Tooltip/tooltip.js'
import { calculateTooltipPlacement } from '../Utils/tooltipPlacement.js'
import { displayInspectionValue as displayValue } from './inspection.js'

let nextTooltipId = 0

function label(mark: TooltipMark, index: number) {
  if (isSeriesMark(mark))
    return mark.options.get().resolved.label || mark.id || `Series ${index + 1}`
  return mark.id || mark.y
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
    font: '12px/1.4 sans-serif',
    whiteSpace: 'nowrap',
  })
  const describedBy = new Set(
    (context.element.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean),
  )
  describedBy.add(element.id)
  context.element.setAttribute('aria-describedby', [...describedBy].join(' '))
  document.body.append(element)

  const stopValidation = validateTooltipUpdates(handle, (options) => {
    validateTargets(options.marks, context.options.get().resolved.marks, context)
    validateCrosshair(options, context.options.get().resolved.plugins)
  })

  try {
    context.scope.run(() =>
      reactive.effect(() => {
        const options = handle.options.get().resolved
        const plotOptions = context.options.get().resolved
        const pointer = context.pointer.get()
        const region = context.regions.get().plot
        const marks = options.marks ?? plotOptions.marks.filter(isEligibleMark)
        const inspection = options.crosshair
          ? context.inspectCrosshair(options.crosshair)
          : undefined
        const point = inspection?.point ?? { x: pointer.px + region.x, y: pointer.py + region.y }
        const axis = inspection?.options.snap?.axis ?? options.axis
        const hits =
          pointer.inside && (!inspection || inspection.visible)
            ? marks.flatMap((mark, index) => {
                if (
                  axis === 'xy' &&
                  inspection?.options.snap &&
                  mark !== inspection.options.snap.mark
                ) {
                  return []
                }
                const hit =
                  inspection?.options.snap?.mark === mark
                    ? inspection.hit
                    : nearestPoint(mark, context.scales, point, axis, region)
                return hit ? [{ mark, hit, index }] : []
              })
            : []
        const selected =
          axis === 'xy'
            ? hits.reduce<typeof hits>(
                (closest, item) =>
                  !closest.length || item.hit.distance < closest[0].hit.distance ? [item] : closest,
                [],
              )
            : hits

        element.replaceChildren()
        for (const item of selected) {
          const row = document.createElement('div')
          row.dataset.tooltipEntry = ''
          row.style.display = 'flex'
          row.style.alignItems = 'center'
          row.style.gap = '5px'
          const markColor =
            item.mark.stroke ?? item.mark.markers?.fill ?? 'var(--fews-chart-accent, currentColor)'
          const symbol = document.createElement('span')
          symbol.dataset.tooltipSymbol = ''
          symbol.setAttribute('aria-hidden', 'true')
          const markerSize = item.mark.markers?.size ?? 4
          Object.assign(symbol.style, {
            flex: 'none',
            width: `${markerSize * 2}px`,
            height: `${markerSize * 2}px`,
            boxSizing: 'border-box',
            borderRadius: '50%',
            backgroundColor: item.mark.markers?.fill || markColor,
          })
          const markerStroke = item.mark.markers?.stroke
          if (markerStroke && markerStroke !== 'none') {
            symbol.style.border = `${item.mark.markers?.strokeWidth ?? 0}px solid ${markerStroke}`
          }
          const name = document.createElement('span')
          name.dataset.tooltipLabel = ''
          name.style.color = markColor
          name.textContent = label(item.mark, item.index)
          const xScale = context.scales[item.mark.x]
          const x = displayValue(item.hit.x, context, item.mark.x)
          const y = displayValue(item.hit.y, context, item.mark.y, item.mark.digits)
          const values = document.createElement('span')
          const redundant = (axis: 'x' | 'y') =>
            inspection?.coordinates.some(
              (coordinate) =>
                coordinate.axis === axis &&
                coordinate.scale === item.mark[axis] &&
                coordinate.value === item.hit[axis] &&
                displayValue(coordinate.value, context, coordinate.scale, coordinate.digits) ===
                  (axis === 'x' ? x : y),
            )
          const details: string[] = []
          if (!redundant('x')) details.push(xScale?.scale.kind === 'time' ? x : `x: ${x}`)
          if (!redundant('y')) details.push(inspection ? y : `y: ${y}`)
          values.textContent = details.length ? ` · ${details.join(' · ')}` : ''
          row.append(symbol, name, values)
          element.append(row)
        }
        element.setAttribute(
          'aria-label',
          selected
            .map(
              ({ mark, hit, index }) =>
                `${label(mark, index)} · ${displayValue(hit.x, context, mark.x)} · y: ${displayValue(hit.y, context, mark.y, mark.digits)}`,
            )
            .join('; '),
        )
        if (!selected.length) {
          element.style.visibility = 'hidden'
          element.setAttribute('aria-hidden', 'true')
          return
        }

        element.style.visibility = 'hidden'
        positionTooltip(element, context, point.x, point.y, options.position)
        element.style.visibility = 'visible'
        element.setAttribute('aria-hidden', 'false')
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

function isEligibleMark(mark: object): mark is TooltipMark {
  return isLineMark(mark) || isSeriesMark(mark)
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

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
import { nearestPoint, type PointHit } from './point-hit-testing.js'
import { compositeHits, type CompositeHit } from './composite-hit-testing.js'
import { isBarMark } from './bar.js'
import { isStackedAreaMark } from './stacked-area.js'
import { TooltipPosition } from '../Tooltip/tooltip.js'
import { calculateTooltipPlacement } from '../Utils/tooltipPlacement.js'
import { displayInspectionValue as displayValue } from './inspection.js'

let nextTooltipId = 0

function label(mark: TooltipMark, index: number) {
  if (isSeriesMark(mark))
    return mark.options.get().resolved.label || mark.id || `Series ${index + 1}`
  if (isBarMark(mark) || isStackedAreaMark(mark)) {
    const options = mark.options.get().resolved
    return options.label || mark.id || `Mark ${index + 1}`
  }
  return mark.id || mark.y
}

type TooltipHit = PointHit | CompositeHit
interface TooltipHitEntry {
  readonly mark: TooltipMark
  readonly hit: TooltipHit
  readonly index: number
}

function tooltipColor(mark: TooltipMark, hit: TooltipHit) {
  if ('layerId' in hit && (isBarMark(mark) || isStackedAreaMark(mark))) {
    if (isBarMark(mark)) {
      const options = mark.options.get().resolved
      const layer = options.layers?.find((candidate) => candidate.id === hit.layerId)
      return layer?.fill ?? options.fill ?? 'var(--fews-chart-accent, currentColor)'
    }

    const options = mark.options.get().resolved
    const layer = options.layers.find((candidate) => candidate.id === hit.layerId)
    return layer?.fill ?? options.fill ?? 'var(--fews-chart-accent, currentColor)'
  }
  if (isLineMark(mark) || isSeriesMark(mark)) {
    return mark.stroke ?? mark.markers?.fill ?? 'var(--fews-chart-accent, currentColor)'
  }
  return 'var(--fews-chart-accent, currentColor)'
}

function tooltipDigits(mark: TooltipMark, options: Readonly<TooltipOptions>) {
  return options.digits ?? (isLineMark(mark) || isSeriesMark(mark) ? mark.digits : undefined)
}

function compositeValueAxis(mark: TooltipMark, hit: TooltipHit) {
  if (!('layerId' in hit)) return undefined
  return isBarMark(mark) && mark.options.get().resolved.orientation === 'horizontal' ? 'x' : 'y'
}

function compositeDetails(
  mark: TooltipMark,
  hit: CompositeHit,
  context: PlotContext,
  digits: number | undefined,
) {
  const valueScale =
    isBarMark(mark) && mark.options.get().resolved.orientation === 'horizontal' ? mark.x : mark.y
  const format = (value: number) => displayValue(value, context, valueScale, digits)
  const parts = [format(hit.value)]
  if (hit.stack !== undefined) parts.push(`stack: ${hit.stack}`)
  parts.push(`bounds: ${format(hit.lower)}–${format(hit.upper)}`)
  return parts
}

function accessibleLabel(
  mark: TooltipMark,
  hit: TooltipHit,
  index: number,
  context: PlotContext,
  options: Readonly<TooltipOptions>,
) {
  const digits = tooltipDigits(mark, options)
  const parts = [label(mark, index)]
  const valueAxis = compositeValueAxis(mark, hit)
  if (options.showX && valueAxis !== 'x') parts.push(displayValue(hit.x, context, mark.x))
  if (valueAxis !== 'y') parts.push(`y: ${displayValue(hit.y, context, mark.y, digits)}`)
  if ('layerId' in hit) {
    parts[0] += ` · ${hit.layerLabel}`
    parts.push(...compositeDetails(mark, hit, context, digits))
  }
  return parts.join(' · ')
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
  let pathContext: CanvasRenderingContext2D | undefined

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
        const hits: TooltipHitEntry[] =
          pointer.inside && (!inspection || inspection.visible)
            ? marks.flatMap<TooltipHitEntry>((mark, index): TooltipHitEntry[] => {
                if (
                  axis === 'xy' &&
                  inspection?.options.snap &&
                  mark !== inspection.options.snap.mark
                ) {
                  return []
                }
                if (isBarMark(mark) || isStackedAreaMark(mark)) {
                  if (inspection?.options.snap?.mark === mark) {
                    return inspection.hits.flatMap((hit) =>
                      'layerId' in hit ? [{ mark, hit, index }] : [],
                    )
                  }
                  const canvasContext = isStackedAreaMark(mark)
                    ? (pathContext ??=
                        document.createElement('canvas').getContext('2d') ?? undefined)
                    : undefined
                  return compositeHits(
                    mark,
                    context.scales,
                    point,
                    axis,
                    region,
                    canvasContext,
                  ).map((hit) => ({ mark, hit, index }))
                }
                if (isLineMark(mark) || isSeriesMark(mark)) {
                  const hit: TooltipHit | undefined =
                    inspection?.options.snap?.mark === mark
                      ? inspection.hit
                      : nearestPoint(mark, context.scales, point, axis, region)
                  return hit ? [{ mark, hit, index }] : []
                }
                return []
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
          const markColor = tooltipColor(item.mark, item.hit)
          const symbol = document.createElement('span')
          symbol.dataset.tooltipSymbol = ''
          symbol.setAttribute('aria-hidden', 'true')
          const markerSize =
            isLineMark(item.mark) || isSeriesMark(item.mark) ? (item.mark.markers?.size ?? 4) : 4
          Object.assign(symbol.style, {
            flex: 'none',
            width: `${markerSize * 2}px`,
            height: `${markerSize * 2}px`,
            boxSizing: 'border-box',
            borderRadius: 'layerId' in item.hit ? '1px' : '50%',
            backgroundColor:
              !('layerId' in item.hit) && (isLineMark(item.mark) || isSeriesMark(item.mark))
                ? item.mark.markers?.fill || markColor
                : markColor,
          })
          const markerStroke =
            !('layerId' in item.hit) && (isLineMark(item.mark) || isSeriesMark(item.mark))
              ? item.mark.markers?.stroke
              : undefined
          if (markerStroke && markerStroke !== 'none') {
            const strokeWidth =
              isLineMark(item.mark) || isSeriesMark(item.mark)
                ? (item.mark.markers?.strokeWidth ?? 0)
                : 0
            symbol.style.border = `${strokeWidth}px solid ${markerStroke}`
          }
          const name = document.createElement('span')
          name.dataset.tooltipLabel = ''
          name.style.color = markColor
          name.textContent =
            'layerLabel' in item.hit
              ? `${label(item.mark, item.index)} · ${item.hit.layerLabel}`
              : label(item.mark, item.index)
          const xScale = context.scales[item.mark.x]
          const x = displayValue(item.hit.x, context, item.mark.x)
          const digits = tooltipDigits(item.mark, options)
          const y = displayValue(item.hit.y, context, item.mark.y, digits)
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
          const valueAxis = compositeValueAxis(item.mark, item.hit)
          if (options.showX && valueAxis !== 'x' && !redundant('x')) {
            details.push(xScale?.scale.kind === 'time' ? x : `x: ${x}`)
          }
          if (valueAxis !== 'y' && !redundant('y')) details.push(inspection ? y : `y: ${y}`)
          if ('layerId' in item.hit) {
            details.push(...compositeDetails(item.mark, item.hit, context, digits))
          }
          values.textContent = details.length ? ` · ${details.join(' · ')}` : ''
          row.append(symbol, name, values)
          element.append(row)
        }
        element.setAttribute(
          'aria-label',
          selected
            .map(({ mark, hit, index }) => accessibleLabel(mark, hit, index, context, options))
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
  return isLineMark(mark) || isSeriesMark(mark) || isBarMark(mark) || isStackedAreaMark(mark)
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

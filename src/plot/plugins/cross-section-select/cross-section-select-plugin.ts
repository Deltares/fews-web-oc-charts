import { precisionFixed } from 'd3-format'
import { reactive } from '../../../core/runtime.js'
import type { ScaleKind } from '../../../scales/scale.js'
import { resolveLineStyles } from '../../marks/mark-styles.js'
import type { PluginDefinition, PlotContext } from '../plugin-definition.js'
import {
  isCrossSectionMark,
  isCrossSectionSelectHandle,
  notifyCrossSectionChange,
  publishCrossSectionData,
  validateCrossSectionSelectUpdates,
  type CrossSectionMark,
  type CrossSectionPoint,
  type CrossSectionSelectHandle,
  type CrossSectionSelectOptions,
} from './cross-section-select.js'
import { isLineMark } from '../../marks/line/line.js'
import { isSeriesMark } from '../../marks/line/series.js'
import { displayInspectionValue } from '../../interaction/inspection.js'
import { svgElement } from '../../rendering/svg.js'
import { markerSymbolPath, markerSymbolRotation } from '../../marks/line/marker-symbol.js'

interface CrossSectionValidationContext {
  readonly marks: readonly object[]
  scaleKind(name: string): ScaleKind | undefined
  direction(name: string): string
}

function selectedMarks(
  options: Readonly<CrossSectionSelectOptions>,
  marks: readonly object[],
): CrossSectionMark[] {
  if (options.marks === 'none') return []
  if (options.marks === 'all') return marks.filter(isCrossSectionMark)
  return [...options.marks]
}

function validateOptions(
  options: Readonly<CrossSectionSelectOptions>,
  value: number,
  context: CrossSectionValidationContext,
) {
  const xKind = context.scaleKind(options.x)
  if (!xKind || context.direction(options.x) !== 'x' || xKind === 'band') {
    throw new Error(`crossSectionSelect.x requires a continuous x-direction scale "${options.x}".`)
  }
  if (xKind === 'log' && value <= 0) {
    throw new RangeError('crossSectionSelect value must be positive for a log x scale.')
  }
  if (xKind === 'time' && Math.abs(value) > 8.64e15) {
    throw new RangeError('crossSectionSelect value must be within the JavaScript Date range.')
  }
  for (const mark of selectedMarks(options, context.marks)) {
    if (!context.marks.includes(mark)) {
      throw new Error('crossSectionSelect.marks must be included in plot.marks.')
    }
    if (
      !context.scaleKind(mark.x) ||
      context.direction(mark.x) !== 'x' ||
      context.scaleKind(mark.x) === 'band' ||
      !context.scaleKind(mark.y) ||
      context.scaleKind(mark.y) === 'band' ||
      context.direction(mark.y) !== 'y'
    ) {
      throw new Error('crossSectionSelect marks require continuous Cartesian x and y scales.')
    }
  }
}

function marksForRender(
  options: Readonly<CrossSectionSelectOptions>,
  marks: readonly object[],
): CrossSectionMark[] {
  return selectedMarks(options, marks)
}

function pointFor(
  mark: CrossSectionMark,
  value: number,
  context: PlotContext,
): CrossSectionPoint | undefined {
  if (isSeriesMark(mark)) {
    mark.options.get()
    if (!mark.visible) return undefined
    mark.data.version
  }
  const xScale = context.scales[mark.x]
  const yScale = context.scales[mark.y]
  if (!xScale || !yScale) return undefined
  const length = isSeriesMark(mark) ? mark.data.length : mark.xValues.length
  let low = 0
  let high = length
  const xAt = (index: number) => (isSeriesMark(mark) ? mark.data.xAt(index) : mark.xValues[index])
  const yAt = (index: number) => (isSeriesMark(mark) ? mark.data.yAt(index) : mark.yValues[index])
  while (low < high) {
    const middle = (low + high) >>> 1
    const x = xAt(middle)
    if (typeof x !== 'number' || x < value) low = middle + 1
    else high = middle
  }
  if (low >= length) low = length - 1
  if (low < 0) return undefined

  let index = low
  let yValue = yAt(index)
  if (typeof yValue !== 'number' || !Number.isFinite(yValue)) {
    for (let candidate = index - 1; candidate >= 0; candidate -= 1) {
      const previous = yAt(candidate)
      if (typeof previous === 'number' && Number.isFinite(previous)) {
        index = candidate
        yValue = previous
        break
      }
    }
  }
  if (typeof yValue !== 'number' || !Number.isFinite(yValue)) return undefined
  const xValue = xAt(index)
  if (typeof xValue !== 'number') return undefined
  if (xScale.scale.kind === 'log' && xValue <= 0) return undefined
  if (yScale.scale.kind === 'log' && yValue <= 0) return undefined
  const domain = yScale.scale.domain.get()
  if (yValue < Number(domain[0]) || yValue > Number(domain[1])) return undefined
  const yDomain = yScale.scale.domain.get()
  const interval = Math.abs(Number(yDomain[1]) - Number(yDomain[0])) / 100
  const digits =
    mark.digits ?? (interval > 0 ? Math.max(0, Math.min(15, precisionFixed(interval))) : 2)
  const formatted = yValue.toFixed(digits)
  const markId = isLineMark(mark) ? mark.id : mark.options.get().resolved.id
  return Object.freeze({
    id: markId,
    mark,
    index,
    x: context.scales[mark.x].project(xValue),
    y: yScale.project(yValue),
    value: formatted,
    data: Object.freeze({ x: xValue, y: yValue }),
  })
}

function installCrossSectionSelect(handle: CrossSectionSelectHandle, context: PlotContext) {
  const guide = svgElement('g', {
    'data-layer': 'cross-section-select',
    'aria-hidden': 'true',
  })
  const line = svgElement('line', {
    'data-cross-section-line': '',
    stroke: 'currentColor',
    'stroke-opacity': 0.65,
    'stroke-dasharray': '3 3',
    'vector-effect': 'non-scaling-stroke',
    'pointer-events': 'none',
  })
  const stemLayer = svgElement('g', { 'data-cross-section-stems': '', 'pointer-events': 'none' })
  const pointLayer = svgElement('g', { 'data-cross-section-points': '', 'pointer-events': 'none' })
  const handleGroup = svgElement('g', {
    'data-cross-section-handle': '',
    'data-draggable': 'false',
  })
  const hitLine = svgElement('line', {
    stroke: 'transparent',
    'stroke-width': 12,
    'data-cross-section-hitline': '',
    'pointer-events': 'none',
  })
  const callout = svgElement('g', { 'data-cross-section-callout': '' })
  const calloutBackground = svgElement('rect', {
    height: 22,
    rx: 3,
    fill: 'var(--fews-chart-tooltip-background, #fff)',
    stroke: 'currentColor',
    'stroke-opacity': 0.4,
    'data-cross-section-hitbox': '',
    'pointer-events': 'none',
  })
  const calloutText = svgElement('text', {
    'data-cross-section-value': '',
    x: 6,
    y: 15,
    fill: 'var(--fews-chart-tooltip-color, #222)',
    'font-family': 'sans-serif',
    'font-size': 12,
    'pointer-events': 'none',
  })
  callout.append(calloutBackground, calloutText)
  handleGroup.append(hitLine, callout)
  const labelLayer = svgElement('g', {
    'data-cross-section-labels': '',
    'pointer-events': 'none',
  })
  labelLayer.style.filter = 'drop-shadow(0 1px 2.5px rgb(0 0 0 / 25%))'
  guide.append(line, stemLayer, labelLayer, pointLayer, handleGroup)
  context.element.append(guide)

  let activePointer: number | undefined
  let captured = false
  let dragChanged = false
  const binding = () => context.scales[handle.options.get().resolved.x]

  function hide() {
    guide.setAttribute('display', 'none')
    stemLayer.replaceChildren()
    pointLayer.replaceChildren()
    labelLayer.replaceChildren()
  }

  function render() {
    const options = handle.options.get().resolved
    const value = handle.value.get()
    const xBinding = binding()
    const plot = context.regions.get().plot
    const size = context.size.get()
    const domain = xBinding?.scale.domain.get()
    if (!xBinding || !domain || value < Number(domain[0]) || value > Number(domain[1])) {
      hide()
      publishCrossSectionData(handle, Object.freeze([]))
      return
    }

    const x = xBinding.project(value)
    const marks = marksForRender(options, context.options.get().resolved.marks)
    const entries = marks
      .map((mark, index) => ({ point: pointFor(mark, value, context), index }))
      .filter((entry): entry is { point: CrossSectionPoint; index: number } => !!entry.point)
    const points = entries.map(({ point }) => point)
    publishCrossSectionData(handle, Object.freeze(points))

    guide.removeAttribute('display')
    const bottom = plot.y + plot.height
    line.setAttribute('x1', String(x))
    line.setAttribute('x2', String(x))
    line.setAttribute('y1', String(plot.y))
    line.setAttribute('y2', String(bottom))
    hitLine.setAttribute('x1', String(x))
    hitLine.setAttribute('x2', String(x))
    hitLine.setAttribute('y1', String(plot.y))
    hitLine.setAttribute('y2', String(bottom))

    handleGroup.dataset.draggable = String(options.draggable)
    hitLine.setAttribute('pointer-events', options.draggable ? 'stroke' : 'none')
    calloutBackground.setAttribute('pointer-events', options.draggable ? 'all' : 'none')
    handleGroup.style.cursor = options.draggable ? 'ew-resize' : ''
    handleGroup.style.touchAction = options.draggable ? 'none' : ''

    calloutText.textContent =
      options.format?.(value) ?? displayInspectionValue(value, context, options.x, 2)
    const calloutWidth = calloutText.getComputedTextLength() + 12
    calloutBackground.setAttribute('width', String(calloutWidth))
    const calloutX = Math.max(0, Math.min(size.width - calloutWidth, x - calloutWidth / 2))
    const calloutY = Math.max(0, Math.min(size.height - 22, bottom))
    callout.setAttribute('transform', `translate(${calloutX} ${calloutY})`)

    stemLayer.replaceChildren()
    pointLayer.replaceChildren()
    labelLayer.replaceChildren()
    if (!entries.length) return
    const theme = context.theme.get()
    const labelHeight = 20
    const labelGap = 4
    const offset = 12
    const labels = entries
      .map(({ point }) => {
        const styles = resolveLineStyles(point.mark, theme)
        const color = point.mark.stroke ?? styles.line.stroke
        const markerShape = styles.marker.shape
        const markerArea = point.mark.markers ? styles.marker.size : 16 * Math.PI
        const markerSize = Math.sqrt(markerArea / Math.PI)
        const openShape = markerShape === 'x' || markerShape === 'plus'
        const marker =
          markerShape === 'circle'
            ? svgElement('circle', {
                cx: point.x,
                cy: point.y,
                r: markerSize,
                fill: styles.marker.fill,
                stroke: styles.marker.stroke,
                'stroke-width': styles.marker.strokeWidth,
              })
            : svgElement('path', {
                d: markerSymbolPath(markerShape, markerArea),
                transform: `translate(${point.x},${point.y}) rotate(${markerSymbolRotation(markerShape)})`,
                fill: openShape ? 'none' : styles.marker.fill,
                stroke: styles.marker.stroke,
                'stroke-width': styles.marker.strokeWidth,
              })
        marker.dataset.crossSectionPoint = point.id ?? ''
        pointLayer.append(marker)
        const group = svgElement('g', { 'data-cross-section-entry': point.id ?? '' })
        const background = svgElement('rect', {
          height: labelHeight,
          rx: labelHeight / 2,
          fill: 'var(--fews-chart-tooltip-background, #fff)',
        })
        const text = svgElement('text', {
          x: labelHeight / 2,
          y: labelHeight / 2,
          'dominant-baseline': 'central',
          'font-family': 'sans-serif',
          'font-size': 12,
          fill: color,
          'data-cross-section-label': point.id ?? '',
        })
        text.textContent = point.value
        group.append(background, text)
        labelLayer.append(group)
        const width = text.getComputedTextLength() + labelHeight
        background.setAttribute('width', String(width))
        const placeLeft =
          point.x + offset + width > plot.x + plot.width && point.x - offset - width >= plot.x
        const left = placeLeft ? point.x - offset - width : point.x + offset
        return {
          point,
          color,
          group,
          width,
          left,
          placeLeft,
          markerSize,
          top: Math.max(plot.y, point.y - labelHeight / 2),
        }
      })
      .sort((a, b) => a.point.y - b.point.y)

    // Place each label at the free position closest to its own point. Candidates are the
    // ideal position and the slots directly above/below every box it could collide with, so
    // a label moves up or down depending on which side is nearer.
    interface Box {
      readonly left: number
      readonly width: number
      readonly top: number
      readonly height: number
    }
    const minTop = plot.y
    const maxTop = Math.max(minTop, plot.y + plot.height - labelHeight)
    const clampTop = (top: number) => Math.max(minTop, Math.min(maxTop, top))
    const boxes: Box[] = labels.map(({ point, markerSize }) => ({
      left: point.x - markerSize,
      width: markerSize * 2,
      top: point.y - markerSize,
      height: markerSize * 2,
    }))
    const overlapsX = (label: (typeof labels)[number], box: Box) =>
      label.left < box.left + box.width + labelGap && box.left < label.left + label.width + labelGap
    const collides = (label: (typeof labels)[number], top: number, box: Box) =>
      overlapsX(label, box) &&
      top < box.top + box.height + labelGap &&
      box.top < top + labelHeight + labelGap
    const ideal = (label: (typeof labels)[number]) => clampTop(label.point.y - labelHeight / 2)
    for (const label of labels) {
      const target = ideal(label)
      const nearby = boxes.filter((box) => overlapsX(label, box))
      const candidates = [
        target,
        ...nearby.flatMap((box) => [
          box.top - labelHeight - labelGap,
          box.top + box.height + labelGap,
        ]),
      ]
        .filter((top) => top >= minTop && top <= maxTop)
        .sort((a, b) => Math.abs(a - target) - Math.abs(b - target))
      label.top =
        candidates.find((top) => nearby.every((box) => !collides(label, top, box))) ?? target
      boxes.push({ left: label.left, width: label.width, top: label.top, height: labelHeight })
    }

    for (const label of labels) {
      const { left, placeLeft } = label
      const centerY = label.top + labelHeight / 2
      label.group.setAttribute('transform', `translate(${left} ${label.top})`)
      stemLayer.append(
        svgElement('line', {
          x1: label.point.x,
          y1: label.point.y,
          x2: placeLeft ? left + label.width - labelHeight / 2 : left + labelHeight / 2,
          y2: centerY,
          stroke: label.color,
          'stroke-width': 1,
          'data-cross-section-stem': label.point.id ?? '',
        }),
      )
    }
  }

  function finish(event?: PointerEvent) {
    if (activePointer === undefined || (event && event.pointerId !== activePointer)) return
    const pointerId = activePointer
    activePointer = undefined
    if (captured && context.element.hasPointerCapture(pointerId)) {
      context.element.releasePointerCapture(pointerId)
    }
    captured = false
    if (dragChanged) notifyCrossSectionChange(handle)
    dragChanged = false
  }

  context.on('pointerdown', (event) => {
    if (
      !handle.options.get().resolved.draggable ||
      activePointer !== undefined ||
      !event.isPrimary ||
      event.button !== 0 ||
      !(event.target instanceof Element) ||
      !event.target.closest('[data-cross-section-handle]')
    ) {
      return
    }
    activePointer = event.pointerId
    dragChanged = false
    if (event.isTrusted) {
      context.element.setPointerCapture(event.pointerId)
      captured = true
    }
    event.preventDefault()
  })
  context.on('pointermove', (event) => {
    if (activePointer !== event.pointerId) return
    const position = context.locate(event)
    const xBinding = binding()
    if (!position || !xBinding) return
    const domain = xBinding.scale.domain.get()
    const next = Math.max(
      Number(domain[0]),
      Math.min(Number(domain[1]), xBinding.invert(position.svgX)),
    )
    if (Number.isFinite(next) && next !== handle.value.get()) {
      handle.setValue(next)
      dragChanged = true
      render()
    }
    event.preventDefault()
  })
  context.on('pointerup', finish)
  context.on('pointercancel', finish)
  context.on('lostpointercapture', finish)

  const stopValidation = validateCrossSectionSelectUpdates(handle, (options, value) =>
    validateOptions(options, value, {
      marks: context.options.get().resolved.marks,
      scaleKind: (name) => context.scales[name]?.scale.kind,
      direction: context.direction,
    }),
  )
  validateOptions(handle.options.get().resolved, handle.value.get(), {
    marks: context.options.get().resolved.marks,
    scaleKind: (name) => context.scales[name]?.scale.kind,
    direction: context.direction,
  })
  context.scope.run(() => reactive.effect(render))
  return {
    destroy() {
      finish()
      stopValidation()
      publishCrossSectionData(handle, Object.freeze([]))
      guide.remove()
    },
  }
}

export const crossSectionSelectDefinition: PluginDefinition<CrossSectionSelectHandle> = {
  name: 'crossSectionSelect',
  is: isCrossSectionSelectHandle,
  validate(handle, context) {
    if (context.coordinateSystem !== 'cartesian') {
      throw new Error('The crossSectionSelect plugin supports Cartesian plots only.')
    }
    if (context.plugins.filter(isCrossSectionSelectHandle).length > 1) {
      throw new Error('A plot can install at most one crossSectionSelect plugin.')
    }
    validateOptions(handle.options.get().resolved, handle.value.get(), {
      marks: context.marks,
      scaleKind: (name) => context.scales[name]?.kind,
      direction: context.direction,
    })
  },
  install: installCrossSectionSelect,
}

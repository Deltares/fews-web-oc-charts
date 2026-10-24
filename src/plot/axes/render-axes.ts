import type { AxisHandle, AxisOptions } from './axis.js'
import type { PlotLayout } from '../../layout/layout.js'
import type { ScaleBinding, ScaleValue } from '../../scales/scale.js'
import type { ThemeTokens } from '../../theme/theme.js'
import { formatZonedTickLabels } from '../../time/zoned-time.js'
import { renderClassicAxis } from './classic-axis.js'
import { renderClassicPolarAxes } from './classic-polar-axis.js'

import { svgElement } from '../rendering/svg.js'
export { svgElement, svgNamespace } from '../rendering/svg.js'

export function tickFormatter(
  binding: ScaleBinding,
  axis: AxisHandle,
): (value: ScaleValue) => string {
  const options = axis.options.get().resolved
  if (options.format) return options.format
  const config = binding.scale.options.get().resolved
  if (binding.scale.kind === 'time') {
    const formatter = new Intl.DateTimeFormat(options.locale ?? config.locale, {
      timeZone: options.timeZone ?? config.timeZone,
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'shortOffset',
    })
    return (value) => formatter.format(Number(value))
  }
  const formatter = new Intl.NumberFormat(config.locale, { maximumSignificantDigits: 6 })
  return (value) => (typeof value === 'string' ? value : formatter.format(value))
}

export interface AxisTickLabel {
  value: ScaleValue
  primary: string
  secondary: string
}

export function axisTickLabels(binding: ScaleBinding, axis: AxisHandle): readonly AxisTickLabel[] {
  const options = axis.options.get().resolved
  const config = binding.scale.options.get().resolved
  const timeZone = options.timeZone ?? config.timeZone
  const ticks = binding.ticks(options.tickCount, timeZone)
  const horizontal = options.position === 'top' || options.position === 'bottom'
  if (binding.scale.kind === 'time' && !options.format && horizontal) {
    const labels = formatZonedTickLabels(
      timeZone,
      options.locale ?? config.locale,
      ticks.map(Number),
      binding.scale.domain.get().map(Number),
      options.tickCount,
    )
    return ticks.map((value, index) => ({
      value,
      primary: labels[index].primary,
      secondary: labels[index].secondary,
    }))
  }
  const format = tickFormatter(binding, axis)
  return ticks.map((value) => ({ value, primary: format(value), secondary: '' }))
}

export function renderAxes(
  axesLayer: SVGGElement,
  gridLayer: SVGGElement,
  axes: readonly AxisHandle[],
  bindings: Readonly<Record<string, ScaleBinding>>,
  regions: PlotLayout,
  theme: ThemeTokens,
) {
  axesLayer.replaceChildren()
  gridLayer.replaceChildren()
  axes.forEach((axis, index) => {
    const group = svgElement('g', {
      'data-scale': axis.scale,
      'data-position': axis.options.get().resolved.position,
      fill: 'currentColor',
    })
    if (axis.options.get().resolved.style === 'classic') {
      renderClassicAxis(group, gridLayer, axis, bindings[axis.scale], regions, bindings)
    } else {
      renderCartesianAxis(
        group,
        gridLayer,
        axis,
        bindings[axis.scale],
        regions,
        index,
        theme,
        bindings,
      )
    }
    axesLayer.append(group)
  })
}

interface CartesianAxisGeometry {
  horizontal: boolean
  sign: 1 | -1
  baseline: number
  textAnchor: string
  dominantBaseline: string
}

function cartesianGeometry(position: string, band: PlotLayout['plot']): CartesianAxisGeometry {
  const horizontal = position === 'top' || position === 'bottom'
  const sign = position === 'top' || position === 'left' ? -1 : 1
  const horizontalBaseline = position === 'top' ? band.y + band.height : band.y
  const verticalBaseline = position === 'left' ? band.x + band.width : band.x
  const baseline = horizontal ? horizontalBaseline : verticalBaseline
  let textAnchor = 'middle'
  let dominantBaseline = 'middle'
  if (horizontal) {
    dominantBaseline = sign > 0 ? 'hanging' : 'auto'
  } else {
    textAnchor = sign < 0 ? 'end' : 'start'
  }
  return { horizontal, sign, baseline, textAnchor, dominantBaseline }
}

function rotatedText(
  text: string,
  x: number,
  y: number,
  angle: number | undefined,
  attributes: Record<string, string | number>,
): SVGTextElement {
  const element = svgElement('text', { x, y, ...attributes })
  if (angle) element.setAttribute('transform', `rotate(${angle} ${x} ${y})`)
  element.textContent = text
  return element
}

function renderCartesianTick(
  group: SVGGElement,
  { primary, secondary }: AxisTickLabel,
  pixel: number,
  options: Readonly<AxisOptions>,
  { horizontal, sign, baseline, textAnchor, dominantBaseline }: CartesianAxisGeometry,
  fontSize: number,
) {
  const x = horizontal ? pixel : baseline
  const y = horizontal ? baseline : pixel
  group.append(
    svgElement('line', {
      x1: x,
      y1: y,
      x2: x + (horizontal ? 0 : sign * 5),
      y2: y + (horizontal ? sign * 5 : 0),
      stroke: 'currentColor',
    }),
  )
  const labelX = x + (horizontal ? 0 : sign * 9)
  const labelY = y + (horizontal ? sign * 9 : 0)
  const textAttributes = { 'text-anchor': textAnchor, 'dominant-baseline': dominantBaseline }
  group.append(rotatedText(primary, labelX, labelY, options.labelAngle, textAttributes))
  if (secondary) {
    const contextY = labelY + sign * fontSize
    group.append(
      rotatedText(secondary, labelX, contextY, options.labelAngle, {
        ...textAttributes,
        'data-tick-context': '',
      }),
    )
  }
}

function renderCartesianGridLine(
  gridLayer: SVGGElement,
  pixel: number,
  plot: PlotLayout['plot'],
  horizontal: boolean,
) {
  gridLayer.append(
    svgElement('line', {
      x1: horizontal ? pixel : plot.x,
      x2: horizontal ? pixel : plot.x + plot.width,
      y1: horizontal ? plot.y : pixel,
      y2: horizontal ? plot.y + plot.height : pixel,
      stroke: 'inherit',
    }),
  )
}

function renderCartesianCaption(
  group: SVGGElement,
  options: Readonly<AxisOptions>,
  plot: PlotLayout['plot'],
  band: PlotLayout['plot'],
  { horizontal, sign }: CartesianAxisGeometry,
  fontSize: number,
) {
  const caption = [options.label, options.unit && `(${options.unit})`].filter(Boolean).join(' ')
  if (!caption) return
  const xOffset = sign < 0 ? fontSize : band.width - fontSize
  const yOffset = sign > 0 ? band.height - fontSize : fontSize
  const x = horizontal ? plot.x + plot.width / 2 : band.x + xOffset
  const y = horizontal ? band.y + yOffset : plot.y + plot.height / 2
  group.append(
    rotatedText(caption, x, y, horizontal ? undefined : -90, {
      'text-anchor': 'middle',
      'dominant-baseline': 'middle',
    }),
  )
}

function renderCartesianAxis(
  group: SVGGElement,
  gridLayer: SVGGElement,
  axis: AxisHandle,
  binding: ScaleBinding,
  regions: PlotLayout,
  index: number,
  theme: ThemeTokens,
  bindings: Readonly<Record<string, ScaleBinding>>,
) {
  const options = axis.options.get().resolved
  const plot = regions.plot
  const band = regions.axes[index]
  const geometry = cartesianGeometry(options.position, band)
  if (options.crossAt) {
    geometry.baseline = bindings[options.crossAt.scale].project(options.crossAt.value)
  }
  const { horizontal, baseline } = geometry
  group.append(
    svgElement('line', {
      x1: horizontal ? plot.x : baseline,
      x2: horizontal ? plot.x + plot.width : baseline,
      y1: horizontal ? baseline : plot.y,
      y2: horizontal ? baseline : plot.y + plot.height,
      stroke: 'currentColor',
    }),
  )
  for (const tick of axisTickLabels(binding, axis)) {
    const pixel = binding.project(tick.value) + binding.bandwidth / 2
    renderCartesianTick(group, tick, pixel, options, geometry, theme.fontSize)
    if (options.grid) {
      renderCartesianGridLine(gridLayer, pixel, plot, horizontal)
    }
  }
  renderCartesianCaption(group, options, plot, band, geometry, theme.fontSize)
}

interface PolarAxisGeometry {
  centerX: number
  centerY: number
  outerRadius: number
}

function renderRadialAxis(
  axisGroup: SVGGElement,
  gridLayer: SVGGElement,
  axis: AxisHandle,
  binding: ScaleBinding,
  { centerX, centerY }: PolarAxisGeometry,
) {
  const options = axis.options.get().resolved
  for (const tick of axisTickLabels(binding, axis)) {
    const r = binding.project(tick.value)
    const circle = svgElement('circle', {
      cx: centerX,
      cy: centerY,
      r,
      fill: 'none',
      stroke: 'currentColor',
    })
    axisGroup.append(circle)
    if (options.grid) gridLayer.append(circle.cloneNode(true))
    const label = svgElement('text', {
      x: centerX + 4,
      y: centerY - r - 3,
      'text-anchor': 'start',
    })
    label.textContent = tick.primary
    axisGroup.append(label)
  }
}

function renderAngularAxis(
  axisGroup: SVGGElement,
  gridLayer: SVGGElement,
  axis: AxisHandle,
  binding: ScaleBinding,
  { centerX, centerY, outerRadius }: PolarAxisGeometry,
) {
  const options = axis.options.get().resolved
  const config = binding.scale.options.get().resolved
  const sign = config.direction === 'anticlockwise' ? -1 : 1
  for (const tick of axisTickLabels(binding, axis)) {
    const angle = config.intercept! + sign * binding.project(tick.value)
    const sin = Math.sin(angle)
    const cos = Math.cos(angle)
    const line = svgElement('line', {
      x1: centerX,
      y1: centerY,
      x2: centerX + outerRadius * sin,
      y2: centerY - outerRadius * cos,
      stroke: 'currentColor',
    })
    axisGroup.append(line)
    if (options.grid) gridLayer.append(line.cloneNode(true))
    let textAnchor = 'middle'
    if (sin > 0.15) {
      textAnchor = 'start'
    } else if (sin < -0.15) {
      textAnchor = 'end'
    }
    const label = svgElement('text', {
      x: centerX + (outerRadius + 12) * sin,
      y: centerY - (outerRadius + 12) * cos,
      'text-anchor': textAnchor,
      'dominant-baseline': 'middle',
    })
    label.textContent = tick.primary
    axisGroup.append(label)
  }
}

function renderPolarCaptions(
  axisGroup: SVGGElement,
  axes: readonly AxisHandle[],
  { centerX, centerY, outerRadius }: PolarAxisGeometry,
  fontSize: number,
) {
  for (const axis of axes) {
    const options = axis.options.get().resolved
    const caption = [options.label, options.unit && `(${options.unit})`].filter(Boolean).join(' ')
    if (!caption) continue
    const radialCaption = options.position === 'radial'
    const label = svgElement('text', {
      x: radialCaption ? centerX + outerRadius * 0.7 : centerX,
      y: radialCaption ? centerY - outerRadius * 0.7 : centerY - outerRadius - fontSize * 2,
      'text-anchor': radialCaption ? 'start' : 'middle',
      'dominant-baseline': 'middle',
      'data-axis-caption': axis.scale,
    })
    label.textContent = caption
    axisGroup.append(label)
  }
}

export function renderPolarAxes(
  axesLayer: SVGGElement,
  gridLayer: SVGGElement,
  axes: readonly AxisHandle[],
  bindings: Readonly<Record<string, ScaleBinding>>,
  regions: PlotLayout,
  theme: ThemeTokens,
) {
  axesLayer.replaceChildren()
  gridLayer.replaceChildren()
  if (axes.some((axis) => axis.options.get().resolved.style === 'classic')) {
    renderClassicPolarAxes(axesLayer, gridLayer, axes, bindings, regions)
    return
  }
  const plot = regions.plot
  const angularAxis = axes.find((axis) => axis.options.get().resolved.position === 'angular')
  const radialAxis = axes.find((axis) => axis.options.get().resolved.position === 'radial')
  const angularBinding = angularAxis ? bindings[angularAxis.scale] : undefined
  const radialBinding = radialAxis ? bindings[radialAxis.scale] : undefined
  const geometry: PolarAxisGeometry = {
    centerX: plot.x + plot.width / 2,
    centerY: plot.y + plot.height / 2,
    outerRadius: radialBinding?.range.get()[1] ?? Math.min(plot.width, plot.height) / 2,
  }
  const axisGroup = svgElement('g', {
    'data-coordinate-system': 'polar',
    fill: 'currentColor',
  })
  axesLayer.append(axisGroup)

  if (radialAxis && radialBinding) {
    renderRadialAxis(axisGroup, gridLayer, radialAxis, radialBinding, geometry)
  } else {
    axisGroup.append(
      svgElement('circle', {
        cx: geometry.centerX,
        cy: geometry.centerY,
        r: geometry.outerRadius,
        fill: 'none',
        stroke: 'currentColor',
      }),
    )
  }
  if (angularAxis && angularBinding) {
    renderAngularAxis(axisGroup, gridLayer, angularAxis, angularBinding, geometry)
  }
  renderPolarCaptions(axisGroup, axes, geometry, theme.fontSize)
  axisGroup.setAttribute('font-size', String(theme.fontSize))
}

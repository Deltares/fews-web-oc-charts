import type { AxisHandle } from './axis.js'
import type { PlotLayout } from '../layout/layout.js'
import type { ScaleBinding, ScaleValue } from '../scales/scale.js'
import type { ThemeTokens } from '../theme/theme.js'
import { formatZonedTickLabels } from '../time/zoned-time.js'

export const svgNamespace = 'http://www.w3.org/2000/svg'

export function svgElement<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const element = document.createElementNS(svgNamespace, tag)
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value))
  return element
}

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
  const plot = regions.plot
  axes.forEach((axis, index) => {
    const options = axis.options.get().resolved
    const binding = bindings[axis.scale]
    const ticks = axisTickLabels(binding, axis)
    const band = regions.axes[index]
    const horizontal = options.position === 'top' || options.position === 'bottom'
    const sign = options.position === 'top' || options.position === 'left' ? -1 : 1
    const horizontalBaseline = options.position === 'top' ? band.y + band.height : band.y
    const verticalBaseline = options.position === 'left' ? band.x + band.width : band.x
    const baseline = horizontal ? horizontalBaseline : verticalBaseline
    let textAnchor = 'middle'
    let dominantBaseline = 'middle'
    if (horizontal) {
      dominantBaseline = sign > 0 ? 'hanging' : 'auto'
    } else {
      textAnchor = sign < 0 ? 'end' : 'start'
    }
    const group = svgElement('g', {
      'data-scale': axis.scale,
      'data-position': options.position,
      fill: 'currentColor',
    })
    group.append(
      svgElement('line', {
        x1: horizontal ? plot.x : baseline,
        x2: horizontal ? plot.x + plot.width : baseline,
        y1: horizontal ? baseline : plot.y,
        y2: horizontal ? baseline : plot.y + plot.height,
        stroke: 'currentColor',
      }),
    )
    for (const tick of ticks) {
      const { value, primary, secondary } = tick
      const pixel = binding.project(value) + binding.bandwidth / 2
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
      const label = svgElement('text', {
        x: labelX,
        y: labelY,
        'text-anchor': textAnchor,
        'dominant-baseline': dominantBaseline,
      })
      if (options.labelAngle)
        label.setAttribute('transform', `rotate(${options.labelAngle} ${labelX} ${labelY})`)
      label.textContent = primary
      group.append(label)
      if (secondary) {
        const context = svgElement('text', {
          x: labelX,
          y: labelY + sign * theme.fontSize,
          'text-anchor': textAnchor,
          'dominant-baseline': dominantBaseline,
          'data-tick-context': '',
        })
        if (options.labelAngle)
          context.setAttribute(
            'transform',
            `rotate(${options.labelAngle} ${labelX} ${labelY + sign * theme.fontSize})`,
          )
        context.textContent = secondary
        group.append(context)
      }
      if (options.grid) {
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
    }
    const caption = [options.label, options.unit && `(${options.unit})`].filter(Boolean).join(' ')
    if (caption) {
      const xOffset = sign < 0 ? theme.fontSize : band.width - theme.fontSize
      const yOffset = sign > 0 ? band.height - theme.fontSize : theme.fontSize
      const x = horizontal ? plot.x + plot.width / 2 : band.x + xOffset
      const y = horizontal ? band.y + yOffset : plot.y + plot.height / 2
      const label = svgElement('text', {
        x,
        y,
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
      })
      if (!horizontal) label.setAttribute('transform', `rotate(-90 ${x} ${y})`)
      label.textContent = caption
      group.append(label)
    }
    axesLayer.append(group)
  })
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
  const plot = regions.plot
  const centerX = plot.x + plot.width / 2
  const centerY = plot.y + plot.height / 2
  const radius = Math.min(plot.width, plot.height) / 2
  const angularAxis = axes.find((axis) => axis.options.get().resolved.position === 'angular')
  const radialAxis = axes.find((axis) => axis.options.get().resolved.position === 'radial')
  const angularBinding = angularAxis ? bindings[angularAxis.scale] : undefined
  const radialBinding = radialAxis ? bindings[radialAxis.scale] : undefined
  const outerRadius = radialBinding?.range.get()[1] ?? radius
  const axisGroup = svgElement('g', {
    'data-coordinate-system': 'polar',
    fill: 'currentColor',
  })
  axesLayer.append(axisGroup)

  if (radialAxis && radialBinding) {
    for (const tick of axisTickLabels(radialBinding, radialAxis)) {
      const r = radialBinding.project(tick.value)
      const circle = svgElement('circle', {
        cx: centerX,
        cy: centerY,
        r,
        fill: 'none',
        stroke: 'currentColor',
      })
      axisGroup.append(circle)
      if (radialAxis.options.get().resolved.grid) {
        gridLayer.append(
          svgElement('circle', {
            cx: centerX,
            cy: centerY,
            r,
            fill: 'none',
            stroke: 'currentColor',
          }),
        )
      }
      const label = svgElement('text', {
        x: centerX + 4,
        y: centerY - r - 3,
        'text-anchor': 'start',
      })
      label.textContent = tick.primary
      axisGroup.append(label)
    }
  } else {
    axisGroup.append(
      svgElement('circle', {
        cx: centerX,
        cy: centerY,
        r: outerRadius,
        fill: 'none',
        stroke: 'currentColor',
      }),
    )
  }

  if (angularAxis && angularBinding) {
    const config = angularBinding.scale.options.get().resolved
    const sign = config.direction === 'anticlockwise' ? -1 : 1
    for (const tick of axisTickLabels(angularBinding, angularAxis)) {
      const angle = config.intercept! + sign * angularBinding.project(tick.value)
      const x = centerX + outerRadius * Math.sin(angle)
      const y = centerY - outerRadius * Math.cos(angle)
      const line = svgElement('line', {
        x1: centerX,
        y1: centerY,
        x2: x,
        y2: y,
        stroke: 'currentColor',
      })
      axisGroup.append(line)
      if (angularAxis.options.get().resolved.grid) gridLayer.append(line.cloneNode(true))
      let textAnchor = 'middle'
      if (Math.sin(angle) > 0.15) {
        textAnchor = 'start'
      } else if (Math.sin(angle) < -0.15) {
        textAnchor = 'end'
      }
      const label = svgElement('text', {
        x: centerX + (outerRadius + 12) * Math.sin(angle),
        y: centerY - (outerRadius + 12) * Math.cos(angle),
        'text-anchor': textAnchor,
        'dominant-baseline': 'middle',
      })
      label.textContent = tick.primary
      axisGroup.append(label)
    }
  }

  for (const axis of axes) {
    const options = axis.options.get().resolved
    const caption = [options.label, options.unit && `(${options.unit})`].filter(Boolean).join(' ')
    if (!caption) continue
    const radialCaption = options.position === 'radial'
    const label = svgElement('text', {
      x: radialCaption ? centerX + outerRadius * 0.7 : centerX,
      y: radialCaption ? centerY - outerRadius * 0.7 : centerY - outerRadius - theme.fontSize * 2,
      'text-anchor': radialCaption ? 'start' : 'middle',
      'dominant-baseline': 'middle',
      'data-axis-caption': axis.scale,
    })
    label.textContent = caption
    axisGroup.append(label)
  }
  axisGroup.setAttribute('font-size', String(theme.fontSize))
}

import type { AxisHandle } from './axis.js'
import type { PlotLayout } from '../layout/layout.js'
import type { ScaleBinding, ScaleValue } from '../scales/scale.js'
import type { ThemeTokens } from '../theme/theme.js'

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
    const formatter = new Intl.DateTimeFormat(config.locale, {
      timeZone: config.timeZone,
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
    const format = tickFormatter(binding, axis)
    const band = regions.axes[index]
    const horizontal = options.position === 'top' || options.position === 'bottom'
    const sign = options.position === 'top' || options.position === 'left' ? -1 : 1
    const baseline = horizontal
      ? options.position === 'top'
        ? band.y + band.height
        : band.y
      : options.position === 'left'
        ? band.x + band.width
        : band.x
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
    for (const value of binding.ticks(options.tickCount)) {
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
        'text-anchor': horizontal ? 'middle' : sign < 0 ? 'end' : 'start',
        'dominant-baseline': horizontal ? (sign > 0 ? 'hanging' : 'auto') : 'middle',
      })
      if (options.labelAngle)
        label.setAttribute('transform', `rotate(${options.labelAngle} ${labelX} ${labelY})`)
      label.textContent = format(value)
      group.append(label)
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
      const x = horizontal
        ? plot.x + plot.width / 2
        : band.x + (sign < 0 ? theme.fontSize : band.width - theme.fontSize)
      const y = horizontal
        ? band.y + (sign > 0 ? band.height - theme.fontSize : theme.fontSize)
        : plot.y + plot.height / 2
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

import {
  axisBottom,
  axisLeft,
  axisRight,
  axisTop,
  formatLocale,
  scaleLinear,
  scaleBand,
  scaleUtc,
  precisionFixed,
  tickStep,
  select,
} from 'd3'
import type { AxisHandle } from './axis.js'
import type { ScaleBinding, ScaleValue } from '../../scales/scale.js'
import type { PlotLayout } from '../../layout/layout.js'
import { zoneOffset, zonedParts } from '../../time/zoned-time.js'
import { svgElement } from '../rendering/svg.js'
import { textAnchorForAngle } from '../../Utils/textAnchorForAngle.js'
import { AxisOrientation } from '../../Axis/axisOrientation.js'

const numbers = formatLocale({
  decimal: '.',
  thousands: '\u2009',
  grouping: [3],
  currency: ['$', ''],
})

function timeLabel(value: number, timeZone: string, locale: string): string {
  const parts = zonedParts(timeZone, value)
  const pad = (value: number) => String(value).padStart(2, '0')
  if (value % 1000) return `.${String(((value % 1000) + 1000) % 1000).padStart(3, '0')}`
  if (parts.second) return `:${pad(parts.second)}`
  if (parts.hour || parts.minute) return `${pad(parts.hour)}:${pad(parts.minute)}`
  const format = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { timeZone, ...options }).format(value)
  if (parts.day !== 1) {
    const weekday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay()
    return `${format(weekday ? { weekday: 'short' } : { month: 'short' })} ${pad(parts.day)}`
  }
  return format(parts.month !== 1 ? { month: 'long' } : { year: 'numeric' })
}

export function renderClassicAxis(
  group: SVGGElement,
  gridLayer: SVGGElement,
  handle: AxisHandle,
  binding: ScaleBinding,
  regions: PlotLayout,
  bindings: Readonly<Record<string, ScaleBinding>>,
) {
  const options = handle.options.get().resolved
  const { position } = options
  if (position === 'angular' || position === 'radial') {
    throw new Error('Classic axes currently support cartesian positions only.')
  }
  const horizontal = position === 'bottom' || position === 'top'
  const plot = regions.plot
  const config = binding.scale.options.get().resolved
  const domain = binding.scale.domain.get()
  const range = binding.range.get().map((pixel) => pixel - (horizontal ? plot.x : plot.y))
  if (config.reverse) range.reverse()
  const numeric = scaleLinear().domain(domain.map(Number)).range(range)
  const categorical = scaleBand<ScaleValue>()
    .domain([...domain])
    .range(range)
    .paddingInner(config.paddingInner ?? config.padding)
    .paddingOuter(config.paddingOuter ?? config.padding)
  const scale = Object.assign(
    (value: ScaleValue) => {
      const pixel = binding.scale.kind === 'band' ? categorical(value) : numeric(Number(value))
      if (pixel === undefined) throw new Error(`Cannot project classic axis tick "${value}".`)
      return pixel
    },
    {
      domain: () => [...domain],
      range: () => [...range],
      copy: () => scale,
      ...(binding.scale.kind === 'band'
        ? { bandwidth: () => binding.bandwidth, round: () => false }
        : {}),
    },
  )
  const factory = { bottom: axisBottom, top: axisTop, left: axisLeft, right: axisRight }[position]
  const ticks = options.tickCount
  const renderer = factory(scale)
  if (binding.scale.kind === 'band') {
    renderer.tickValues([...domain])
  } else if (binding.scale.kind === 'time') {
    const timeZone = options.timeZone ?? config.timeZone
    const locale = options.locale ?? config.locale
    const offsetDomain = domain.map(
      (value) => new Date(Number(value) + zoneOffset(timeZone, Number(value)) * 60_000),
    )
    const values = scaleUtc()
      .domain(offsetDomain)
      .ticks(ticks)
      .map((value) => +value - zoneOffset(timeZone, +value) * 60_000)
    renderer
      .tickValues(values)
      .tickFormat((value) => options.format?.(+value) ?? timeLabel(+value, timeZone, locale))
  } else {
    renderer.tickValues(numeric.ticks(ticks))
    if (binding.scale.kind === 'degrees') renderer.tickValues(binding.ticks(ticks).map(Number))
    renderer.tickFormat((value) => options.format?.(value) ?? numbers.format('~g')(Number(value)))
    if (!options.format && binding.scale.kind !== 'degrees') {
      const precision = precisionFixed(tickStep(Number(domain[0]), Number(domain[1]), ticks))
      renderer.tickFormat((value) => numbers.format(`,.${precision}f`)(Number(value)))
    }
  }
  const local = svgElement('g', {
    transform: `translate(${plot.x},${plot.y})`,
    'font-size': '1em',
  })
  const axisGroup = svgElement('g', { 'data-axis-ticks': '' })
  local.append(axisGroup)
  group.append(local)
  // The domain scale is local so d3's half-pixel alignment and path rounding
  // are independent of the plot's outer margins.
  select(axisGroup).call(renderer)
  axisGroup.setAttribute('font-size', '1em')
  axisGroup.setAttribute('font-family', 'inherit')
  let baseline = position === 'right' ? plot.width : position === 'bottom' ? plot.height : 0
  if (options.crossAt) {
    const crossed = bindings[options.crossAt.scale]
    const crossedOptions = crossed.scale.options.get().resolved
    const crossedRange = horizontal ? [plot.height, 0] : [0, plot.width]
    if (crossed.scale.options.get().resolved.reverse) crossedRange.reverse()
    const crossedDomain = crossed.scale.domain.get()
    baseline =
      crossed.scale.kind === 'band'
        ? scaleBand<ScaleValue>()
            .domain([...crossedDomain])
            .range(crossedRange)
            .paddingInner(crossedOptions.paddingInner ?? crossedOptions.padding)
            .paddingOuter(crossedOptions.paddingOuter ?? crossedOptions.padding)(
            options.crossAt.value,
          )!
        : scaleLinear().domain(crossedDomain.map(Number)).range(crossedRange)(
            Number(options.crossAt.value),
          )
  }
  axisGroup.setAttribute(
    'transform',
    `translate(${horizontal ? 0 : baseline},${horizontal ? baseline : 0})`,
  )
  if (options.labelAngle) {
    for (const label of axisGroup.querySelectorAll('text')) {
      if (options.labelAngle === 180) {
        label.setAttribute('transform', 'rotate(180)')
      } else {
        for (const name of ['x', 'y', 'dx', 'dy']) label.removeAttribute(name)
        const orientation = {
          bottom: AxisOrientation.Bottom,
          top: AxisOrientation.Top,
          left: AxisOrientation.Left,
          right: AxisOrientation.Right,
        }[position]
        label.setAttribute('text-anchor', textAnchorForAngle(options.labelAngle, orientation))
        label.setAttribute('dominant-baseline', 'middle')
        const offset = position === 'top' || position === 'left' ? -15 : 15
        label.setAttribute(
          'transform',
          `translate(${horizontal ? 0 : offset},${horizontal ? offset : 0}) rotate(${options.labelAngle})`,
        )
      }
    }
  }
  if (options.grid) {
    const grid = svgElement('g', {
      transform: `translate(${plot.x},${plot.y})`,
      fill: 'none',
      'stroke-dasharray': '2',
      stroke: 'var(--fews-chart-grid, white)',
    })
    const gridRenderer = horizontal
      ? axisBottom(renderer.scale()).tickSize(plot.height)
      : axisRight(renderer.scale()).tickSize(plot.width)
    gridRenderer.ticks(ticks)
    const values = renderer.tickValues()
    if (values) gridRenderer.tickValues(values)
    select(grid).call(gridRenderer)
    grid.querySelectorAll('text').forEach((text) => text.remove())
    for (const tick of select(grid).selectAll<SVGGElement, unknown>('.tick').nodes()) {
      select(tick).select('line').attr('stroke', 'inherit')
      if (select(tick).datum() === 0) {
        tick.setAttribute('stroke-dasharray', 'none')
        tick.setAttribute('stroke', 'var(--fews-chart-foreground, black)')
      }
    }
    grid.querySelector('.domain')?.setAttribute('stroke', 'currentColor')
    gridLayer.append(grid)
  }
  const caption = (text: string, x: number, y: number, anchor: string) => {
    const label = svgElement('text', {
      x,
      y,
      fill: 'currentColor',
      'text-anchor': anchor,
    })
    label.textContent = text
    local.append(label)
  }
  if (options.label) {
    caption(
      options.label,
      horizontal ? plot.width / 2 : position === 'right' ? plot.width : 0,
      horizontal ? plot.height + 30 : -9,
      horizontal ? 'middle' : position === 'right' ? 'end' : 'start',
    )
  }
  if (options.unit) {
    caption(
      options.unit,
      horizontal || position === 'right' ? plot.width + 10 : -9,
      horizontal ? (position === 'bottom' ? plot.height + 9 : -9) : -9,
      horizontal || position === 'right' ? 'start' : 'end',
    )
  }
}

import { axisBottom, axisLeft, axisRight, axisTop } from 'd3-axis'
import { precisionFixed, formatLocale } from 'd3-format'
import { scaleLinear, scaleBand, scaleUtc } from 'd3-scale'
import { tickStep } from 'd3-array'
import { select } from 'd3-selection'
import type { AxisHandle, AxisOptions } from './axis.js'
import type { ScaleBinding, ScaleOptions, ScaleValue } from '../../scales/scale.js'
import type { PlotLayout } from '../../layout/layout.js'
import { zoneOffset, zonedParts } from '../../time/zoned-time.js'
import { svgElement } from '../rendering/svg.js'
import { applyFont, type FontTokens, type ThemeTokens } from '../../theme/theme.js'
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

type Side = 'top' | 'right' | 'bottom' | 'left'
type Plot = PlotLayout['plot']
type Options = Readonly<AxisOptions>
type Caption = { readonly text: string; readonly font: FontTokens }

const factories = { bottom: axisBottom, top: axisTop, left: axisLeft, right: axisRight }
const orientations = {
  bottom: AxisOrientation.Bottom,
  top: AxisOrientation.Top,
  left: AxisOrientation.Left,
  right: AxisOrientation.Right,
}

function localBandScale(domain: readonly ScaleValue[], range: number[], options: ScaleOptions) {
  return scaleBand<ScaleValue>()
    .domain([...domain])
    .range(range)
    .paddingInner(options.paddingInner ?? options.padding)
    .paddingOuter(options.paddingOuter ?? options.padding)
}

/**
 * A d3-compatible scale in plot-local pixels, so d3's half-pixel alignment and path
 * rounding are independent of the plot's outer margins.
 */
function localScale(binding: ScaleBinding, horizontal: boolean, plot: Plot) {
  const config = binding.scale.options.get().resolved
  const domain = binding.scale.domain.get()
  const offset = horizontal ? plot.x : plot.y
  const range = binding.range.get().map((pixel) => pixel - offset)
  if (config.reverse) range.reverse()
  const band = binding.scale.kind === 'band'
  const numeric = scaleLinear().domain(domain.map(Number)).range(range)
  const categorical = localBandScale(domain, range, config)
  const project = (value: ScaleValue) => (band ? categorical(value) : numeric(Number(value)))
  const scale = Object.assign(
    (value: ScaleValue) => {
      const pixel = project(value)
      if (pixel === undefined) throw new Error(`Cannot project classic axis tick "${value}".`)
      return pixel
    },
    {
      domain: () => [...domain],
      range: () => [...range],
      copy: () => scale,
      ...(band ? { bandwidth: () => binding.bandwidth, round: () => false } : {}),
    },
  )
  return { scale, numeric }
}

type ClassicRenderer = ReturnType<typeof factories.bottom<ScaleValue>>

function timeTicks(renderer: ClassicRenderer, binding: ScaleBinding, options: Options) {
  const config = binding.scale.options.get().resolved
  const timeZone = options.timeZone ?? config.timeZone
  const locale = options.locale ?? config.locale
  const offsetDomain = binding.scale.domain
    .get()
    .map((value) => new Date(Number(value) + zoneOffset(timeZone, Number(value)) * 60_000))
  const values = scaleUtc()
    .domain(offsetDomain)
    .ticks(options.tickCount)
    .map((value) => +value - zoneOffset(timeZone, +value) * 60_000)
  renderer
    .tickValues(values)
    .tickFormat((value) => options.format?.(+value) ?? timeLabel(+value, timeZone, locale))
}

function numericTicks(
  renderer: ClassicRenderer,
  binding: ScaleBinding,
  options: Options,
  numeric: ReturnType<typeof scaleLinear<number>>,
) {
  const ticks = options.tickCount
  const degrees = binding.scale.kind === 'degrees'
  renderer.tickValues(degrees ? binding.ticks(ticks).map(Number) : numeric.ticks(ticks))
  renderer.tickFormat((value) => options.format?.(value) ?? numbers.format('~g')(Number(value)))
  if (!options.format && !degrees) {
    const domain = binding.scale.domain.get()
    const precision = precisionFixed(tickStep(Number(domain[0]), Number(domain[1]), ticks))
    renderer.tickFormat((value) => numbers.format(`,.${precision}f`)(Number(value)))
  }
}

function configureTicks(
  renderer: ClassicRenderer,
  binding: ScaleBinding,
  options: Options,
  numeric: ReturnType<typeof scaleLinear<number>>,
) {
  if (binding.scale.kind === 'band') renderer.tickValues([...binding.scale.domain.get()])
  else if (binding.scale.kind === 'time') timeTicks(renderer, binding, options)
  else numericTicks(renderer, binding, options, numeric)
}

/** Plot-local pixel where the axis crosses the other scale at `crossAt.value`. */
function crossedPixel(
  crossAt: NonNullable<AxisOptions['crossAt']>,
  horizontal: boolean,
  plot: Plot,
  bindings: Readonly<Record<string, ScaleBinding>>,
) {
  const crossed = bindings[crossAt.scale]
  const crossedOptions = crossed.scale.options.get().resolved
  const crossedRange = horizontal ? [plot.height, 0] : [0, plot.width]
  if (crossedOptions.reverse) crossedRange.reverse()
  const crossedDomain = crossed.scale.domain.get()
  if (crossed.scale.kind === 'band') {
    return localBandScale(crossedDomain, crossedRange, crossedOptions)(crossAt.value)!
  }
  return scaleLinear().domain(crossedDomain.map(Number)).range(crossedRange)(Number(crossAt.value))
}

function axisBaseline(
  options: Options,
  position: Side,
  plot: Plot,
  bindings: Readonly<Record<string, ScaleBinding>>,
) {
  const horizontal = position === 'bottom' || position === 'top'
  if (options.crossAt) return crossedPixel(options.crossAt, horizontal, plot, bindings)
  if (position === 'right') return plot.width
  if (position === 'bottom') return plot.height
  return 0
}

function rotateLabel(label: SVGTextElement, angle: number, position: Side) {
  if (angle === 180) {
    label.setAttribute('transform', 'rotate(180)')
    return
  }
  for (const name of ['x', 'y', 'dx', 'dy']) label.removeAttribute(name)
  label.setAttribute('text-anchor', textAnchorForAngle(angle, orientations[position]))
  label.setAttribute('dominant-baseline', 'middle')
  const offset = position === 'top' || position === 'left' ? -15 : 15
  const shift = position === 'bottom' || position === 'top' ? `0,${offset}` : `${offset},0`
  label.setAttribute('transform', `translate(${shift}) rotate(${angle})`)
}

/** Solid ticks inherit the grid colour; the zero line keeps the foreground, solid. */
function styleGridTicks(grid: SVGGElement) {
  grid.querySelectorAll('text').forEach((text) => text.remove())
  for (const tick of select(grid).selectAll<SVGGElement, unknown>('.tick').nodes()) {
    select(tick).select('line').attr('stroke', 'inherit')
    if (select(tick).datum() === 0) {
      tick.setAttribute('stroke-dasharray', 'none')
      tick.setAttribute('stroke', 'currentColor')
    }
  }
  const frame = grid.querySelector('.domain')
  frame?.setAttribute('stroke', 'inherit')
  frame?.setAttribute('stroke-dasharray', 'none')
}

function renderClassicGrid(
  gridLayer: SVGGElement,
  renderer: ClassicRenderer,
  options: Options,
  horizontal: boolean,
  plot: Plot,
) {
  // Gridlines and frame are solid hairlines that inherit the grid layer's
  // `var(--fews-chart-grid, theme.grid)` stroke; dashing is opt-in.
  const grid = svgElement('g', {
    transform: `translate(${plot.x},${plot.y})`,
    fill: 'none',
    stroke: 'inherit',
    ...(options.gridDasharray ? { 'stroke-dasharray': options.gridDasharray } : {}),
  })
  const gridRenderer = horizontal
    ? axisBottom(renderer.scale()).tickSize(plot.height)
    : axisRight(renderer.scale()).tickSize(plot.width)
  gridRenderer.ticks(options.tickCount)
  const values = renderer.tickValues()
  if (values) gridRenderer.tickValues(values)
  select(grid).call(gridRenderer)
  styleGridTicks(grid)
  gridLayer.append(grid)
}

function appendCaption(
  local: SVGGElement,
  caption: { readonly text: string; readonly font: FontTokens },
  x: number,
  y: number,
  anchor: string,
) {
  const label = svgElement('text', { x, y, fill: 'currentColor', 'text-anchor': anchor })
  label.textContent = caption.text
  applyFont(label, caption.font)
  local.append(label)
}

/** The label sits centred below a horizontal axis, or above the end of a vertical one. */
function renderLabel(local: SVGGElement, label: Caption, position: Side, plot: Plot) {
  if (position === 'bottom' || position === 'top') {
    appendCaption(local, label, plot.width / 2, plot.height + 30, 'middle')
  } else if (position === 'right') {
    appendCaption(local, label, plot.width, -9, 'end')
  } else {
    appendCaption(local, label, 0, -9, 'start')
  }
}

/** The unit sits past the right end of a horizontal or right axis, else above the left axis. */
function renderUnit(local: SVGGElement, unit: Caption, position: Side, plot: Plot) {
  if (position === 'left') appendCaption(local, unit, -9, -9, 'end')
  else
    appendCaption(
      local,
      unit,
      plot.width + 10,
      position === 'bottom' ? plot.height + 9 : -9,
      'start',
    )
}

export function renderClassicAxis(
  group: SVGGElement,
  gridLayer: SVGGElement,
  handle: AxisHandle,
  binding: ScaleBinding,
  regions: PlotLayout,
  bindings: Readonly<Record<string, ScaleBinding>>,
  theme: ThemeTokens,
) {
  const options = handle.options.get().resolved
  const { position } = options
  if (position === 'angular' || position === 'radial') {
    throw new Error('Classic axes currently support cartesian positions only.')
  }
  const horizontal = position === 'bottom' || position === 'top'
  const plot = regions.plot
  const { scale, numeric } = localScale(binding, horizontal, plot)
  const renderer = factories[position](scale)
  configureTicks(renderer, binding, options, numeric)
  const local = svgElement('g', {
    transform: `translate(${plot.x},${plot.y})`,
    'font-size': '1em',
  })
  const axisGroup = svgElement('g', { 'data-axis-ticks': '' })
  local.append(axisGroup)
  group.append(local)
  select(axisGroup).call(renderer)
  applyFont(axisGroup, theme.fonts.tick)
  const baseline = axisBaseline(options, position, plot, bindings)
  axisGroup.setAttribute(
    'transform',
    horizontal ? `translate(0,${baseline})` : `translate(${baseline},0)`,
  )
  if (options.labelAngle) {
    for (const label of axisGroup.querySelectorAll('text')) {
      rotateLabel(label, options.labelAngle, position)
    }
  }
  if (options.grid) renderClassicGrid(gridLayer, renderer, options, horizontal, plot)
  const font = theme.fonts.axisLabel
  if (options.label) renderLabel(local, { text: options.label, font }, position, plot)
  if (options.unit) renderUnit(local, { text: options.unit, font }, position, plot)
}

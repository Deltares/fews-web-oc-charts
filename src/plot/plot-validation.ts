import { validateKeys, finiteNonnegative } from '../core/validation.js'
import { isScaleHandle } from '../scales/scale.js'
import { isAxisHandle, type AxisHandle, type AxisOptions, type AxisSide } from './axis.js'
import { coordinateAdapter } from './coordinate-system.js'
import type { CoordinateSystem, MarkValidationContext, Orientation } from './mark-definition.js'
import { findMarkDefinition, supportedMarks, type PlotMark } from './marks.js'
import { validatePlugins } from './plugins.js'
import type { PlotConfig, PlotOptions } from './create-plot.js'

const optionKeys = [
  'skewT',
  'clipMarks',
  'autoMargins',
  'axisLayout',
  'background',
  'width',
  'height',
  'title',
  'margins',
  'theme',
  'themeElement',
  'scales',
  'directions',
  'axes',
  'marks',
  'plugins',
]
export const marginKeys = ['top', 'right', 'bottom', 'left'] as const

export function validatePatch(config: PlotConfig) {
  validateKeys(config, optionKeys, 'plot')
  if (config.margins) validateKeys(config.margins, marginKeys, 'plot.margins')
}

export function direction(
  options: PlotOptions,
  name: string,
  candidate?: AxisHandle,
  position?: AxisSide,
  coordinateSystem: CoordinateSystem = 'cartesian',
): Orientation {
  return coordinateAdapter(coordinateSystem).direction(options, name, candidate, position)
}

function validatePlotAppearance(options: PlotOptions) {
  if (typeof options.clipMarks !== 'boolean') throw new Error('plot.clipMarks must be boolean.')
  if (typeof options.autoMargins !== 'boolean') throw new Error('plot.autoMargins must be boolean.')
  if (!['outside', 'inset'].includes(options.axisLayout)) {
    throw new Error('plot.axisLayout must be outside or inset.')
  }
  if (!['chart', 'plot'].includes(options.background)) {
    throw new Error('plot.background must be chart or plot.')
  }
  for (const dimension of ['width', 'height'] as const) {
    if (options[dimension] !== undefined) finiteNonnegative(options[dimension], `plot.${dimension}`)
  }
  if (typeof options.title !== 'string') throw new Error('plot.title must be a string.')
  if (!['auto', 'light', 'dark'].includes(options.theme))
    throw new Error('plot.theme must be auto, light or dark.')
  if (options.themeElement !== undefined && !(options.themeElement instanceof Element)) {
    throw new Error('plot.themeElement must be an Element.')
  }
  if (!options.margins || typeof options.margins !== 'object')
    throw new Error('plot.margins must be an object.')
  for (const side of marginKeys) finiteNonnegative(options.margins[side], `plot.margins.${side}`)
}

function validatePlotCollections(
  options: PlotOptions,
  coordinateSystem: CoordinateSystem = 'cartesian',
) {
  if (!Array.isArray(options.axes)) throw new Error('plot.axes must be an array.')
  if (!Array.isArray(options.marks)) throw new Error('plot.marks must be an array.')
  if (!Array.isArray(options.plugins)) throw new Error('plot.plugins must be an array.')
  for (const key of ['scales', 'directions'] as const) {
    const value = options[key]
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`plot.${key} must be a named map.`)
    }
  }
  validatePlugins(options.plugins, {
    coordinateSystem,
    plugins: options.plugins,
    marks: options.marks,
    scales: options.scales,
    direction: (name) => direction(options, name, undefined, undefined, coordinateSystem),
  })
}

function validateAxisPosition(position: AxisSide, coordinateSystem: CoordinateSystem) {
  if (coordinateSystem !== 'polar' && (position === 'angular' || position === 'radial')) {
    throw new Error('Cartesian plots require top, right, bottom or left axes.')
  }
  if (coordinateSystem === 'polar' && position !== 'angular' && position !== 'radial') {
    throw new Error('Polar plots require angular or radial axes.')
  }
}

function validatePlotAxes(options: PlotOptions, coordinateSystem: CoordinateSystem) {
  const ids = new Set<string>()
  const axes = new Set<AxisHandle>()
  for (const axis of options.axes) {
    if (!axis || !isAxisHandle(axis)) throw new Error('plot.axes requires axis handles.')
    const position = axis.options.get().resolved.position
    validateAxisPosition(position, coordinateSystem)
    validateAxisAppearance(axis.options.get().resolved, axis.scale, options, coordinateSystem)
    if (axes.has(axis)) throw new Error('Duplicate axis handle in plot.axes.')
    axes.add(axis)
    const id = axis.options.get().resolved.id
    if (id && ids.has(id)) throw new Error(`Duplicate axis id "${id}".`)
    if (id) ids.add(id)
    if (!Object.hasOwn(options.scales, axis.scale))
      throw new Error(`plot.axes references missing scale "${axis.scale}".`)
  }
  if (coordinateSystem === 'polar') {
    validateClassicPolarAxes(options.axes.map((axis) => axis.options.get().resolved))
  }
}

export function validateClassicPolarAxes(axes: readonly Readonly<AxisOptions>[]) {
  if (
    axes.some((axis) => axis.style === 'classic') &&
    (axes.length !== 2 || axes.some((axis) => axis.style !== 'classic'))
  ) {
    throw new Error('Classic polar plots require both angular and radial classic axes.')
  }
}

export function validateAxisAppearance(
  axis: Readonly<AxisOptions>,
  scale: string,
  options: PlotOptions,
  coordinateSystem: CoordinateSystem,
) {
  if (coordinateSystem === 'skewT' && (axis.crossAt || axis.style !== 'default')) {
    throw new Error('Skew-T plots require default axes without axis crossings.')
  }
  if (coordinateSystem === 'polar' && axis.crossAt) {
    throw new Error('Crossing axes require cartesian plots.')
  }
  if (!axis.crossAt) return
  const crossed = options.scales[axis.crossAt.scale]
  if (!crossed) throw new Error(`axis.crossAt references missing scale "${axis.crossAt.scale}".`)
  if (
    axis.crossAt.scale === scale ||
    direction(options, axis.crossAt.scale) ===
      (axis.position === 'top' || axis.position === 'bottom' ? 'x' : 'y')
  ) {
    throw new Error('axis.crossAt must reference a perpendicular scale.')
  }
  if ((crossed.kind === 'band') !== (typeof axis.crossAt.value === 'string')) {
    throw new Error('axis.crossAt.value must match the crossing scale kind.')
  }
}
function validatePlotScales(options: PlotOptions, coordinateSystem: CoordinateSystem) {
  for (const [name, scale] of Object.entries(options.scales)) {
    if (!name || !scale || !isScaleHandle(scale))
      throw new Error(`plot.scales.${name} requires a scale handle.`)
    direction(options, name, undefined, undefined, coordinateSystem)
  }
}

export function markValidationContext(
  options: PlotOptions,
  coordinateSystem: CoordinateSystem,
): MarkValidationContext {
  return {
    coordinateSystem,
    scales: options.scales,
    direction: (name) => direction(options, name, undefined, undefined, coordinateSystem),
  }
}

function validatePlotMarks(options: PlotOptions, coordinateSystem: CoordinateSystem) {
  const context = markValidationContext(options, coordinateSystem)
  const markIds = new Set<string>()
  const marks = new Set<PlotMark>()
  for (const mark of options.marks) {
    const definition = findMarkDefinition(mark)
    if (!definition) throw new Error(`plot.marks accepts ${supportedMarks} marks only.`)
    if (coordinateSystem === 'skewT' && definition.name !== 'line') {
      throw new Error('Skew-T plots currently support line() marks only, including markers.')
    }
    definition.validate(mark, context)
    if (marks.has(mark)) throw new Error('Duplicate mark handle in plot.marks.')
    marks.add(mark)
    if (mark.id && markIds.has(mark.id)) throw new Error(`Duplicate mark id "${mark.id}".`)
    if (mark.id) markIds.add(mark.id)
  }
}

function validatePlotDirections(options: PlotOptions, coordinateSystem: CoordinateSystem) {
  coordinateAdapter(coordinateSystem).validateScales(options)
  for (const [name, value] of Object.entries(options.directions)) {
    if (!Object.hasOwn(options.scales, name))
      throw new Error(`plot.directions.${name} references a missing scale.`)
    if (value !== 'x' && value !== 'y') throw new Error(`plot.directions.${name} must be x or y.`)
  }
}

function validateSkewTOptions(options: PlotOptions, coordinateSystem: CoordinateSystem) {
  if (coordinateSystem !== 'skewT') {
    if (options.skewT !== undefined) throw new Error('plot.skewT requires createSkewTPlot().')
    return
  }
  if (!options.skewT) throw new Error('Skew-T plots require skewT options.')
  validateKeys(options.skewT, ['skew'], 'plot.skewT')
  if (!Number.isFinite(options.skewT.skew) || options.skewT.skew < 0) {
    throw new Error('plot.skewT.skew must be finite and nonnegative.')
  }
  if (options.axisLayout !== 'outside') {
    throw new Error('Skew-T plots currently require outside axes.')
  }
}

export function validatePlotOptions(options: PlotOptions, coordinateSystem: CoordinateSystem) {
  validateSkewTOptions(options, coordinateSystem)
  validatePlotAppearance(options)
  validatePlotCollections(options, coordinateSystem)
  validatePlotAxes(options, coordinateSystem)
  validatePlotScales(options, coordinateSystem)
  validatePlotMarks(options, coordinateSystem)
  validatePlotDirections(options, coordinateSystem)
}

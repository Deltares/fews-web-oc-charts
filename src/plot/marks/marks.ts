import type { BandMark } from './band/band.js'
import type { BarMark } from './bar/bar.js'
import type { EnsembleMark } from './ensemble/ensemble.js'
import type { HeatmapMark } from './heatmap/heatmap.js'
import type { HistogramMark } from './histogram/histogram.js'
import type { LineMark } from './line/line.js'
import type { SeriesMark } from './line/series.js'
import type { MarkDefinition } from './mark-definition.js'
import type { ProgressMark } from './progress/progress.js'
import type { RuleMark } from './rule/rule.js'
import type { StackedAreaMark } from './stacked-area/stacked-area.js'
import type { TextMark } from './text/text.js'
import type { ArrowsMark } from './vector/arrows.js'
import type { DirectionMark } from './vector/direction.js'

export type PlotMark =
  | LineMark
  | SeriesMark
  | BandMark
  | BarMark
  | HistogramMark
  | HeatmapMark
  | StackedAreaMark
  | EnsembleMark
  | RuleMark
  | TextMark
  | ArrowsMark
  | DirectionMark
  | ProgressMark

const markNames = [
  'line',
  'series',
  'band',
  'bar',
  'histogram',
  'heatmap',
  'stackedArea',
  'ensemble',
  'rule',
  'text',
  'arrows',
  'direction',
  'progress',
]

const names = markNames.map((name) => `${name}()`)
export const supportedMarks = `${names.slice(0, -1).join(', ')} or ${names.at(-1)}`

/**
 * Definitions are attached to handles by the public mark factories, so a plot bundles
 * only the mark kinds an application creates.
 */
const definitions = new WeakMap<object, MarkDefinition<PlotMark>>()

/** Makes a mark handle plottable; called by each public mark factory. */
export function registerMark<M extends PlotMark>(mark: M, definition: MarkDefinition<M>): M {
  definitions.set(mark, definition)
  return mark
}

export function findMarkDefinition(value: unknown): MarkDefinition<PlotMark> | undefined {
  if (!value || typeof value !== 'object') return undefined
  return definitions.get(value)
}

export function isPlotMark(value: object): value is PlotMark {
  return findMarkDefinition(value) !== undefined
}

export function markDefinition(mark: PlotMark): MarkDefinition<PlotMark> {
  const definition = findMarkDefinition(mark)
  if (!definition) throw new Error(`plot.marks accepts ${supportedMarks} marks only.`)
  return definition
}

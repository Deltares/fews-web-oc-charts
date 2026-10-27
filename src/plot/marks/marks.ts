import { bandDefinition } from './band/band-mark.js'
import { barDefinition } from './bar/bar-mark.js'
import { ensembleDefinition } from './ensemble/ensemble-mark.js'
import { arrowsDefinition, directionDefinition } from './vector/vector-mark.js'
import { histogramDefinition } from './histogram/histogram-mark.js'
import { heatmapDefinition } from './heatmap/heatmap-mark.js'
import { lineDefinition, seriesDefinition } from './line/line-mark.js'
import type { MarkDefinition } from './mark-definition.js'
import { progressDefinition } from './progress/progress-mark.js'
import { ruleDefinition } from './rule/rule-mark.js'
import { stackedAreaDefinition } from './stacked-area/stacked-area-mark.js'
import { textDefinition } from './text/text-mark.js'

/** Registering a definition here is all that is needed to make a mark kind plottable. */
const markDefinitions = [
  lineDefinition,
  seriesDefinition,
  bandDefinition,
  barDefinition,
  histogramDefinition,
  heatmapDefinition,
  stackedAreaDefinition,
  ensembleDefinition,
  ruleDefinition,
  textDefinition,
  arrowsDefinition,
  directionDefinition,
  progressDefinition,
] as const

type MarkOf<D> = D extends MarkDefinition<infer M> ? M : never

export type PlotMark = MarkOf<(typeof markDefinitions)[number]>

const names = markDefinitions.map(({ name }) => `${name}()`)
export const supportedMarks = `${names.slice(0, -1).join(', ')} or ${names.at(-1)}`

export function findMarkDefinition(value: unknown): MarkDefinition<PlotMark> | undefined {
  if (!value || typeof value !== 'object') return undefined
  return markDefinitions.find((definition) => definition.is(value))
}

export function isPlotMark(value: object): value is PlotMark {
  return findMarkDefinition(value) !== undefined
}

export function markDefinition(mark: PlotMark): MarkDefinition<PlotMark> {
  const definition = findMarkDefinition(mark)
  if (!definition) throw new Error(`plot.marks accepts ${supportedMarks} marks only.`)
  return definition
}

import { createOptionState, type OptionPatch, type OptionStateSnapshot } from '../core/options.js'
import type { ReadonlySignal } from '../core/reactive.js'
import { optionSignal } from '../core/runtime.js'
import { validateKeys } from '../core/validation.js'
import { isSeriesStore, type SeriesStore } from '../data-store/series.js'
import { line, type LineAreaOptions, type LineMarkerOptions, type LineMark } from './line.js'

export interface SeriesLineOptions {
  stroke?: string
  width?: number
}

export interface SeriesMarkerOptions extends LineMarkerOptions {
  symbol?: 'circle'
}

export interface SeriesOptions {
  id?: string
  x: string
  y: string
  label: string
  visible: boolean
  line: false | SeriesLineOptions
  markers: false | SeriesMarkerOptions
  area: false | LineAreaOptions
}

export interface SeriesMark extends Omit<LineMark, 'xValues' | 'yValues'> {
  readonly data: SeriesStore<unknown>
  readonly options: ReadonlySignal<OptionStateSnapshot<SeriesOptions>>
  readonly visible: boolean
  update(patch: OptionPatch<SeriesOptions>): void
}

const handles = new WeakSet<object>()
const validators = new WeakMap<SeriesMark, Set<(candidate: LineMark) => void>>()
export const isSeriesMark = (value: object): value is SeriesMark => handles.has(value)

export function validateSeriesUpdates(mark: SeriesMark, validate: (candidate: LineMark) => void) {
  const consumers = validators.get(mark)
  if (!consumers) throw new Error('Expected a series handle.')
  consumers.add(validate)
  return () => {
    consumers.delete(validate)
  }
}

function visual(options: Readonly<SeriesOptions>): LineMark {
  if (typeof options.visible !== 'boolean') throw new TypeError('series.visible must be boolean.')
  if (typeof options.label !== 'string') throw new TypeError('series.label must be a string.')
  if (options.line !== false) {
    if (!options.line || typeof options.line !== 'object' || Array.isArray(options.line))
      throw new TypeError('series.line must be false or options.')
    validateKeys(options.line, ['stroke', 'width'], 'series.line')
  }
  if (options.markers !== false) {
    if (!options.markers || typeof options.markers !== 'object' || Array.isArray(options.markers))
      throw new TypeError('series.markers must be false or options.')
    validateKeys(
      options.markers,
      ['symbol', 'size', 'fill', 'stroke', 'strokeWidth'],
      'series.markers',
    )
    if (options.markers.symbol !== undefined && options.markers.symbol !== 'circle') {
      throw new Error('series.markers.symbol currently supports circle only.')
    }
  }
  const markers =
    options.markers === false
      ? false
      : {
          size: options.markers.size,
          fill: options.markers.fill,
          stroke: options.markers.stroke,
          strokeWidth: options.markers.strokeWidth,
        }
  return line({
    id: options.id,
    x: options.x,
    y: options.y,
    xValues: [],
    yValues: [],
    line: options.line !== false,
    stroke: options.line === false ? undefined : options.line.stroke,
    strokeWidth: options.line === false ? undefined : options.line.width,
    markers,
    area: options.area === false ? undefined : options.area,
  })
}

export function series(
  data: SeriesStore<unknown>,
  initial: OptionPatch<SeriesOptions>,
): SeriesMark {
  if (!data || !isSeriesStore(data))
    throw new TypeError('series requires a createSeries/fromObjects store.')
  const keys = ['id', 'x', 'y', 'label', 'visible', 'line', 'markers', 'area']
  validateKeys(initial, keys, 'series')
  const consumers = new Set<(candidate: LineMark) => void>()
  const state = createOptionState<SeriesOptions>(initial, {
    defaults: () => ({
      x: '',
      y: '',
      label: '',
      visible: true,
      line: {},
      markers: false,
      area: false,
    }),
    validate(options) {
      const candidate = visual(options)
      for (const validate of consumers) validate(candidate)
    },
  })
  const optionState = optionSignal(state)
  let rendered = visual(state.getSnapshot().resolved)
  const mark: SeriesMark = {
    data,
    options: optionState.snapshot,
    get id() {
      return rendered.id
    },
    get x() {
      return rendered.x
    },
    get y() {
      return rendered.y
    },
    get stroke() {
      return rendered.stroke
    },
    get strokeWidth() {
      return rendered.strokeWidth
    },
    get line() {
      return rendered.line
    },
    get markers() {
      return rendered.markers
    },
    get area() {
      return rendered.area
    },
    get visible() {
      return state.getSnapshot().resolved.visible
    },
    update(patch) {
      validateKeys(patch, keys, 'series')
      if (Object.hasOwn(patch, 'id') && patch.id !== rendered.id) {
        throw new Error('series.id is immutable; replace the series handle instead.')
      }
      if (state.update(patch)) {
        rendered = visual(state.getSnapshot().resolved)
        optionState.publish()
      }
    },
  }
  handles.add(mark)
  validators.set(mark, consumers)
  return Object.freeze(mark)
}

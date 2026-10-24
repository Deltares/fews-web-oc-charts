import { barDefinition, createBarRenderer } from '../bar/bar-mark.js'
import {
  histogramBar,
  isHistogramMark,
  validateHistogramUpdates,
  type HistogramMark,
} from './histogram.js'
import type { MarkDefinition, MarkLegend } from '../mark-definition.js'
import { compositeHits } from '../../interaction/composite-hit-testing.js'
import { barHighlight } from '../highlight-shapes.js'

export const histogramDefinition: MarkDefinition<HistogramMark> = {
  name: 'histogram',
  is: isHistogramMark,
  hits: (mark, { scales, point, axis, plot }) =>
    compositeHits(histogramBar(mark), scales, point, axis, plot),
  highlight: (mark, hit, { scales, color }) => barHighlight(histogramBar(mark), hit, scales, color),
  legend(mark, tokens): MarkLegend {
    const options = () => mark.options.get().resolved
    return {
      label: options().label,
      symbol: { type: 'bar', fill: options().fill ?? tokens.accent, opacity: options().opacity },
      visible: () => options().visible,
      setVisible: (visible) => mark.update({ visible }),
    }
  },
  validate(mark, context) {
    if (context.coordinateSystem !== 'cartesian')
      throw new Error('histogram() supports cartesian plots only.')
    const sample = context.scales[mark.options.get().resolved.scales.x]
    if (!sample || (sample.kind !== 'linear' && sample.kind !== 'time'))
      throw new Error('histogram requires a linear or time sample scale.')
    barDefinition.validate(histogramBar(mark), context)
  },
  extents(mark, context) {
    barDefinition.extents(histogramBar(mark), context)
  },
  createRenderer() {
    const renderer = createBarRenderer('histogram')
    return {
      mount: (layer, mark) => renderer.mount(layer, histogramBar(mark)),
      geometry: (mark, context) => renderer.geometry(histogramBar(mark), context),
      style: (mark, tokens) => renderer.style(histogramBar(mark), tokens),
      destroy: () => renderer.destroy(),
    }
  },
  track(mark) {
    mark.options.get()
    const _version = mark.data.version
  },
  validateUpdates: (mark, context) =>
    validateHistogramUpdates(mark, (candidate) => barDefinition.validate(candidate, context())),
}

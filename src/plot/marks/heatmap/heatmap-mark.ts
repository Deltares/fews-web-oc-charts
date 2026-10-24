import { validateGridUpdates, type GridView } from '../../../data-store/grid.js'
import type { ScaleHandle } from '../../../scales/scale.js'
import { isHeatmapMark, type HeatmapMark } from './heatmap.js'
import { heatmapHit } from '../../interaction/heatmap-hit-testing.js'
import { heatmapHighlight } from '../highlight-shapes.js'
import {
  createKeyCache,
  extentWindow,
  scaleKey,
  setMarkId,
  type MarkDefinition,
  type MarkRenderer,
} from '../mark-definition.js'
import { svgElement } from '../../axes/render-axes.js'
import {
  clearCompositeCanvas,
  renderCompositeCanvas,
  styleCompositeCanvas,
  type CanvasShape,
} from '../../rendering/render-composite-canvas.js'

function validateEdges(
  view: GridView,
  mark: HeatmapMark,
  scales: Readonly<Record<string, ScaleHandle>>,
) {
  for (const coordinate of ['x', 'y'] as const) {
    if (
      scales[mark[coordinate]].kind === 'time' &&
      view[coordinate === 'x' ? 'xEdges' : 'yEdges'].some((edge) => Math.abs(edge) > 8.64e15)
    )
      throw new Error('Heatmap time edges must be within the JavaScript Date range.')
  }
}

function createHeatmapRenderer(): MarkRenderer<HeatmapMark> {
  const group = svgElement('g', { 'data-mark': 'heatmap' })
  const geometryKey = createKeyCache()
  const styleKey = createKeyCache()
  let indices: number[] = []
  return {
    mount(layer, mark) {
      setMarkId(group, mark.id)
      layer.append(group)
    },
    geometry(mark, context) {
      const options = mark.options.get().resolved
      const grid = mark.data.snapshot()
      const x = context.scales[mark.x]
      const y = context.scales[mark.y]
      if (
        !geometryKey.changed([
          mark,
          grid,
          options.visible,
          options.renderer,
          ...(options.renderer === 'canvas'
            ? [window.devicePixelRatio, context.plot.width, context.plot.height]
            : []),
          ...scaleKey(x),
          ...scaleKey(y),
        ])
      )
        return
      styleKey.clear()
      clearCompositeCanvas(group)
      indices = []
      const shapes: CanvasShape[] = []
      const nodes: SVGRectElement[] = []
      if (options.visible) {
        for (let row = 0; row < grid.rows; row++) {
          for (let column = 0; column < grid.columns; column++) {
            const index = row * grid.columns + column
            const x0 = x.project(grid.xEdges[column])
            const x1 = x.project(grid.xEdges[column + 1])
            const y0 = y.project(grid.yEdges[row])
            const y1 = y.project(grid.yEdges[row + 1])
            const left = Math.min(x0, x1)
            const top = Math.min(y0, y1)
            const width = Math.abs(x1 - x0)
            const height = Math.abs(y1 - y0)
            if (![left, top, width, height].every(Number.isFinite))
              throw new Error('Heatmap cell geometry must be finite.')
            if (
              left + width < context.plot.x ||
              left > context.plot.x + context.plot.width ||
              top + height < context.plot.y ||
              top > context.plot.y + context.plot.height
            )
              continue
            indices.push(index)
            if (options.renderer === 'canvas') {
              const path = new Path2D()
              path.rect(left, top, width, height)
              shapes.push({ layerId: String(index), path })
            } else {
              nodes.push(
                svgElement('rect', {
                  'data-mark': 'heatmap-cell',
                  'data-index': String(index),
                  x: left,
                  y: top,
                  width,
                  height,
                  stroke: 'none',
                }),
              )
            }
          }
        }
      }
      if (options.renderer === 'canvas') renderCompositeCanvas(group, shapes)
      else group.replaceChildren(...nodes)
    },
    style(mark, tokens) {
      const options = mark.options.get().resolved
      const color = options.color
      if (!styleKey.changed([mark, mark.options.version, color, color.options.version, tokens]))
        return
      const grid = mark.data.snapshot()
      if (options.renderer === 'canvas') {
        const styles = new Map(
          indices.map((index) => [
            String(index),
            { fill: color.map(grid.valueAt(index)), opacity: options.opacity },
          ]),
        )
        styleCompositeCanvas(group, styles, {}, tokens.accent)
      } else {
        indices.forEach((index, node) => {
          group.children[node].setAttribute('fill', color.map(grid.valueAt(index)))
          group.children[node].setAttribute('fill-opacity', String(options.opacity))
        })
      }
    },
    destroy() {
      clearCompositeCanvas(group)
      group.remove()
    },
  }
}

export const heatmapDefinition: MarkDefinition<HeatmapMark> = {
  name: 'heatmap',
  is: isHeatmapMark,
  hits(mark, { scales, point, axis, plot }) {
    const hit = heatmapHit(mark, scales, point, axis, plot)
    return hit ? [hit] : []
  },
  highlight: (mark, hit, { scales }) => heatmapHighlight(mark, hit, scales),
  legend(mark) {
    const options = () => mark.options.get().resolved
    const { label, color, opacity } = options()
    if (label === undefined) return undefined
    const [low, high] = color.options.get().resolved.domain
    return {
      label,
      symbol: { type: 'steps', fill: color.map((low + high) / 2), opacity },
      visible: () => options().visible,
      setVisible: (visible) => mark.update({ visible }),
    }
  },
  validate(mark, { coordinateSystem, scales, direction }) {
    if (coordinateSystem !== 'cartesian')
      throw new Error('heatmap() supports cartesian plots only.')
    for (const coordinate of ['x', 'y'] as const) {
      const scale = scales[mark[coordinate]]
      if (!scale || !['linear', 'time'].includes(scale.kind))
        throw new Error(`heatmap requires a linear or time ${coordinate} scale.`)
      if (direction(mark[coordinate]) !== coordinate)
        throw new Error(`heatmap requires a ${coordinate}-direction scale.`)
    }
    validateEdges(mark.data.snapshot(), mark, scales)
  },
  extents(mark, context) {
    if (!mark.options.get().resolved.visible) return
    const coordinate = context.scale === mark.x ? 'x' : context.scale === mark.y ? 'y' : undefined
    if (!coordinate) return
    const grid = mark.data.snapshot()
    if (!grid.columns || !grid.rows) return
    const opposite = coordinate === 'x' ? 'y' : 'x'
    const window = extentWindow(context, mark[opposite])
    const otherEdges = grid[opposite === 'x' ? 'xEdges' : 'yEdges']
    if (window && (otherEdges.at(-1)! < Number(window[0]) || otherEdges[0] > Number(window[1])))
      return
    const edges = grid[coordinate === 'x' ? 'xEdges' : 'yEdges']
    context.add(edges[0])
    context.add(edges.at(-1)!)
  },
  track(mark) {
    mark.data.snapshot()
    mark.options.get().resolved.color.options.get()
  },
  validateUpdates: (mark, context) =>
    validateGridUpdates(mark.data, (view) => validateEdges(view, mark, context().scales)),
  createRenderer: createHeatmapRenderer,
}

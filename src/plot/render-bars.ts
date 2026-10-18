import type { ScaleBinding } from '../scales/scale.js'
import { barLayers, type BarMark } from './bar.js'
import { barRectangles } from './bar-geometry.js'
import { svgElement } from './render-axes.js'
import {
  clearCompositeCanvas,
  renderCompositeCanvas,
  styleCompositeCanvas,
} from './render-composite-canvas.js'

export function renderBars(
  group: SVGGElement,
  mark: BarMark,
  scales: Readonly<Record<string, ScaleBinding>>,
) {
  const rectangles = barRectangles(mark, scales)
  group.querySelectorAll('[data-mark="bar-label"]').forEach((node) => node.remove())
  if (mark.options.get().resolved.renderer === 'canvas') {
    renderCompositeCanvas(
      group,
      rectangles.map((rectangle) => {
        const path = new Path2D()
        path.rect(rectangle.x, rectangle.y, rectangle.width, rectangle.height)
        return { layerId: rectangle.layerId, path }
      }),
    )
    renderBarLabels(group, mark, rectangles)
    return
  }
  clearCompositeCanvas(group)
  const existing = new Map(
    Array.from(group.children, (node) => [node.getAttribute('data-key')!, node]),
  )
  for (const rectangle of rectangles) {
    const key = JSON.stringify([rectangle.layerId, rectangle.sampleId])
    let node = existing.get(key)
    if (!node) node = svgElement('rect', { 'data-mark': 'bar-segment', 'data-key': key })
    existing.delete(key)
    node.setAttribute('data-layer-id', rectangle.layerId)
    node.setAttribute('data-sample-id', String(rectangle.sampleId))
    for (const property of ['x', 'y', 'width', 'height'] as const) {
      node.setAttribute(property, String(rectangle[property]))
    }
    group.append(node)
  }
  for (const node of existing.values()) node.remove()
  renderBarLabels(group, mark, rectangles)
}

function renderBarLabels(
  group: SVGGElement,
  mark: BarMark,
  rectangles: ReturnType<typeof barRectangles>,
) {
  const options = mark.options.get().resolved
  if (!options.text) return
  const layers = new Map(barLayers(options).map((layer) => [layer.id, layer]))
  for (const rectangle of rectangles) {
    const layer = layers.get(rectangle.layerId)!
    const value = Number(mark.data.valueAt(layer.y, rectangle.row))
    const text = options.text.format(value, layer.id, rectangle.row)
    if (typeof text !== 'string') throw new Error('bar.text.format must return a string.')
    const horizontal = options.orientation === 'horizontal'
    const label = svgElement('text', {
      'data-mark': 'bar-label',
      x: horizontal ? rectangle.x + rectangle.width : rectangle.x + rectangle.width / 2,
      y: horizontal ? rectangle.y + rectangle.height / 2 : rectangle.y,
      dx: options.text.dx ?? 0,
      dy: options.text.dy ?? 0,
      'text-anchor': horizontal ? 'start' : 'middle',
      fill: options.text.fill ?? 'currentColor',
    })
    label.textContent = text
    group.append(label)
  }
}

export function styleBars(group: SVGGElement, mark: BarMark, accent: string) {
  const options = mark.options.get().resolved
  const layers = new Map(barLayers(options).map((layer) => [layer.id, layer]))
  if (styleCompositeCanvas(group, layers, options, accent)) return
  for (const node of group.children) {
    if (node.getAttribute('data-mark') === 'bar-label') continue
    const layer = layers.get(node.getAttribute('data-layer-id')!)
    if (!layer) throw new Error('Missing bar layer for rendered segment.')
    node.setAttribute('fill', layer.fill ?? options.fill ?? `var(--fews-chart-accent, ${accent})`)
    node.setAttribute('fill-opacity', String(layer.opacity ?? options.opacity))
    node.setAttribute('stroke', layer.stroke ?? options.stroke ?? 'none')
    node.setAttribute('stroke-width', String(layer.strokeWidth ?? options.strokeWidth))
  }
}

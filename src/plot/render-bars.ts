import type { ScaleBinding } from '../scales/scale.js'
import { barLayers, type BarMark } from './bar.js'
import { barRectangles } from './bar-geometry.js'
import { svgElement } from './render-axes.js'

export function renderBars(
  group: SVGGElement,
  mark: BarMark,
  scales: Readonly<Record<string, ScaleBinding>>,
) {
  const existing = new Map(
    Array.from(group.children, (node) => [node.getAttribute('data-key')!, node]),
  )
  for (const rectangle of barRectangles(mark, scales)) {
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
}

export function styleBars(group: SVGGElement, mark: BarMark, accent: string) {
  const options = mark.options.get().resolved
  const layers = new Map(barLayers(options).map((layer) => [layer.id, layer]))
  for (const node of group.children) {
    const layer = layers.get(node.getAttribute('data-layer-id')!)
    if (!layer) throw new Error('Missing bar layer for rendered segment.')
    node.setAttribute('fill', layer.fill ?? options.fill ?? `var(--fews-chart-accent, ${accent})`)
    node.setAttribute('fill-opacity', String(layer.opacity ?? options.opacity))
    node.setAttribute('stroke', layer.stroke ?? options.stroke ?? 'none')
    node.setAttribute('stroke-width', String(layer.strokeWidth ?? options.strokeWidth))
  }
}

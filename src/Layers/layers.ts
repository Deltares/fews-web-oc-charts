import * as d3 from 'd3'

export const Layers = {
  canvas: undefined,
  grid: undefined,
  axis: undefined,
  labels: undefined,
  charts: undefined,
  front: undefined,
  mouse: undefined,
} as const

export type LayerKeys = keyof typeof Layers

export type LayerSelection = d3.Selection<SVGGElement, unknown, null, unknown>
export type LayerMap = Record<LayerKeys, LayerSelection>

export function createLayers(element: d3.Selection<SVGGElement, unknown, null, unknown>): LayerMap {
  const result: LayerMap = {} as LayerMap
  for (const key of Object.keys(Layers) as LayerKeys[]) {
    result[key] = element.append('g').attr('class', key)
  }
  return result
}

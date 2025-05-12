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

export function createLayers(element, width, height) {
  const result: Record<LayerKeys, any> = { ...Layers }
  for (const key in Layers) {
    result[key] = element.append('g').attr('class', key)
  }
  return result
}

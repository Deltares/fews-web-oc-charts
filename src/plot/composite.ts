import { validateKeys } from '../core/validation.js'
import type { StackLayer } from '../layout/stack.js'

export interface CompositeStyle {
  readonly fill?: string
  readonly opacity?: number
  readonly stroke?: string
  readonly strokeWidth?: number
}

export interface CompositeLayer extends StackLayer, CompositeStyle {
  readonly label?: string
}

export function validateCompositeStyle(style: CompositeStyle, name: string) {
  for (const key of ['fill', 'stroke'] as const) {
    if (style[key] !== undefined && (typeof style[key] !== 'string' || !style[key]))
      throw new Error(`${name}.${key} must be a non-empty string.`)
  }
  if (
    style.opacity !== undefined &&
    (!Number.isFinite(style.opacity) || style.opacity < 0 || style.opacity > 1)
  )
    throw new RangeError(`${name}.opacity must be in [0, 1].`)
  if (
    style.strokeWidth !== undefined &&
    (!Number.isFinite(style.strokeWidth) || style.strokeWidth < 0)
  )
    throw new RangeError(`${name}.strokeWidth must be nonnegative.`)
}

export function validateCompositeLayers(layers: readonly CompositeLayer[], name: string) {
  for (const layer of layers) {
    validateKeys(
      layer,
      ['id', 'y', 'stack', 'visible', 'label', 'fill', 'opacity', 'stroke', 'strokeWidth'],
      `${name}.layers`,
    )
    if (layer.visible !== undefined && typeof layer.visible !== 'boolean')
      throw new Error('Layer visible must be boolean.')
    if (layer.label !== undefined && typeof layer.label !== 'string')
      throw new Error('Layer label must be a string.')
    validateCompositeStyle(layer, name)
  }
}

export function retainLayerVisibility<T extends CompositeLayer>(
  layers: readonly T[],
  previous: readonly CompositeLayer[] | undefined,
): readonly T[] {
  const visibility = new Map(previous?.map((layer) => [layer.id, layer.visible]))
  return layers.map((layer) => {
    const visible = visibility.get(layer.id)
    return !Object.hasOwn(layer, 'visible') && visible !== undefined ? { ...layer, visible } : layer
  })
}

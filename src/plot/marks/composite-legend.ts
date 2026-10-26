import type { CompositeLayer, CompositeStyle } from './composite.js'
import type { MarkLegend } from './mark-definition.js'
import { resolveCompositeStyle } from './mark-styles.js'
import type { ThemeTokens } from '../../theme/theme.js'

interface LegendOptions extends CompositeStyle {
  readonly label: string
  readonly legendGroup?: string
  readonly visible: boolean
}

export function compositeLegend<L extends CompositeLayer>(
  type: 'bar' | 'area',
  options: () => LegendOptions,
  layers: () => readonly L[],
  update: (visible: boolean, layers: readonly L[]) => void,
  tokens: ThemeTokens,
): MarkLegend {
  const symbol = (layer: L) => ({
    type,
    ...resolveCompositeStyle(layer, options(), tokens),
  })
  const current = layers()
  return {
    label: options().label,
    group: options().legendGroup,
    symbol: current.length ? symbol(current[0]) : { type: 'group' },
    visible: () => options().visible,
    setVisible: (visible) =>
      update(
        visible,
        layers().map((layer) => ({ ...layer, visible })),
      ),
    layers: current.map((layer) => ({
      id: layer.id,
      label: layer.label,
      stack: layer.stack,
      symbol: symbol(layer),
      visible: () => layers().find(({ id }) => id === layer.id)?.visible !== false,
      setVisible: (visible) => {
        // Showing one layer of a hidden mark must not bring back its other layers.
        const markVisible = options().visible
        update(
          true,
          layers().map((candidate) =>
            candidate.id === layer.id
              ? { ...candidate, visible }
              : markVisible
                ? candidate
                : { ...candidate, visible: false },
          ),
        )
      },
    })),
  }
}

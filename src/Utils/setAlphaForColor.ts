import { color } from 'd3'

/**
 * Sets the alpha value for a given color supporting alpha channels.
 * @param color - The color to modify.
 * @param alpha - The alpha value to set (between 0 and 1).
 * @returns The modified color with the specified alpha value.
 */
export function setAlphaForColor(cssColor: string, alpha: number) {
  const colorWithAlpha = color(cssColor)
  if (cssColor.startsWith('rgba')) {
    if (colorWithAlpha) {
      colorWithAlpha.opacity = alpha
      return colorWithAlpha.formatRgb()
    }
  }
  if (cssColor.startsWith('hsla')) {
    if (colorWithAlpha) {
      colorWithAlpha.opacity = alpha
      return colorWithAlpha.formatHsl()
    }
  }
  if (cssColor.startsWith('#') && cssColor.length === 9) {
    return (
      cssColor.slice(0, -2) +
      Math.round(255 * alpha)
        .toString(16)
        .toUpperCase()
    )
  }
  return cssColor
}

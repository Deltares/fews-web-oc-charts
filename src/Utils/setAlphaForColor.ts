/**
 * Sets the alpha value for a given color supporting alpha channels.
 * @param color - The color to modify.
 * @param alpha - The alpha value to set (between 0 and 1).
 * @returns The modified color with the specified alpha value.
 */
export function setAlphaForColor(color: string, alpha: number) {
  if (color.startsWith('rgba') || color.startsWith('hsla')) {
    // eslint-disable-next-line no-useless-escape
    return color.replace(/[\d\.]+\)/, `${alpha})`)
  }
  if (color.startsWith('#') && color.length === 9) {
    return (
      color.slice(0, -2) +
      Math.round(255 * alpha)
        .toString(16)
        .toUpperCase()
    )
  }
  return color
}

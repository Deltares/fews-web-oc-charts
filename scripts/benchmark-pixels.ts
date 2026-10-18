export function changedPixelRatio(
  reference: Uint8ClampedArray,
  actual: Uint8ClampedArray,
  channelThreshold = 2,
): number {
  if (reference.length !== actual.length || reference.length === 0 || reference.length % 4 !== 0) {
    throw new RangeError('Pixel buffers must have equal, nonzero RGBA lengths.')
  }
  if (!Number.isFinite(channelThreshold) || channelThreshold < 0) {
    throw new RangeError('The channel threshold must be finite and nonnegative.')
  }
  let changed = 0
  for (let channel = 0; channel < reference.length; channel += 4) {
    if (
      Math.abs(reference[channel] - actual[channel]) > channelThreshold ||
      Math.abs(reference[channel + 1] - actual[channel + 1]) > channelThreshold ||
      Math.abs(reference[channel + 2] - actual[channel + 2]) > channelThreshold ||
      Math.abs(reference[channel + 3] - actual[channel + 3]) > channelThreshold
    ) {
      changed += 1
    }
  }
  return changed / (reference.length / 4)
}

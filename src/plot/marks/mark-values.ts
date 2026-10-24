export function validateCoordinateValues(
  values: ArrayLike<unknown>,
  markType: string,
  name: string,
) {
  if (!values || !Number.isSafeInteger(values.length) || values.length < 0) {
    throw new Error(`${markType}.${name} must be an array-like value.`)
  }
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (
      value !== null &&
      value !== undefined &&
      !(typeof value === 'number' && !Number.isFinite(value)) &&
      typeof value !== 'number' &&
      typeof value !== 'string'
    ) {
      throw new Error(`${markType}.${name}[${index}] must be a finite number, string, or gap.`)
    }
  }
}

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

export type NumericRange = readonly [number, number]
export type NumericRangeValue = NumericRange | null | undefined

export function copyNumericRanges(
  values: ArrayLike<NumericRangeValue>,
  markType: string,
  name: string,
): readonly NumericRangeValue[] {
  if (!values || !Number.isSafeInteger(values.length) || values.length < 0) {
    throw new Error(`${markType}.${name} must be an array-like value.`)
  }
  return Object.freeze(
    Array.from({ length: values.length }, (_, index) => {
      const value = values[index]
      if (value === null || value === undefined) return value
      if (
        !value ||
        typeof value !== 'object' ||
        value.length !== 2 ||
        !Number.isFinite(value[0]) ||
        !Number.isFinite(value[1]) ||
        value[0] > value[1]
      ) {
        throw new Error(
          `${markType}.${name}[${index}] must be an ascending pair of finite numbers.`,
        )
      }
      return Object.freeze([value[0], value[1]] as const)
    }),
  )
}

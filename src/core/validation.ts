export function validateKeys(value: object, keys: readonly string[], path: string) {
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) throw new Error(`Unknown option "${path}.${key}".`)
  }
}

export function finiteNonnegative(value: number, path: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${path} must be a finite nonnegative number.`)
  }
}

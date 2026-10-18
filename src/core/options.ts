export type OptionPatch<T> = {
  [K in keyof T]?: T[K] extends readonly unknown[]
    ? T[K] | undefined
    : T[K] extends (...args: never[]) => unknown
      ? T[K] | undefined
      : T[K] extends object
        ? OptionPatch<T[K]> | undefined
        : T[K] | undefined
}

export interface OptionStateSnapshot<T extends object> {
  readonly explicit: DeepReadonly<OptionPatch<T>>
  readonly resolved: DeepReadonly<T>
}

export interface OptionState<T extends object> {
  update(patch: OptionPatch<T>): boolean
  setConfig(config: OptionPatch<T>): boolean
  getSnapshot(): OptionStateSnapshot<T>
}

export interface OptionStateOptions<T extends object> {
  defaults: () => T
  validate?: (resolved: DeepReadonly<T>) => void
  isAtomicReference?: (value: object) => boolean
}

type PlainRecord = Record<string, unknown>

export function createOptionState<T extends object>(
  initialConfig: OptionPatch<T>,
  options: OptionStateOptions<T>,
): OptionState<T> {
  const isAtomicReference = options.isAtomicReference ?? (() => false)
  let explicit = applyPatch({}, initialConfig, isAtomicReference)

  function getResolved(defaults: T, overrides: PlainRecord): T {
    return mergeRecords(
      copyPlainValue(defaults, isAtomicReference) as PlainRecord,
      overrides,
      isAtomicReference,
    ) as T
  }

  options.validate?.(
    freezePlainValue(
      getResolved(options.defaults(), explicit),
      isAtomicReference,
    ) as DeepReadonly<T>,
  )

  function update(patch: OptionPatch<T>, replace: boolean): boolean {
    const defaults = copyPlainValue(options.defaults(), isAtomicReference) as PlainRecord
    const previous = getResolved(defaults as T, explicit)
    const candidate = replace
      ? applyPatch({}, patch, isAtomicReference)
      : applyPatch(explicit, patch, isAtomicReference)
    const resolved = getResolved(defaults as T, candidate)
    options.validate?.(freezePlainValue(resolved, isAtomicReference) as DeepReadonly<T>)
    const changed = !valuesEqual(previous, resolved, isAtomicReference)
    explicit = candidate
    return changed
  }

  return {
    update(patch) {
      return update(patch, false)
    },
    setConfig(config) {
      return update(config, true)
    },
    getSnapshot() {
      const resolved = getResolved(options.defaults(), explicit)
      return {
        explicit: freezePlainValue(
          copyPlainValue(explicit, isAtomicReference),
          isAtomicReference,
        ) as DeepReadonly<OptionPatch<T>>,
        resolved: freezePlainValue(resolved, isAtomicReference) as DeepReadonly<T>,
      }
    },
  }
}

export type DeepReadonly<T> = T extends Element
  ? T
  : T extends (...args: never[]) => unknown
    ? T
    : T extends readonly unknown[]
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T extends object
        ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
        : T

function applyPatch(
  current: PlainRecord,
  patch: PlainRecord,
  isAtomicReference: (value: object) => boolean,
): PlainRecord {
  const next = copyPlainValue(current, isAtomicReference)
  for (const [key, value] of Object.entries(patch)) {
    if (isUnsafeKey(key)) throw new Error(`Unsafe option key "${key}".`)
    if (value === undefined) {
      delete next[key]
      continue
    }
    if (isPlainRecord(value, isAtomicReference)) {
      const previous = isPlainRecord(next[key], isAtomicReference) ? next[key] : {}
      const nested = applyPatch(previous, value, isAtomicReference)
      if (Object.keys(nested).length === 0) delete next[key]
      else next[key] = nested
      continue
    }
    next[key] = copyPlainValue(value, isAtomicReference)
  }
  return next
}

function mergeRecords(
  defaults: PlainRecord,
  overrides: PlainRecord,
  isAtomicReference: (value: object) => boolean,
): PlainRecord {
  const resolved = copyPlainValue(defaults, isAtomicReference)
  for (const [key, override] of Object.entries(overrides)) {
    if (
      isPlainRecord(override, isAtomicReference) &&
      isPlainRecord(resolved[key], isAtomicReference)
    ) {
      resolved[key] = mergeRecords(resolved[key], override, isAtomicReference)
    } else {
      resolved[key] = copyPlainValue(override, isAtomicReference)
    }
  }
  return resolved
}

function copyPlainValue<T>(value: T, isAtomicReference: (value: object) => boolean): T {
  return copyValue(value, isAtomicReference, new WeakSet()) as T
}

function copyValue(
  value: unknown,
  isAtomicReference: (value: object) => boolean,
  activeValues: WeakSet<object>,
): unknown {
  if (Array.isArray(value)) {
    if (activeValues.has(value)) throw new Error('Circular option values are not supported.')
    activeValues.add(value)
    const copy = value.map((item) => copyValue(item, isAtomicReference, activeValues))
    activeValues.delete(value)
    return copy
  }
  if (!isPlainRecord(value, isAtomicReference)) return value
  if (activeValues.has(value)) throw new Error('Circular option values are not supported.')
  activeValues.add(value)
  const copy: PlainRecord = Object.create(Object.getPrototypeOf(value))
  for (const [key, item] of Object.entries(value)) {
    if (isUnsafeKey(key)) throw new Error(`Unsafe option key "${key}".`)
    copy[key] = copyValue(item, isAtomicReference, activeValues)
  }
  activeValues.delete(value)
  return copy
}

function freezePlainValue<T>(value: T, isAtomicReference: (value: object) => boolean): T {
  if (Array.isArray(value)) {
    for (const item of value) freezePlainValue(item, isAtomicReference)
    return Object.freeze(value)
  }
  if (!isPlainRecord(value, isAtomicReference)) return value
  for (const item of Object.values(value)) freezePlainValue(item, isAtomicReference)
  return Object.freeze(value)
}

function valuesEqual(
  left: unknown,
  right: unknown,
  isAtomicReference: (value: object) => boolean,
): boolean {
  if (Object.is(left, right)) return true
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((value, index) => valuesEqual(value, right[index], isAtomicReference))
    )
  }
  if (!isPlainRecord(left, isAtomicReference) || !isPlainRecord(right, isAtomicReference)) {
    return false
  }
  const leftKeys = Object.keys(left)
  if (leftKeys.length !== Object.keys(right).length) return false
  return leftKeys.every(
    (key) => Object.hasOwn(right, key) && valuesEqual(left[key], right[key], isAtomicReference),
  )
}

function isPlainRecord(
  value: unknown,
  isAtomicReference: (value: object) => boolean,
): value is PlainRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  if (isAtomicReference(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function isUnsafeKey(key: string): boolean {
  return key === '__proto__' || key === 'constructor' || key === 'prototype'
}

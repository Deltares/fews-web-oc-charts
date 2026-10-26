import { batch } from './runtime.js'

type PlainRecord = Record<string, unknown>

export interface UpdatableHandle {
  update(patch: never): void
}

export type HandleFactory = (...args: never[]) => UpdatableHandle

export interface HandleCache {
  /**
   * Returns the handle cached under `key`, creating it with `factory(...args)` when absent.
   * A trailing plain-object argument holds the options: on reuse, only options that changed
   * since the previous call are passed to `handle.update`, and removed options are unset.
   * Preceding arguments and the factory identify the handle; changing them creates a new one.
   */
  use<F extends HandleFactory>(key: string, factory: F, ...args: Parameters<F>): ReturnType<F>
  /** Runs one batched configuration pass and forgets keys that it did not use. */
  collect<T>(build: () => T): T
  has(key: string): boolean
  delete(key: string): boolean
  clear(): void
  readonly size: number
}

interface Entry {
  readonly factory: HandleFactory
  readonly identity: readonly unknown[]
  readonly handle: UpdatableHandle
  options: PlainRecord
}

// Library handles, marks, stores and groups are frozen; they are compared by identity.
function isPlainRecord(value: unknown): value is PlainRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  if (Object.isFrozen(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function snapshot(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(snapshot)
  if (!isPlainRecord(value)) return value
  const copy: PlainRecord = {}
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) copy[key] = snapshot(item)
  }
  return copy
}

function equal(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((item, index) => equal(item, right[index]))
  }
  return isPlainRecord(left) && isPlainRecord(right) && diff(left, right) === undefined
}

function diff(previous: PlainRecord, next: PlainRecord): PlainRecord | undefined {
  const patch: PlainRecord = {}
  let changed = false
  for (const key of Object.keys(previous)) {
    if (next[key] === undefined) {
      patch[key] = undefined
      changed = true
    }
  }
  for (const [key, value] of Object.entries(next)) {
    if (value === undefined) continue
    const old = previous[key]
    if (old !== undefined && equal(old, value)) continue
    patch[key] = isPlainRecord(old) && isPlainRecord(value) ? diff(old, value) : value
    changed = true
  }
  return changed ? patch : undefined
}

/** Keeps handles stable across declarative configuration rebuilds, keyed by caller IDs. */
export function handleCache(): HandleCache {
  const entries = new Map<string, Entry>()
  let pass: Set<string> | undefined

  function use(key: string, factory: HandleFactory, ...args: unknown[]): UpdatableHandle {
    if (typeof key !== 'string' || key.length === 0) {
      throw new TypeError('handleCache keys must be non-empty strings.')
    }
    if (typeof factory !== 'function') throw new TypeError('handleCache requires a factory.')
    if (pass?.has(key)) throw new Error(`handleCache key "${key}" is used twice in one pass.`)
    pass?.add(key)
    const last = args.at(-1)
    const hasOptions = args.length > 0 && (last === undefined || isPlainRecord(last))
    const identity = hasOptions ? args.slice(0, -1) : args
    const options = snapshot(hasOptions ? (last ?? {}) : {}) as PlainRecord
    const entry = entries.get(key)
    if (
      entry?.factory === factory &&
      entry.identity.length === identity.length &&
      entry.identity.every((value, index) => Object.is(value, identity[index]))
    ) {
      const patch = diff(entry.options, options)
      if (patch) (entry.handle.update as (patch: PlainRecord) => void)(patch)
      entry.options = options
      return entry.handle
    }
    const handle = (factory as (...args: unknown[]) => UpdatableHandle)(...args)
    if (!handle || typeof handle.update !== 'function') {
      throw new TypeError('handleCache factories must return a handle with update().')
    }
    entries.set(key, { factory, identity, handle, options })
    return handle
  }

  return {
    use: use as HandleCache['use'],
    collect(build) {
      if (pass) throw new Error('handleCache.collect cannot be nested.')
      const used = new Set<string>()
      pass = used
      try {
        const result = batch(build)
        for (const key of entries.keys()) if (!used.has(key)) entries.delete(key)
        return result
      } finally {
        pass = undefined
      }
    },
    has: (key) => entries.has(key),
    delete: (key) => entries.delete(key),
    clear() {
      entries.clear()
    },
    get size() {
      return entries.size
    },
  }
}

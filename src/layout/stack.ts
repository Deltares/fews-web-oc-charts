import type { TableStore, TableView } from '../data-store/table.js'

export interface StackLayer {
  readonly id: string
  readonly y: string
  readonly stack?: string
  readonly visible?: boolean
}
export interface StackLayoutOptions {
  readonly x: string
  readonly layers: readonly StackLayer[]
  readonly layout: 'grouped' | 'stacked'
}
export interface StackEndpoints {
  readonly id: string
  readonly stack: string | undefined
  readonly slot: number
  lowerAt(row: number): number
  upperAt(row: number): number
  positiveAt(row: number): number
  negativeAt(row: number): number
}
export interface StackLayout {
  readonly layers: readonly StackEndpoints[]
  readonly slots: number
  readonly bytes: number
}

export function validateStackInput(data: TableView, options: StackLayoutOptions) {
  if (!data.columns.includes(options.x)) throw new Error(`Unknown x column "${options.x}".`)
  const keys = new Set<string | number>()
  let previous = -Infinity
  for (let row = 0; row < data.length; row += 1) {
    const key = data.valueAt(options.x, row)
    if (keys.has(key)) throw new Error(`Duplicate composite x key "${key}" at row ${row}.`)
    if (typeof key === 'number' && (!Number.isFinite(key) || key <= previous)) {
      throw new Error(`Composite x at row ${row} must be finite and strictly increasing.`)
    }
    keys.add(key)
    if (typeof key === 'number') previous = key
  }
  const ids = new Set<string>()
  const named = options.layers.some((layer) => layer.stack !== undefined)
  for (const layer of options.layers) {
    if (!layer.id || typeof layer.id !== 'string' || ids.has(layer.id))
      throw new Error('Composite layer IDs must be unique non-empty strings.')
    ids.add(layer.id)
    if (data.kind(layer.y) !== 'number')
      throw new Error(`Layer "${layer.id}" requires a numeric value column.`)
    if (options.layout === 'grouped' && layer.stack !== undefined)
      throw new Error('Grouped bars do not accept stack IDs.')
    if (named && (typeof layer.stack !== 'string' || !layer.stack.trim()))
      throw new Error('All layers must supply a non-empty stack ID when any stack is named.')
  }
}

/** Data-space endpoints only: usable by both rectangles and shared area boundaries. */
export function computeStackLayout(data: TableView, options: StackLayoutOptions): StackLayout {
  validateStackInput(data, options)
  const length = data.length
  const stacks = [...new Set(options.layers.map((layer) => layer.stack))]
  const groups =
    options.layout === 'grouped'
      ? options.layers.map((layer) => [layer])
      : stacks.map((stack) => options.layers.filter((layer) => layer.stack === stack))
  const endpoints = new Map<string, StackEndpoints>()
  let bytes = 0
  groups.forEach((layers, slot) => {
    const positive = new Float64Array(data.length)
    const negative = new Float64Array(data.length)
    const gap = new Uint8Array(data.length)
    bytes += positive.byteLength + negative.byteLength + gap.byteLength
    for (const layer of layers) {
      if (layer.visible === false) continue
      for (let row = 0; row < data.length; row += 1) {
        if (Number.isNaN(data.valueAt(layer.y, row))) gap[row] = 1
      }
    }
    for (const layer of layers) {
      const lower = new Float64Array(data.length).fill(NaN)
      const upper = new Float64Array(data.length).fill(NaN)
      bytes += lower.byteLength + upper.byteLength
      if (layer.visible !== false) {
        for (let row = 0; row < data.length; row += 1) {
          if (gap[row]) continue
          const value = Number(data.valueAt(layer.y, row))
          if (value < 0) {
            upper[row] = negative[row]
            lower[row] = negative[row] += value
          } else {
            lower[row] = positive[row]
            upper[row] = positive[row] += value
          }
          if (!Number.isFinite(lower[row]) || !Number.isFinite(upper[row]))
            throw new RangeError(`Stack overflow at layer "${layer.id}", row ${row}.`)
        }
      }
      function check(row: number) {
        if (!Number.isInteger(row) || row < 0 || row >= length)
          throw new RangeError(`Stack row ${row} is outside the layout.`)
      }
      endpoints.set(
        layer.id,
        Object.freeze({
          id: layer.id,
          stack: layer.stack,
          slot,
          lowerAt(row: number) {
            check(row)
            return lower[row]
          },
          upperAt(row: number) {
            check(row)
            return upper[row]
          },
          positiveAt(row: number) {
            check(row)
            return gap[row] ? NaN : positive[row]
          },
          negativeAt(row: number) {
            check(row)
            return gap[row] ? NaN : negative[row]
          },
        }),
      )
    }
  })
  return Object.freeze({
    layers: Object.freeze(options.layers.map((layer) => endpoints.get(layer.id)!)),
    slots: groups.length,
    bytes,
  })
}

const cache = new WeakMap<
  TableStore,
  { version: number; entries: Map<string, StackLayout>; bytes: number }
>()
const maxBytes = 32 * 1024 * 1024
const maxEntries = 8

export function stackLayout(data: TableStore, options: StackLayoutOptions): StackLayout {
  const version = data.version
  let current = cache.get(data)
  if (!current || current.version !== version) {
    current = { version, entries: new Map(), bytes: 0 }
    cache.set(data, current)
  }
  const key = JSON.stringify([
    options.x,
    options.layout,
    options.layers.map((layer) => [
      layer.id,
      layer.y,
      layer.stack === undefined ? [] : [layer.stack],
      layer.visible !== false,
    ]),
  ])
  const previous = current.entries.get(key)
  if (previous) {
    current.entries.delete(key)
    current.entries.set(key, previous)
    return previous
  }
  const result = computeStackLayout(data, options)
  if (result.bytes <= maxBytes) {
    while (current.entries.size >= maxEntries || current.bytes + result.bytes > maxBytes) {
      const oldest = current.entries.entries().next().value
      if (!oldest) break
      current.entries.delete(oldest[0])
      current.bytes -= oldest[1].bytes
    }
    current.entries.set(key, result)
    current.bytes += result.bytes
  }
  return result
}

import { reactive } from '../core/runtime.js'
import { validateKeys } from '../core/validation.js'

export interface GridInput {
  xEdges: ArrayLike<number>
  yEdges: ArrayLike<number>
  /** Row-major: values[row * columns + column]. NaN is a missing cell. */
  values: ArrayLike<number>
}

export interface GridView {
  readonly xEdges: readonly number[]
  readonly yEdges: readonly number[]
  readonly columns: number
  readonly rows: number
  valueAt(index: number): number
}

export interface GridStore {
  readonly version: number
  snapshot(): GridView
  replace(input: GridInput): void
}

const stores = new WeakSet<object>()
const validators = new WeakMap<GridStore, Set<(view: GridView) => void>>()
export const isGridStore = (value: object): value is GridStore => stores.has(value)

export function validateGridUpdates(store: GridStore, validate: (view: GridView) => void) {
  const entries = validators.get(store)
  if (!entries) throw new TypeError('Expected a createGrid store.')
  entries.add(validate)
  return () => entries.delete(validate)
}

function copyGrid(input: GridInput): GridView {
  if (!input || typeof input !== 'object') throw new TypeError('grid input must be an object.')
  validateKeys(input, ['xEdges', 'yEdges', 'values'], 'grid')
  function edges(source: ArrayLike<number>, name: string) {
    if (!source || !Number.isSafeInteger(source.length) || source.length < 1)
      throw new Error(`grid.${name} requires at least one edge.`)
    const result = Array.from(source)
    for (let index = 0; index < result.length; index++) {
      if (!Number.isFinite(result[index]) || (index > 0 && result[index] <= result[index - 1]))
        throw new Error(`grid.${name} must contain finite, strictly increasing edges.`)
    }
    if (!Number.isFinite(result.at(-1)! - result[0]))
      throw new Error(`grid.${name} must have a finite span.`)
    return Object.freeze(result)
  }
  const xEdges = edges(input.xEdges, 'xEdges')
  const yEdges = edges(input.yEdges, 'yEdges')
  const columns = xEdges.length - 1
  const rows = yEdges.length - 1
  if (!input.values || input.values.length !== columns * rows)
    throw new Error('grid.values length must equal columns * rows.')
  const values = new Float64Array(input.values.length)
  for (let index = 0; index < values.length; index++) {
    const value = input.values[index]
    if (typeof value !== 'number' || (!Number.isFinite(value) && !Number.isNaN(value)))
      throw new Error(`grid.values[${index}] must be finite or NaN.`)
    values[index] = value
  }
  return Object.freeze({
    xEdges,
    yEdges,
    columns,
    rows,
    valueAt(index: number) {
      if (!Number.isInteger(index) || index < 0 || index >= values.length)
        throw new RangeError('Grid cell index is out of bounds.')
      return values[index]
    },
  })
}

export function createGrid(input: GridInput): GridStore {
  const current = reactive.signal(copyGrid(input))
  const consumers = new Set<(view: GridView) => void>()
  const store: GridStore = Object.freeze({
    get version() {
      current.get()
      return current.version
    },
    snapshot: () => current.get(),
    replace(input: GridInput) {
      const next = copyGrid(input)
      for (const validate of consumers) validate(next)
      current.set(next)
    },
  })
  stores.add(store)
  validators.set(store, consumers)
  return store
}

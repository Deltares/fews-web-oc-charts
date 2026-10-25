import { reactive } from '../core/runtime.js'
import { validateKeys } from '../core/validation.js'

export type TableValue = number | string
export type TableInput = Readonly<Record<string, ArrayLike<number | string | Date>>>
export interface TableOptions {
  /** Ordered key; defaults to the first column. */
  x?: string
  maxPoints?: number
  maxAge?: number
}
export interface TableView {
  readonly columns: readonly string[]
  readonly length: number
  kind(column: string): 'number' | 'string'
  valueAt(column: string, row: number): TableValue
  sampleId(row: number): number
}
export interface TableChange {
  readonly version: number
  readonly operation: 'append' | 'prepend' | 'upsert' | 'replace' | 'clear'
  readonly previousLength: number
  readonly length: number
  readonly inputLength: number
  readonly invalidatedFrom: number
  readonly invalidatedTo: number
  readonly replaced: number
  readonly evicted: number
  readonly from: TableValue | undefined
  readonly to: TableValue | undefined
}
export interface TableStore extends TableView {
  readonly x: string
  readonly version: number
  readonly change: TableChange | undefined
  append(rows: TableInput): void
  prepend(rows: TableInput): void
  replace(rows: TableInput): void
  upsert(input: { from: number; to: number; rows: TableInput }): void
  clear(): void
}

type Column = { values: Float64Array; dictionary?: readonly string[] }
const stores = new WeakSet<object>()
const validators = new WeakMap<
  TableStore,
  Set<WeakRef<(view: TableView, appendFrom?: number) => void>>
>()
export const isTableStore = (value: object): value is TableStore => stores.has(value)

export function validateTableUpdates(
  store: TableStore,
  validate: (view: TableView, appendFrom?: number) => void,
) {
  const entries = validators.get(store)
  if (!entries) throw new TypeError('Expected a table store.')
  const entry = new WeakRef(validate)
  entries.add(entry)
  return () => entries.delete(entry)
}

export function createTable(initial: TableInput, options: TableOptions = {}): TableStore {
  validateKeys(options, ['x', 'maxPoints', 'maxAge'], 'table')
  if (!initial || typeof initial !== 'object') throw new TypeError('table requires columns.')
  const names = Object.freeze(Object.keys(initial))
  const x = options.x ?? names[0]
  if (!names.length || !names.includes(x)) throw new Error('table.x must name a column.')
  if (
    options.maxPoints !== undefined &&
    (!Number.isSafeInteger(options.maxPoints) || options.maxPoints < 1)
  ) {
    throw new RangeError('table.maxPoints must be a positive safe integer.')
  }
  if (options.maxAge !== undefined && (!Number.isFinite(options.maxAge) || options.maxAge < 0)) {
    throw new RangeError('table.maxAge must be finite and nonnegative.')
  }
  let nextId = 0
  let columns = new Map<string, Column>()
  let ids: readonly number[] = []
  let currentView: TableView
  const version = reactive.signal(0)
  let change: TableChange | undefined
  const checks = new Set<WeakRef<(view: TableView, appendFrom?: number) => void>>()

  function copy(input: TableInput): Map<string, Column> {
    if (
      !input ||
      Object.keys(input).length !== names.length ||
      names.some((name) => !Object.hasOwn(input, name))
    ) {
      throw new Error('table mutations require exactly the same columns.')
    }
    const result = new Map<string, Column>()
    let length: number | undefined
    for (const name of names) {
      const source = input[name]
      if (!source || !Number.isSafeInteger(source.length) || source.length < 0) {
        throw new TypeError(`table.${name} must be an array-like column.`)
      }
      if (length !== undefined && source.length !== length)
        throw new RangeError(`table.${name} column length differs.`)
      length = source.length
      const previous = columns.get(name)
      const categorical = source.length
        ? typeof source[0] === 'string'
        : previous?.dictionary !== undefined
      if (source.length && previous && categorical !== (previous.dictionary !== undefined)) {
        throw new TypeError(`table.${name} cannot change column kind.`)
      }
      const dictionary = categorical ? [...(previous?.dictionary ?? [])] : undefined
      const codes = new Map(dictionary?.map((value, index) => [value, index]))
      const values = new Float64Array(source.length)
      for (let row = 0; row < source.length; row += 1) {
        const raw = source[row]
        const value = raw instanceof Date ? raw.getTime() : raw
        if (dictionary) {
          if (typeof value !== 'string')
            throw new TypeError(`table.${name}[${row}] must be a string.`)
          let code = codes.get(value)
          if (code === undefined) {
            code = dictionary.length
            dictionary.push(value)
            codes.set(value, code)
          }
          values[row] = code
        } else {
          if (
            typeof value !== 'number' ||
            (!Number.isFinite(value) && !Number.isNaN(value)) ||
            (raw instanceof Date && !Number.isFinite(value))
          ) {
            throw new RangeError(`table.${name}[${row}] must be finite or NaN.`)
          }
          values[row] = value
        }
      }
      result.set(name, { values, dictionary: dictionary && Object.freeze(dictionary) })
    }
    const key = result.get(x)!
    if (key.dictionary && options.maxAge !== undefined)
      throw new Error('table.maxAge requires a numeric/time key.')
    for (let row = 0; row < key.values.length; row += 1) {
      if (
        !key.dictionary &&
        (!Number.isFinite(key.values[row]) ||
          Math.abs(key.values[row]) > 8.64e15 ||
          (row > 0 && key.values[row] < key.values[row - 1]))
      ) {
        throw new RangeError(
          `table.${x}[${row}] must be finite, ordered and within the JavaScript Date range.`,
        )
      }
    }
    return result
  }

  function view(source: Map<string, Column>, sampleIds: readonly number[]): TableView {
    function column(name: string) {
      const result = source.get(name)
      if (!result) throw new Error(`Unknown table column "${name}".`)
      return result
    }
    function check(row: number) {
      if (!Number.isInteger(row) || row < 0 || row >= sampleIds.length)
        throw new RangeError(`table row ${row} is outside the store.`)
    }
    return Object.freeze({
      columns: names,
      length: sampleIds.length,
      kind(name: string) {
        return column(name).dictionary ? 'string' : 'number'
      },
      valueAt(name: string, row: number) {
        check(row)
        const data = column(name)
        return data.dictionary ? data.dictionary[data.values[row]] : data.values[row]
      },
      sampleId(row: number) {
        check(row)
        return sampleIds[row]
      },
    })
  }

  function commit(
    candidate: Map<string, Column>,
    sampleIds: readonly number[],
    publish: boolean,
    appendFrom?: number,
  ) {
    let start = Math.max(0, sampleIds.length - (options.maxPoints ?? Infinity))
    const key = candidate.get(x)!
    if (options.maxAge !== undefined && sampleIds.length) {
      const cutoff = key.values[sampleIds.length - 1] - options.maxAge
      while (start < sampleIds.length && key.values[start] < cutoff) start += 1
    }
    const candidateView = view(candidate, sampleIds)
    for (const entry of checks) {
      const validate = entry.deref()
      if (validate) validate(candidateView, start === 0 ? appendFrom : undefined)
      else checks.delete(entry)
    }
    if (start) {
      candidate = new Map(
        [...candidate].map(([name, column]) => [
          name,
          { ...column, values: column.values.slice(start) },
        ]),
      )
      sampleIds = sampleIds.slice(start)
    }
    columns = candidate
    ids = sampleIds
    currentView = view(columns, ids)
    if (publish) version.update((value) => value + 1)
    return start
  }
  const first = copy(initial)
  commit(
    first,
    Array.from({ length: first.get(x)!.values.length }, () => nextId++),
    false,
  )

  function mutate(
    input: TableInput,
    mode: 'append' | 'prepend' | 'replace',
    bounds?: { from: number; to: number },
    operationOverride?: TableChange['operation'],
  ) {
    const incoming = copy(input)
    const count = incoming.get(x)!.values.length
    const previousLength = ids.length
    if (bounds) {
      if (
        columns.get(x)!.dictionary ||
        !Number.isFinite(bounds.from) ||
        !Number.isFinite(bounds.to) ||
        bounds.from > bounds.to
      ) {
        throw new RangeError('table.upsert requires an ordered numeric key and finite from <= to.')
      }
      for (const value of incoming.get(x)!.values) {
        if (value < bounds.from || value > bounds.to)
          throw new RangeError('table.upsert rows must lie within the closed range.')
      }
    }
    if (!count && mode !== 'replace' && !bounds) return
    const current = view(columns, ids)
    const added = view(
      incoming,
      Array.from({ length: count }, (_, row) => nextId + row),
    )
    let before = 0
    let after = ids.length
    if (bounds) {
      while (before < ids.length && Number(current.valueAt(x, before)) < bounds.from) before += 1
      after = before
      while (after < ids.length && Number(current.valueAt(x, after)) <= bounds.to) after += 1
    } else if (mode === 'append') before = ids.length
    else if (mode === 'prepend') after = 0
    const merged: Record<string, TableValue[]> = Object.create(null)
    for (const name of names) {
      merged[name] = [
        ...Array.from({ length: before }, (_, row) => current.valueAt(name, row)),
        ...Array.from({ length: count }, (_, row) => added.valueAt(name, row)),
        ...Array.from({ length: ids.length - after }, (_, row) =>
          current.valueAt(name, after + row),
        ),
      ]
    }
    const sampleIds = [
      ...ids.slice(0, before),
      ...Array.from({ length: count }, (_, row) => nextId + row),
      ...ids.slice(after),
    ]
    const appendFrom = mode === 'append' && !bounds ? previousLength : undefined
    const start = commit(copy(merged), sampleIds, false, appendFrom)
    const operation = bounds ? 'upsert' : (operationOverride ?? mode)
    const replaced = bounds ? after - before : mode === 'replace' ? previousLength : 0
    const evicted = start
    const firstCurrent = previousLength ? current.valueAt(x, 0) : undefined
    const lastCurrent = previousLength ? current.valueAt(x, previousLength - 1) : undefined
    const firstAdded = count ? added.valueAt(x, 0) : undefined
    const lastAdded = count ? added.valueAt(x, count - 1) : undefined
    change = Object.freeze({
      version: version.get() + 1,
      operation,
      previousLength,
      length: ids.length,
      inputLength: count,
      invalidatedFrom: operation === 'append' && evicted === 0 ? previousLength : 0,
      invalidatedTo: ids.length,
      replaced,
      evicted,
      from:
        bounds?.from ??
        (mode === 'append' ? (firstCurrent ?? firstAdded) : (firstAdded ?? firstCurrent)),
      to:
        bounds?.to ??
        (mode === 'prepend' ? (lastCurrent ?? lastAdded) : (lastAdded ?? lastCurrent)),
    })
    version.update((value) => value + 1)
    nextId += count
  }

  const store: TableStore = Object.freeze({
    x,
    columns: names,
    get length() {
      return ids.length
    },
    get version() {
      return version.get()
    },
    get change() {
      version.get()
      return change
    },
    kind: (name: string) => currentView.kind(name),
    valueAt: (name: string, row: number) => currentView.valueAt(name, row),
    sampleId: (row: number) => currentView.sampleId(row),
    append: (rows: TableInput) => mutate(rows, 'append'),
    prepend: (rows: TableInput) => mutate(rows, 'prepend'),
    replace: (rows: TableInput) => mutate(rows, 'replace'),
    upsert: (input: { from: number; to: number; rows: TableInput }) =>
      mutate(input.rows, 'replace', input),
    clear() {
      if (ids.length) {
        mutate(Object.fromEntries(names.map((name) => [name, []])), 'replace', undefined, 'clear')
      }
    },
  })
  stores.add(store)
  validators.set(store, checks)
  return store
}

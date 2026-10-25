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
  /** Insertion/replacement start in the previous snapshot, before retention. */
  readonly spliceFrom: number
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
const diagnostics = new WeakMap<
  TableStore,
  () => Readonly<{ capacity: number; byteLength: number; copiedRows: number; appendedRows: number }>
>()
/** Canonical buffer bytes and cumulative rows relocated/written; excludes validation and dictionaries. */
export function tableStorageDiagnostics(store: TableStore) {
  const read = diagnostics.get(store)
  if (!read) throw new TypeError('Expected a table store.')
  return read()
}
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
  const maxPoints = options.maxPoints ?? Infinity
  const maxAge = options.maxAge
  let columns = new Map<string, Column>()
  let ids = new Float64Array(1)
  let head = 0
  let length = 0
  let copiedRows = 0
  let appendedRows = 0
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
    if (key.dictionary && maxAge !== undefined)
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

  function view(
    source: Map<string, Column>,
    sampleIds: ArrayLike<number>,
    offset = 0,
    size = sampleIds.length,
  ): TableView {
    function column(name: string) {
      const result = source.get(name)
      if (!result) throw new Error(`Unknown table column "${name}".`)
      return result
    }
    function check(row: number) {
      if (!Number.isInteger(row) || row < 0 || row >= size)
        throw new RangeError(`table row ${row} is outside the store.`)
    }
    return Object.freeze({
      columns: names,
      length: size,
      kind(name: string) {
        return column(name).dictionary ? 'string' : 'number'
      },
      valueAt(name: string, row: number) {
        check(row)
        const data = column(name)
        const physical = (offset + row) % sampleIds.length
        return data.dictionary ? data.dictionary[data.values[physical]] : data.values[physical]
      },
      sampleId(row: number) {
        check(row)
        return sampleIds[(offset + row) % sampleIds.length]
      },
    })
  }

  function commit(candidate: Map<string, Column>, sampleIds: readonly number[]) {
    let start = Math.max(0, sampleIds.length - maxPoints)
    const key = candidate.get(x)!
    if (maxAge !== undefined && sampleIds.length) {
      const cutoff = key.values[sampleIds.length - 1] - maxAge
      while (start < sampleIds.length && key.values[start] < cutoff) start += 1
    }
    const candidateView = view(candidate, sampleIds)
    for (const entry of checks) {
      const validate = entry.deref()
      if (validate) validate(candidateView)
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
    length = sampleIds.length
    if (!length) {
      columns = new Map(
        [...columns].map(([name, column]) => [name, { ...column, values: new Float64Array(1) }]),
      )
    }
    ids = Float64Array.from(sampleIds.length ? sampleIds : [0])
    head = 0
    copiedRows += length
    currentView = view(columns, ids, head, length)
    return start
  }
  const first = copy(initial)
  commit(
    first,
    Array.from({ length: first.get(x)!.values.length }, () => nextId++),
  )

  function append(incoming: Map<string, Column>) {
    const count = incoming.get(x)!.values.length
    if (!count) return
    const previousLength = length
    const old = currentView
    const addedIds = Array.from({ length: count }, (_, row) => nextId + row)
    const added = view(incoming, addedIds)
    const firstCurrent = length ? old.valueAt(x, 0) : undefined
    const lastCurrent = length ? old.valueAt(x, length - 1) : undefined
    const firstAdded = added.valueAt(x, 0)
    const lastAdded = added.valueAt(x, count - 1)
    if (
      typeof lastCurrent === 'number' &&
      typeof firstAdded === 'number' &&
      firstAdded < lastCurrent
    ) {
      throw new RangeError(`table.${x} appended keys must be ordered after the current last key.`)
    }
    const total = length + count
    const candidate: TableView = Object.freeze({
      columns: names,
      length: total,
      kind: (name: string) => added.kind(name),
      valueAt: (name: string, row: number) =>
        row < previousLength ? old.valueAt(name, row) : added.valueAt(name, row - previousLength),
      sampleId: (row: number) =>
        row < previousLength ? old.sampleId(row) : added.sampleId(row - previousLength),
    })
    let start = Math.max(0, total - maxPoints)
    if (maxAge !== undefined) {
      const cutoff = Number(lastAdded) - maxAge
      let low = start
      let high = total
      while (low < high) {
        const middle = Math.floor((low + high) / 2)
        if (Number(candidate.valueAt(x, middle)) < cutoff) low = middle + 1
        else high = middle
      }
      start = low
    }
    for (const entry of checks) {
      const validate = entry.deref()
      if (validate) validate(candidate, previousLength)
      else checks.delete(entry)
    }
    const retainedOldStart = Math.min(start, previousLength)
    const retainedOld = previousLength - retainedOldStart
    const incomingStart = Math.max(0, start - previousLength)
    const required = total - start
    if (required > ids.length) {
      const capacity = Math.min(maxPoints, Math.max(required, ids.length * 2))
      const nextIds = new Float64Array(capacity)
      const nextColumns = new Map<string, Column>()
      for (const name of names) {
        const source = columns.get(name)!
        const values = new Float64Array(capacity)
        for (let row = 0; row < retainedOld; row += 1) {
          values[row] = source.values[(head + retainedOldStart + row) % ids.length]
        }
        nextColumns.set(name, { values, dictionary: incoming.get(name)!.dictionary })
      }
      for (let row = 0; row < retainedOld; row += 1) {
        nextIds[row] = old.sampleId(retainedOldStart + row)
      }
      copiedRows += retainedOld
      columns = nextColumns
      ids = nextIds
      head = 0
    } else {
      head = (head + retainedOldStart) % ids.length
      for (const name of names) {
        const column = columns.get(name)!
        column.dictionary = incoming.get(name)!.dictionary
      }
    }
    for (let row = incomingStart; row < count; row += 1) {
      const physical = (head + retainedOld + row - incomingStart) % ids.length
      for (const name of names) {
        columns.get(name)!.values[physical] = incoming.get(name)!.values[row]
      }
      ids[physical] = addedIds[row]
    }
    appendedRows += count - incomingStart
    length = required
    currentView = view(columns, ids, head, length)
    change = Object.freeze({
      version: version.get() + 1,
      operation: 'append',
      previousLength,
      length,
      inputLength: count,
      spliceFrom: previousLength,
      invalidatedFrom: start === 0 ? previousLength : 0,
      invalidatedTo: length,
      replaced: 0,
      evicted: start,
      from: firstCurrent ?? firstAdded,
      to: lastAdded,
    })
    nextId += count
    version.update((value) => value + 1)
  }

  function mutate(
    input: TableInput,
    mode: 'prepend' | 'replace',
    bounds?: { from: number; to: number },
    operationOverride?: TableChange['operation'],
  ) {
    const incoming = copy(input)
    const count = incoming.get(x)!.values.length
    const previousLength = length
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
    const current = currentView
    const added = view(
      incoming,
      Array.from({ length: count }, (_, row) => nextId + row),
    )
    let before = 0
    let after = length
    if (bounds) {
      while (before < length && Number(current.valueAt(x, before)) < bounds.from) before += 1
      after = before
      while (after < length && Number(current.valueAt(x, after)) <= bounds.to) after += 1
    } else if (mode === 'prepend') after = 0
    const merged: Record<string, TableValue[]> = Object.create(null)
    for (const name of names) {
      merged[name] = [
        ...Array.from({ length: before }, (_, row) => current.valueAt(name, row)),
        ...Array.from({ length: count }, (_, row) => added.valueAt(name, row)),
        ...Array.from({ length: length - after }, (_, row) => current.valueAt(name, after + row)),
      ]
    }
    const sampleIds = [
      ...Array.from({ length: before }, (_, row) => current.sampleId(row)),
      ...Array.from({ length: count }, (_, row) => nextId + row),
      ...Array.from({ length: length - after }, (_, row) => current.sampleId(after + row)),
    ]
    const start = commit(copy(merged), sampleIds)
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
      length,
      inputLength: count,
      spliceFrom: before,
      invalidatedFrom: 0,
      invalidatedTo: length,
      replaced,
      evicted,
      from: bounds?.from ?? firstAdded ?? firstCurrent,
      to:
        bounds?.to ??
        (mode === 'prepend' ? (lastCurrent ?? lastAdded) : (lastAdded ?? lastCurrent)),
    })
    nextId += count
    version.update((value) => value + 1)
  }

  const store: TableStore = Object.freeze({
    x,
    columns: names,
    get length() {
      return length
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
    append: (rows: TableInput) => append(copy(rows)),
    prepend: (rows: TableInput) => mutate(rows, 'prepend'),
    replace: (rows: TableInput) => mutate(rows, 'replace'),
    upsert: (input: { from: number; to: number; rows: TableInput }) =>
      mutate(input.rows, 'replace', input),
    clear() {
      if (length) {
        mutate(Object.fromEntries(names.map((name) => [name, []])), 'replace', undefined, 'clear')
      }
    },
  })
  stores.add(store)
  validators.set(store, checks)
  diagnostics.set(store, () =>
    Object.freeze({
      capacity: ids.length,
      byteLength:
        ids.byteLength +
        [...columns.values()].reduce((sum, column) => sum + column.values.byteLength, 0),
      copiedRows,
      appendedRows,
    }),
  )
  return store
}

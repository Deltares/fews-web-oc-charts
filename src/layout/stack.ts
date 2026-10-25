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
  /** Typed buffers reachable from this snapshot, including partially retained blocks. */
  readonly bytes: number
  readonly processedRows: number
  /** Surviving rows copied into a replacement tail block, independent of layer count. */
  readonly copiedRows: number
}

export function validateStackInput(
  data: TableView,
  options: StackLayoutOptions,
  startRow = 0,
  endRow = data.length,
) {
  if (!data.columns.includes(options.x)) throw new Error(`Unknown x column "${options.x}".`)
  if (data.kind(options.x) === 'string') {
    startRow = 0
    endRow = data.length
  }
  const keys = new Set<string | number>()
  let previous = startRow ? Number(data.valueAt(options.x, startRow - 1)) : -Infinity
  if (startRow) keys.add(data.valueAt(options.x, startRow - 1))
  for (let row = startRow; row < endRow; row += 1) {
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

/** Unchanged rows were validated before the splice; include the successor key boundary. */
export function validateStackUpdate(
  data: TableView,
  options: StackLayoutOptions,
  from: number,
  to: number,
) {
  validateStackInput(data, options, from, Math.min(data.length, to + 1))
  for (let start = from; start < to; start += blockSize) {
    const offset = start
    computeStackBlock(
      {
        columns: data.columns,
        length: Math.min(blockSize, to - offset),
        kind: (name) => data.kind(name),
        valueAt: (name, row) => data.valueAt(name, offset + row),
        sampleId: (row) => data.sampleId(offset + row),
      },
      options,
      undefined,
      0,
      0,
      offset,
    )
  }
}

/** Data-space endpoints only: usable by both rectangles and shared area boundaries. */
function computeStackBlock(
  data: TableView,
  options: StackLayoutOptions,
  previous?: StackLayout,
  startRow = 0,
  previousOffset = 0,
  rowOffset = 0,
): StackLayout {
  if (!previous || startRow < 1 || startRow > data.length) {
    previous = undefined
    startRow = 0
  }
  const length = data.length
  const stacks = [...new Set(options.layers.map((layer) => layer.stack))]
  const groups =
    options.layout === 'grouped'
      ? options.layers.map((layer) => [layer])
      : stacks.map((stack) => options.layers.filter((layer) => layer.stack === stack))
  const endpoints = new Map<string, StackEndpoints>()
  let bytes = 0
  let processedRows = 0
  groups.forEach((layers, slot) => {
    const positive = new Float64Array(data.length)
    const negative = new Float64Array(data.length)
    const gap = new Uint8Array(data.length)
    bytes += positive.byteLength + negative.byteLength + gap.byteLength
    const previousLayer = previous?.layers.find((item) => item.id === layers[0]?.id)
    for (let row = 0; row < startRow; row += 1) {
      positive[row] = previousLayer?.positiveAt(previousOffset + row) ?? 0
      negative[row] = previousLayer?.negativeAt(previousOffset + row) ?? 0
      gap[row] = Number.isNaN(positive[row]) || Number.isNaN(negative[row]) ? 1 : 0
    }
    for (const layer of layers) {
      if (layer.visible === false) continue
      for (let row = startRow; row < data.length; row += 1) {
        if (Number.isNaN(data.valueAt(layer.y, row))) gap[row] = 1
      }
      processedRows += data.length - startRow
    }
    for (const layer of layers) {
      const lower = new Float64Array(data.length).fill(NaN)
      const upper = new Float64Array(data.length).fill(NaN)
      bytes += lower.byteLength + upper.byteLength
      const oldLayer = previous?.layers.find((item) => item.id === layer.id)
      if (oldLayer) {
        for (let row = 0; row < startRow; row += 1) {
          lower[row] = oldLayer.lowerAt(previousOffset + row)
          upper[row] = oldLayer.upperAt(previousOffset + row)
        }
      }
      if (layer.visible !== false) {
        for (let row = startRow; row < data.length; row += 1) {
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
            throw new RangeError(`Stack overflow at layer "${layer.id}", row ${rowOffset + row}.`)
        }
        processedRows += data.length - startRow
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
    processedRows,
    copiedRows: startRow,
  })
}

interface StackBlock {
  readonly start: number
  readonly length: number
  readonly offset: number
  readonly layout: StackLayout
}
const blockSize = 128
const layoutBlocks = new WeakMap<StackLayout, readonly StackBlock[]>()

interface StackReuse {
  readonly from: number
  readonly to: number
  readonly previousFrom: number
}

/** Immutable blocks share surviving endpoints without retaining chains of old layouts. */
export function computeStackLayout(
  data: TableView,
  options: StackLayoutOptions,
  previous?: StackLayout,
  startRow = 0,
  previousOffset = 0,
  reuse?: readonly StackReuse[],
): StackLayout {
  const oldBlocks = previous && layoutBlocks.get(previous)
  if (reuse) startRow = 0
  if (!oldBlocks || (!reuse && (startRow < 1 || startRow > data.length))) {
    previous = undefined
    startRow = 0
    previousOffset = 0
  }
  validateStackInput(data, options, startRow)
  const blocks: StackBlock[] = []
  if (reuse && oldBlocks) {
    for (const range of reuse) {
      for (const block of oldBlocks) {
        const start = range.from + block.start - range.previousFrom
        if (start >= range.from && start + block.length <= range.to) {
          blocks.push({ ...block, start })
        }
      }
    }
  } else if (previous && oldBlocks) {
    for (const block of oldBlocks) {
      const from = Math.max(previousOffset, block.start)
      const to = Math.min(previousOffset + startRow, block.start + block.length)
      if (from < to) {
        blocks.push({
          start: from - previousOffset,
          length: to - from,
          offset: block.offset + from - block.start,
          layout: block.layout,
        })
      }
    }
  }
  let copiedRows = 0
  let processedRows = 0
  let row = reuse ? 0 : startRow
  let tail: StackBlock | undefined
  const last = blocks.at(-1)
  if (!reuse && row < data.length && last && last.length < blockSize) {
    tail = blocks.pop()
    row -= last.length
  }
  const shared = reuse ? blocks.splice(0) : []
  let sharedIndex = 0
  while (row < data.length) {
    const next = shared[sharedIndex]
    if (next?.start === row) {
      blocks.push(next)
      row += next.length
      sharedIndex += 1
      continue
    }
    const from = row
    const length = Math.min(blockSize, (next?.start ?? data.length) - from)
    const view: TableView = {
      columns: data.columns,
      length,
      kind: (name) => data.kind(name),
      valueAt: (name, index) => data.valueAt(name, from + index),
      sampleId: (index) => data.sampleId(from + index),
    }
    const layout = computeStackBlock(view, options, tail?.layout, tail?.length, tail?.offset, from)
    copiedRows += layout.copiedRows
    processedRows += layout.processedRows
    blocks.push({ start: from, length, offset: 0, layout })
    row += length
    tail = undefined
  }
  const template = blocks[0]?.layout ?? computeStackBlock(data, options)
  const length = data.length
  function find(row: number) {
    if (!Number.isInteger(row) || row < 0 || row >= length)
      throw new RangeError(`Stack row ${row} is outside the layout.`)
    let low = 0
    let high = blocks.length - 1
    while (low < high) {
      const middle = Math.ceil((low + high) / 2)
      if (blocks[middle].start <= row) low = middle
      else high = middle - 1
    }
    return blocks[low]
  }
  const result: StackLayout = Object.freeze({
    layers: Object.freeze(
      template.layers.map((layer, index) => {
        function value(method: 'lowerAt' | 'upperAt' | 'positiveAt' | 'negativeAt', row: number) {
          const block = find(row)
          return block.layout.layers[index][method](block.offset + row - block.start)
        }
        return Object.freeze({
          id: layer.id,
          stack: layer.stack,
          slot: layer.slot,
          lowerAt: (row: number) => value('lowerAt', row),
          upperAt: (row: number) => value('upperAt', row),
          positiveAt: (row: number) => value('positiveAt', row),
          negativeAt: (row: number) => value('negativeAt', row),
        })
      }),
    ),
    slots: template.slots,
    bytes: blocks.reduce((sum, block) => sum + block.layout.bytes, 0),
    processedRows,
    copiedRows,
  })
  layoutBlocks.set(result, blocks)
  return result
}

const cache = new WeakMap<
  TableStore,
  {
    version: number
    entries: Map<string, { version: number; layout: StackLayout }>
    bytes: number
  }
>()
const maxBytes = 32 * 1024 * 1024
const maxEntries = 8

export function stackLayout(data: TableStore, options: StackLayoutOptions): StackLayout {
  const version = data.version
  let current = cache.get(data)
  if (!current || current.version !== version) {
    const change = data.change
    const reusable =
      current !== undefined &&
      change !== undefined &&
      ['append', 'prepend', 'upsert'].includes(change.operation) &&
      change.version === version
    current =
      reusable && current ? { ...current, version } : { version, entries: new Map(), bytes: 0 }
    cache.set(data, current)
  }
  if (!current) throw new Error('Stack layout cache initialization failed.')
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
  if (previous?.version === version) {
    current.entries.delete(key)
    current.entries.set(key, previous)
    return previous.layout
  }
  const change = data.change
  const canExtend =
    previous !== undefined &&
    previous.version === version - 1 &&
    change !== undefined &&
    ['append', 'prepend', 'upsert'].includes(change.operation) &&
    change.version === version &&
    previous.layout.layers.length === options.layers.length
  const result = canExtend
    ? computeStackLayout(
        data,
        options,
        previous.layout,
        Math.max(0, change.previousLength - change.evicted),
        Math.min(change.previousLength, change.evicted),
        change.operation === 'append'
          ? undefined
          : [
              {
                from: 0,
                to: Math.max(0, change.spliceFrom - change.evicted),
                previousFrom: change.evicted,
              },
              {
                from: Math.max(0, change.spliceFrom + change.inputLength - change.evicted),
                to: data.length,
                previousFrom:
                  Math.max(0, change.spliceFrom + change.inputLength - change.evicted) +
                  change.evicted +
                  change.replaced -
                  change.inputLength,
              },
            ],
      )
    : computeStackLayout(data, options)
  if (result.bytes <= maxBytes) {
    if (previous) {
      current.entries.delete(key)
      current.bytes -= previous.layout.bytes
    }
    while (current.entries.size >= maxEntries || current.bytes + result.bytes > maxBytes) {
      const oldest = current.entries.entries().next().value
      if (!oldest) break
      current.entries.delete(oldest[0])
      current.bytes -= oldest[1].layout.bytes
    }
    current.entries.set(key, { version, layout: result })
    current.bytes += result.bytes
  }
  return result
}

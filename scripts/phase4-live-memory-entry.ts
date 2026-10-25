import {
  bar,
  createPlot,
  createSeries,
  createTable,
  linearScale,
  series,
  stackedArea,
  type Plot,
  type SeriesStore,
  type TableStore,
} from '../src/index.js'
import { seriesStorageDiagnostics } from '../src/data-store/series.js'
import { tableStorageDiagnostics } from '../src/data-store/table.js'
import { computeStackLayout, stackCacheDiagnostics, stackLayout } from '../src/layout/stack.js'

type Fixture = 'line' | 'composites'
const lineLength = 1_000_000
const tableLength = 2048
const layers = [
  { id: 'a', y: 'a' },
  { id: 'b', y: 'b' },
  { id: 'c', y: 'c' },
]
let plots: Plot[] = []
let hosts: HTMLElement[] = []
let data: SeriesStore | undefined
let table: TableStore | undefined
let fixture: Fixture = 'line'
let next = 0
let initialTableCopies = 0
const xScale = linearScale({ domain: [0, lineLength - 1] })
const yScale = linearScale({ domain: [-10, 10] })

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

async function frame() {
  await new Promise(requestAnimationFrame)
  await new Promise(requestAnimationFrame)
}

function destroy() {
  for (const plot of plots) plot.destroy()
  for (const host of hosts) host.remove()
  plots = []
  hosts = []
  data = undefined
  table = undefined
}

async function empty(kind: Fixture) {
  destroy()
  fixture = kind
  const length = kind === 'line' ? lineLength : tableLength
  next = length
  xScale.domain.set([0, length - 1])
  for (const width of kind === 'line' ? [1000] : [1000, 640]) {
    const host = document.createElement('div')
    document.body.append(host)
    hosts.push(host)
    plots.push(
      createPlot(host, {
        width,
        height: 300,
        scales: { x: xScale, y: yScale },
        directions: { x: 'x', y: 'y' },
      }),
    )
  }
  await frame()
}

async function populate() {
  if (fixture === 'line') {
    const x = Float64Array.from({ length: lineLength }, (_, index) => index)
    data = createSeries(
      { x, y: x.map((value) => Math.sin(value / 1000)) },
      { capacity: lineLength, maxPoints: lineLength },
    )
    plots[0].update({ marks: [series(data, { id: 'live', x: 'x', y: 'y' })] })
  } else {
    const t = Float64Array.from({ length: tableLength }, (_, index) => index)
    table = createTable(
      {
        t,
        a: t.map((value) => Math.sin(value / 13)),
        b: t.map((value) => -Math.cos(value / 17)),
        c: t.map((value) => (value % 97 === 0 ? NaN : 2)),
      },
      { x: 't', maxPoints: tableLength },
    )
    initialTableCopies = tableStorageDiagnostics(table).copiedRows
    const options = { x: 't', layers, scales: { x: 'x', y: 'y' } }
    plots[0].update({ marks: [stackedArea(table, { ...options, id: 'stack' })] })
    plots[1].update({
      marks: [bar(table, { ...options, id: 'group', layout: 'grouped', width: 1 })],
    })
  }
  await frame()
}

async function warm() {
  for (let index = 0; index < 100; index += 1) {
    const length = fixture === 'line' ? lineLength : tableLength
    const start = (index * length) / 200
    xScale.domain.set([start, start + length / 2])
    await frame()
  }
}

function verify() {
  if (data) {
    assert(data.length === lineLength, 'Line retention length changed.')
    assert(
      data.xAt(0) === next - lineLength && data.xAt(data.length - 1) === next - 1,
      'Line keys differ.',
    )
    assert(
      data.lodCacheEntries <= 16 && data.lodCacheByteLength <= 2 * 1024 * 1024,
      'LOD cache exceeded its budget.',
    )
    assert(
      seriesStorageDiagnostics(data).canonicalBytes === lineLength * 16,
      'Canonical line buffers grew.',
    )
    for (let row = 0; row < data.length; row += 1) {
      const key = next - lineLength + row
      assert(
        data.xAt(row) === key && data.yAt(row) === Math.sin(key / 1000),
        `Line sample differs at row ${row}.`,
      )
    }
    const path = plots[0].element.querySelector('path[data-mark-id="live"]')
    assert(path?.getAttribute('d')?.startsWith('M'), 'Production line was not rendered.')
  }
  if (table) {
    assert(table.length === tableLength, 'Table retention length changed.')
    const cache = stackCacheDiagnostics(table)
    assert(
      cache.entries <= 8 && cache.bytes <= 32 * 1024 * 1024,
      'Stack cache exceeded its budget.',
    )
    const storage = tableStorageDiagnostics(table)
    assert(storage.copiedRows === initialTableCopies, 'Table append relocated surviving rows.')
    assert(storage.byteLength === tableLength * 5 * 8, 'Canonical table buffers grew.')
    for (let row = 0; row < table.length; row += 1) {
      const key = next - tableLength + row
      assert(
        table.valueAt('t', row) === key && table.sampleId(row) === key,
        'Table rows or IDs differ.',
      )
      assert(
        table.valueAt('a', row) === Math.sin(key / 13) &&
          table.valueAt('b', row) === -Math.cos(key / 17) &&
          Object.is(table.valueAt('c', row), key % 97 === 0 ? NaN : 2),
        `Table values differ at row ${row}.`,
      )
    }
    for (const layout of ['grouped', 'stacked'] as const) {
      const options = { x: 't', layers, layout }
      const actual = stackLayout(table, options)
      const expected = computeStackLayout(table, options)
      assert(actual.processedRows <= 6 * 32, 'Live stack rescanned surviving rows.')
      assert(actual.copiedRows < 128, 'Live stack copied a complete prefix block.')
      for (let layer = 0; layer < layers.length; layer += 1) {
        for (let row = 0; row < table.length; row += 1) {
          for (const endpoint of ['lowerAt', 'upperAt', 'positiveAt', 'negativeAt'] as const) {
            assert(
              Object.is(actual.layers[layer][endpoint](row), expected.layers[layer][endpoint](row)),
              `Stack ${layout}/${endpoint} differs at row ${row}.`,
            )
          }
        }
      }
    }
  }
}

async function advance(batches: number) {
  for (let batch = 0; batch < batches; batch += 1) {
    const before = data ? seriesStorageDiagnostics(data) : undefined
    const x = Float64Array.from({ length: 32 }, (_, index) => next + index)
    if (data) data.append({ x, y: x.map((value) => Math.sin(value / 1000)) })
    if (table) {
      table.append({
        t: x,
        a: x.map((value) => Math.sin(value / 13)),
        b: x.map((value) => -Math.cos(value / 17)),
        c: x.map((value) => (value % 97 === 0 ? NaN : 2)),
      })
    }
    next += x.length
    const length = data ? lineLength : tableLength
    xScale.domain.set([next - length, next - 1])
    await frame()
    if (data && before) {
      const after = seriesStorageDiagnostics(data)
      assert(
        after.summaryRows - before.summaryRows <= 256,
        'Line append rebuilt surviving summaries.',
      )
      assert(after.lodRows - before.lodRows <= 1000 * 128 + 256, 'Line LOD rescanned the source.')
    }
  }
  verify()
  return snapshot()
}

function snapshot() {
  return {
    fixture,
    next,
    series: data ? seriesStorageDiagnostics(data) : undefined,
    lodEntries: data?.lodCacheEntries,
    lodBytes: data?.lodCacheByteLength,
    table: table ? tableStorageDiagnostics(table) : undefined,
    stack: table ? stackCacheDiagnostics(table) : undefined,
    paths: document.querySelectorAll('path').length,
    rectangles: document.querySelectorAll('rect').length,
    pathCharacters: [...document.querySelectorAll('path')].reduce(
      (total, path) => total + (path.getAttribute('d')?.length ?? 0),
      0,
    ),
  }
}

const probe = { empty, populate, warm, advance, snapshot, destroy }
declare global {
  interface Window {
    phase4Memory: typeof probe
  }
}
window.phase4Memory = probe

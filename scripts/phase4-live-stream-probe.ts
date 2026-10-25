// Page-side acceptance probe for examples/v5-live-stream/, loaded by
// scripts/phase4-live-stream.mjs through the same Vite server as the example, so
// these internal modules are the instances behind the example's public `@lib` imports.
import { subscribe } from '../src/core/runtime.js'
import { seriesStorageDiagnostics } from '../src/data-store/series.js'
import { tableStorageDiagnostics } from '../src/data-store/table.js'
import { computeStackLayout, stackCacheDiagnostics, stackLayout } from '../src/layout/stack.js'
import type { Plot } from '../src/index.js'

type PlotName = 'overview' | 'detail'
type Layout = 'stacked' | 'grouped'
const MiB = 1024 * 1024
const hour = 3_600_000
const seriesRetention = 1440
const tableRetention = 720
const live = window.liveStream
const initialCopiedRows = tableStorageDiagnostics(live.flows).copiedRows

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

async function frame() {
  await new Promise(requestAnimationFrame)
  await new Promise(requestAnimationFrame)
}

function plot(name: PlotName): Plot {
  const current = name === 'overview' ? live.overview : live.detail
  assert(current && !current.destroyed, `The ${name} plot is not mounted.`)
  return current
}

function region(name: PlotName) {
  return plot(name).regions.get().plot
}

/** Client coordinates of a fractional position inside a plot region. */
function client(name: PlotName, fx: number, fy: number) {
  const box = plot(name).element.getBoundingClientRect()
  const area = region(name)
  return { x: box.left + area.x + area.width * fx, y: box.top + area.y + area.height * fy }
}

function shown(node: Element | null) {
  return !!node && node.getAttribute('display') !== 'none'
}

/** Crosshair guides in SVG coordinates plus the destination projection of the shared values. */
function crosshair(name: PlotName) {
  const current = plot(name)
  const area = region(name)
  const layer = current.element.querySelector('[data-layer="crosshair"]')
  const x = current.element.querySelector('[data-crosshair-axis="x"]')
  const y = current.element.querySelector('[data-crosshair-axis="y"]')
  const state = live.pointer.state.get()
  const value = (scale: unknown) => state.values.find((entry) => entry.scale === scale)?.value
  const time = value(live.t)
  const flow = value(live.q)
  return {
    visible: shown(layer) && shown(x) && shown(y),
    x: Number(x?.getAttribute('x1')) + area.x,
    y: Number(y?.getAttribute('y1')) + area.y,
    expectedX: time === undefined ? undefined : current.scales.t.project(time),
    expectedY: flow === undefined ? undefined : current.scales.q.project(flow),
  }
}

function pointer() {
  const state = live.pointer.state.get()
  return {
    version: live.pointer.state.version,
    active: state.active,
    values: state.values.map((entry) => ({
      scale: entry.scale === live.t ? 't' : entry.scale === live.q ? 'q' : 'other',
      value: Number(entry.value),
    })),
  }
}

/** Rendered brush rectangle and the clipped projection of the shared time range. */
function brush(name: PlotName) {
  const current = plot(name)
  const area = region(name)
  const rect = current.element.querySelector('[data-brush-selection]')
  const range = live.selection.selection.get()?.ranges.find((entry) => entry.scale === live.t)
  let expected: { x: number; width: number } | undefined
  if (range) {
    const [a, b] = range.range.map((value) => current.scales.t.project(value))
    const x0 = Math.max(area.x, Math.min(a, b))
    const x1 = Math.min(area.x + area.width, Math.max(a, b))
    expected = { x: x0, width: Math.max(0, x1 - x0) }
  }
  return {
    visible: shown(rect),
    x: Number(rect?.getAttribute('x')),
    width: Number(rect?.getAttribute('width')),
    expected,
    range: range?.range.map(Number),
  }
}

function invert(name: PlotName, clientX: number) {
  return plot(name).scales.t.invert(clientX - plot(name).element.getBoundingClientRect().left)
}

function latest() {
  return live.sample.t(live.next - 1)
}

function follow() {
  return {
    following: live.t.following.get(),
    domain: live.t.domain.get().map(Number),
    window: [latest() - 2 * hour, latest()],
  }
}

/** Last point of the level line, in SVG coordinates, against its destination projection. */
function levelEnd(name: PlotName) {
  const current = plot(name)
  const path = current.element.querySelector<SVGPathElement>('path[data-mark-id="level"]')
  assert(path, `The ${name} level line is missing.`)
  const numbers = path.getAttribute('d')?.match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/g)
  assert(numbers && numbers.length >= 2, `The ${name} level line has no geometry.`)
  const point = current.element.createSVGPoint()
  point.x = Number(numbers.at(-2))
  point.y = Number(numbers.at(-1))
  const matrix = path.getCTM()
  assert(matrix, `The ${name} level line has no transform.`)
  const { x } = point.matrixTransform(matrix)
  return { x, expected: current.scales.t.project(latest()) }
}

const layoutOptions = (layout: Layout) => ({ x: 't', layers: live.layers, layout })

function verifyStacks(work: readonly Layout[]) {
  const result: Record<string, { processedRows: number; copiedRows: number }> = {}
  for (const layout of ['stacked', 'grouped'] as const) {
    // Only layouts read by a rendering mark at every version are a cache hit here.
    if (!work.includes(layout)) continue
    const actual = stackLayout(live.flows, layoutOptions(layout))
    result[layout] = { processedRows: actual.processedRows, copiedRows: actual.copiedRows }
    assert(
      actual.processedRows <= 2 * live.layers.length * live.batchSize,
      `Live ${layout} stack rescanned surviving rows (${actual.processedRows}).`,
    )
    assert(actual.copiedRows < 128, `Live ${layout} stack copied a complete prefix block.`)
  }
  return result
}

/** Exact retained rows, IDs and stack endpoints, plus bounded canonical/cache accounting. */
function verify() {
  const { flows, level, sample, next } = live
  const seriesLength = Math.min(next, seriesRetention)
  assert(level.length === seriesLength, `Series retained ${level.length}, not ${seriesLength}.`)
  for (let row = 0; row < level.length; row += 1) {
    const index = next - seriesLength + row
    assert(
      level.xAt(row) === sample.t(index) && level.yAt(row) === sample.level(index),
      `Series sample differs at row ${row}.`,
    )
  }
  assert(flows.length === tableRetention, `Table retained ${flows.length} rows.`)
  for (let row = 0; row < flows.length; row += 1) {
    const index = next - tableRetention + row
    assert(flows.sampleId(row) === index, `Table ID differs at row ${row}.`)
    assert(
      flows.valueAt('t', row) === sample.t(index) &&
        flows.valueAt('inflow', row) === sample.inflow(index) &&
        Object.is(flows.valueAt('lateral', row), sample.lateral(index)) &&
        flows.valueAt('abstraction', row) === sample.abstraction(index),
      `Table values differ at row ${row}.`,
    )
  }
  for (const layout of ['stacked', 'grouped'] as const) {
    const actual = stackLayout(flows, layoutOptions(layout))
    const expected = computeStackLayout(flows, layoutOptions(layout))
    for (let layer = 0; layer < live.layers.length; layer += 1) {
      for (let row = 0; row < flows.length; row += 1) {
        for (const endpoint of ['lowerAt', 'upperAt', 'positiveAt', 'negativeAt'] as const) {
          assert(
            Object.is(actual.layers[layer][endpoint](row), expected.layers[layer][endpoint](row)),
            `Stack ${layout}/${endpoint} differs at layer ${layer}, row ${row}.`,
          )
        }
      }
    }
  }
  const table = tableStorageDiagnostics(flows)
  const stack = stackCacheDiagnostics(flows)
  const series = seriesStorageDiagnostics(level)
  assert(table.copiedRows === initialCopiedRows, 'Table appends relocated surviving rows.')
  assert(table.byteLength === tableRetention * 5 * 8, 'Canonical table buffers grew.')
  assert(stack.entries <= 8 && stack.bytes <= 32 * MiB, 'Stack cache exceeded its budget.')
  assert(
    level.lodCacheEntries <= 16 && level.lodCacheByteLength <= 2 * MiB,
    'Series LOD cache exceeded its budget.',
  )
  if (next >= seriesRetention) {
    assert(series.canonicalBytes <= 2 * seriesRetention * 16, 'Canonical series buffers grew.')
  }
  return accounting()
}

/** Appends one batch per double frame, checking tail-only stack work when requested. */
async function advance(batches: number, work: readonly Layout[] = []) {
  let stacks: ReturnType<typeof verifyStacks> = {}
  for (let count = 0; count < batches; count += 1) {
    live.append(1)
    await frame()
    stacks = verifyStacks(work)
  }
  return { ...verify(), stacks }
}

/** Computation (canonical/cache bytes) and rendering (DOM) accounting, kept separate. */
function accounting() {
  const series = seriesStorageDiagnostics(live.level)
  const table = tableStorageDiagnostics(live.flows)
  const stack = stackCacheDiagnostics(live.flows)
  const paths = [...document.querySelectorAll('path')]
  return {
    next: live.next,
    computation: {
      seriesCanonicalBytes: series.canonicalBytes,
      tableCanonicalBytes: table.byteLength,
      tableCopiedRows: table.copiedRows,
      stackCacheEntries: stack.entries,
      stackCacheBytes: stack.bytes,
      lodCacheEntries: live.level.lodCacheEntries,
      lodCacheBytes: live.level.lodCacheByteLength,
    },
    rendering: {
      nodes: document.getElementsByTagName('*').length,
      paths: paths.length,
      rectangles: document.querySelectorAll('rect').length,
      pathCharacters: paths.reduce(
        (total, path) => total + (path.getAttribute('d')?.length ?? 0),
        0,
      ),
    },
  }
}

/** Records DOM writes inside a plot host and the number of distinct frames that wrote. */
function watch(selector: string) {
  const host = document.querySelector(selector)
  assert(host, `Missing ${selector}.`)
  let frameIndex = 0
  let running = true
  const tick = () => {
    frameIndex += 1
    if (running) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
  const frames = new Set<number>()
  let records = 0
  const observer = new MutationObserver((list) => {
    records += list.length
    frames.add(frameIndex)
  })
  observer.observe(host, { attributes: true, childList: true, characterData: true, subtree: true })
  return {
    read: () => {
      records += observer.takeRecords().length
      return { records, frames: frames.size }
    },
    stop() {
      running = false
      const result = this.read()
      observer.disconnect()
      return result
    },
  }
}

/** Counts shared time-domain notifications through the public subscription surface. */
function countDomains() {
  let count = 0
  const stop = subscribe(live.t.domain, () => (count += 1))
  return {
    read: () => count,
    stop() {
      stop()
      return count
    },
  }
}

const probe = {
  frame,
  client,
  crosshair,
  pointer,
  brush,
  invert,
  follow,
  levelEnd,
  advance,
  verify,
  accounting,
  watch,
  countDomains,
  paused: (name: PlotName) => plot(name).paused,
  mounted: () => !!live.detail && !live.detail.destroyed,
}
declare global {
  interface Window {
    liveProbe: typeof probe
  }
}
window.liveProbe = probe

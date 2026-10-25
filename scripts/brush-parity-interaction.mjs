import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { createServer } from 'vite'

process.env.NODE_ENV = 'development'
const server = await createServer({
  configFile: 'vite-examples.config.ts',
  server: { host: '127.0.0.1', port: 0 },
})

const hour = 3_600_000
const day = 24 * hour

let browser
try {
  await server.listen()
  const address = server.httpServer.address()
  assert.ok(address && typeof address !== 'string')
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))

  async function settled() {
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    )
  }
  async function readJson(selector) {
    return JSON.parse(await page.locator(selector).textContent())
  }
  const ms = (range) => range.map((value) => Date.parse(value))
  function near(actual, expected, tolerance, message) {
    assert.ok(
      Math.abs(actual - expected) <= tolerance,
      `${message}: expected ${expected} ± ${tolerance}, got ${actual}`,
    )
  }
  // Client-space plot region, derived from the plot clip rectangle.
  async function plotRegion(host) {
    await page.locator(`${host} svg`).scrollIntoViewIfNeeded()
    return page.evaluate((selector) => {
      const svg = document.querySelector(`${selector} svg`)
      const clip = svg.querySelector(':scope > defs > clipPath > rect')
      const marks = svg.querySelector(':scope > [data-layer="marks"]')
      const offset = marks.transform.baseVal.consolidate()?.matrix
      const box = svg.getBoundingClientRect()
      return {
        left: box.left + Number(clip.getAttribute('x')) + (offset?.e ?? 0),
        top: box.top + Number(clip.getAttribute('y')) + (offset?.f ?? 0),
        width: Number(clip.getAttribute('width')),
        height: Number(clip.getAttribute('height')),
      }
    }, host)
  }
  const at = (region, fx, fy) => ({
    x: region.left + region.width * fx,
    y: region.top + region.height * fy,
  })
  async function drag(from, to, { key, during } = {}) {
    await page.mouse.move(from.x, from.y)
    if (key) await page.keyboard.down(key)
    try {
      await page.mouse.down()
      await page.mouse.move(to.x, to.y, { steps: 10 })
      await settled()
      if (during) await during()
      await page.mouse.up()
    } finally {
      if (key) await page.keyboard.up(key)
    }
    await settled()
  }
  const brushLayer = (host) => page.locator(`${host} [data-layer="brush"]`)
  const brushRect = (host) => page.locator(`${host} [data-layer="brush"] [data-brush-selection]`)
  async function expectNavigatorAt(host, region, range, full, message) {
    const box = await brushRect(host).boundingBox()
    assert.ok(box, `${message}: the navigator selection must be visible`)
    const span = full[1] - full[0]
    near(
      (box.x - region.left) / region.width,
      (range[0] - full[0]) / span,
      0.01,
      `${message} start`,
    )
    near(box.width / region.width, (range[1] - range[0]) / span, 0.01, `${message} width`)
  }

  // Parity route: main chart brush, overview navigator and two-way synchronization.
  await page.goto(`http://127.0.0.1:${address.port}/examples/v5-parity-brush/`)
  await page.locator('#v5-overview svg').waitFor()
  await page.waitForFunction(() => document.querySelector('#v5-snapshot')?.textContent)
  const snapshot = () => readJson('#v5-snapshot')
  const full = [Date.parse('2025-01-01T00:00:00Z'), Date.parse('2025-01-08T00:00:00Z')]
  const initial = [Date.parse('2025-01-04T00:00:00Z'), Date.parse('2025-01-05T00:00:00Z')]
  const initialState = await snapshot()
  assert.deepEqual(ms(initialState.time), initial, 'Initial main domain')
  assert.deepEqual(initialState.navigator, initialState.time, 'Initial navigator selection')
  const overview = await plotRegion('#v5-overview')
  await expectNavigatorAt('#v5-overview', overview, initial, full, 'Initial navigator')

  // Shift-drag selects an x range in auto mode and zooms the main chart on release.
  let main = await plotRegion('#v5-main')
  const mainTolerance = (span) => (2 * span) / main.width
  await drag(at(main, 0.25, 0.5), at(main, 0.75, 0.52), {
    key: 'Shift',
    during: async () => {
      assert.equal(await brushLayer('#v5-main').getAttribute('data-mode'), 'x')
      assert.notEqual(await brushRect('#v5-main').getAttribute('display'), 'none')
    },
  })
  let state = await snapshot()
  near(ms(state.time)[0], initial[0] + 0.25 * day, mainTolerance(day), 'Brushed start')
  near(ms(state.time)[1], initial[0] + 0.75 * day, mainTolerance(day), 'Brushed end')
  assert.deepEqual(state.value, [-1.1, 1.1], 'An x brush leaves the value domain unchanged')
  assert.deepEqual(state.navigator, state.time, 'The navigator follows the brushed domain')
  assert.match(await page.locator('#v5-status').textContent(), /Main-chart brush selection/)
  assert.equal(
    await brushRect('#v5-main').getAttribute('display'),
    'none',
    'The transient main-chart brush is cleared on release',
  )
  await expectNavigatorAt('#v5-overview', overview, ms(state.time), full, 'Navigator after brush')

  // Dragging without Shift pans instead of brushing; the navigator follows.
  let before = ms(state.time)
  let span = before[1] - before[0]
  main = await plotRegion('#v5-main')
  await drag(at(main, 0.6, 0.5), at(main, 0.35, 0.5), {
    during: async () => {
      assert.equal(await brushLayer('#v5-main').getAttribute('data-mode'), null)
    },
  })
  state = await snapshot()
  let after = ms(state.time)
  near(after[1] - after[0], span, 1000, 'Panning preserves the span')
  near(after[0] - before[0], 0.25 * span, mainTolerance(span), 'Panning shifts the domain')
  assert.deepEqual(state.navigator, state.time, 'The navigator follows panning')

  // Moving the persistent navigator updates the main chart live.
  before = after
  span = before[1] - before[0]
  const fullSpan = full[1] - full[0]
  const overviewTolerance = (2 * fullSpan) / overview.width
  let navigator = await brushRect('#v5-overview').boundingBox()
  const navigatorCenter = {
    x: navigator.x + navigator.width / 2,
    y: navigator.y + navigator.height / 2,
  }
  await drag(
    navigatorCenter,
    { x: navigatorCenter.x + 0.1 * overview.width, y: navigatorCenter.y },
    {
      during: async () => {
        assert.notDeepEqual(
          ms((await snapshot()).time),
          before,
          'The main domain updates while the navigator is dragged',
        )
      },
    },
  )
  state = await snapshot()
  after = ms(state.time)
  near(after[1] - after[0], span, 1000, 'Moving the navigator preserves the span')
  near(after[0] - before[0], 0.1 * fullSpan, overviewTolerance, 'Navigator move offset')
  assert.deepEqual(state.navigator, state.time, 'Navigator and main domain stay equal')
  assert.match(await page.locator('#v5-status').textContent(), /Overview brush selection/)

  // Resizing the navigator's east handle extends the main domain end only.
  before = after
  const east = await page.locator('#v5-overview [data-brush-handle="e"]').boundingBox()
  assert.ok(east, 'The persistent navigator shows its east resize handle')
  const eastCenter = { x: east.x + east.width / 2, y: east.y + east.height / 2 }
  await drag(eastCenter, { x: eastCenter.x + 0.1 * overview.width, y: eastCenter.y })
  state = await snapshot()
  after = ms(state.time)
  near(after[0], before[0], overviewTolerance, 'Resizing east keeps the start')
  near(after[1] - before[1], 0.1 * fullSpan, overviewTolerance, 'Resizing east extends the end')
  assert.deepEqual(state.navigator, state.time)

  // Dragging outside the navigator replaces the selection.
  await drag(at(overview, 0.05, 0.5), at(overview, 0.2, 0.5))
  state = await snapshot()
  after = ms(state.time)
  near(after[0], full[0] + 0.05 * fullSpan, overviewTolerance, 'New navigator start')
  near(after[1], full[0] + 0.2 * fullSpan, overviewTolerance, 'New navigator end')
  assert.deepEqual(state.navigator, state.time)
  await expectNavigatorAt('#v5-overview', overview, after, full, 'Navigator after reselect')

  // Wheel zoom on the main chart synchronizes back to the navigator.
  before = after
  main = await plotRegion('#v5-main')
  const center = at(main, 0.5, 0.5)
  await page.mouse.move(center.x, center.y)
  await page.mouse.wheel(0, -100)
  await page.waitForFunction(
    (previous) =>
      JSON.parse(document.querySelector('#v5-snapshot').textContent).time[0] !== previous,
    state.time[0],
  )
  await settled()
  state = await snapshot()
  after = ms(state.time)
  assert.ok(after[1] - after[0] < before[1] - before[0], 'Wheel zoom narrows the main domain')
  assert.deepEqual(state.navigator, state.time, 'The navigator follows wheel zoom')

  await page.locator('#v5-reset').click()
  await settled()
  state = await snapshot()
  assert.deepEqual(ms(state.time), initial, 'Reset restores the main domain')
  assert.deepEqual(state.navigator, state.time, 'Reset restores the navigator')

  // Native route: auto mode, modifiers, selection-only mode, reset and overview.
  await page.goto(`http://127.0.0.1:${address.port}/examples/v5-brush/`)
  await page.locator('#overview svg').waitFor()
  await page.waitForFunction(() => document.querySelector('#domains')?.textContent)
  const domains = () => readJson('#domains')
  const start = Date.UTC(2026, 0, 1)
  const nativeInitial = [start + 12 * hour, start + 36 * hour]
  let native = await domains()
  assert.deepEqual(ms(native.t), nativeInitial)
  assert.deepEqual(native.q, [0, 100])
  assert.deepEqual(native.navigator, native.t)

  let chart = await plotRegion('#chart')
  const chartTolerance = (range, size) => (2 * range) / size
  await drag(at(chart, 0.25, 0.5), at(chart, 0.75, 0.52), { key: 'Shift' })
  let selection = await readJson('#snapshot')
  assert.equal(selection.mode, 'x', 'Auto mode selects x for a horizontal drag')
  assert.deepEqual(Object.keys(selection.scales), ['t'])
  native = await domains()
  near(ms(native.t)[0], nativeInitial[0] + 6 * hour, chartTolerance(day, chart.width), 'x start')
  near(ms(native.t)[1], nativeInitial[0] + 18 * hour, chartTolerance(day, chart.width), 'x end')
  assert.deepEqual(native.q, [0, 100])
  assert.deepEqual(native.navigator, native.t)
  assert.match(await page.locator('#status').textContent(), /Selected x ranges\. Main chart zoomed/)

  const xBeforeY = native.t
  await drag(at(chart, 0.5, 0.2), at(chart, 0.51, 0.8), { key: 'Shift' })
  selection = await readJson('#snapshot')
  assert.equal(selection.mode, 'y', 'Auto mode selects y for a vertical drag')
  assert.deepEqual(Object.keys(selection.scales), ['q'])
  native = await domains()
  near(native.q[0], 20, chartTolerance(100, chart.height), 'y lower bound')
  near(native.q[1], 80, chartTolerance(100, chart.height), 'y upper bound')
  assert.deepEqual(native.t, xBeforeY, 'A y brush leaves the time domain unchanged')

  // Selection only: the brush event is reported, but domains stay unchanged.
  await page.locator('#apply-zoom').uncheck()
  await page.selectOption('#mode', 'xy')
  const unchanged = await domains()
  await drag(at(chart, 0.3, 0.3), at(chart, 0.6, 0.7), { key: 'Shift' })
  selection = await readJson('#snapshot')
  assert.equal(selection.mode, 'xy')
  assert.deepEqual(Object.keys(selection.scales).sort(), ['q', 't'])
  assert.deepEqual(await domains(), unchanged, 'Selection-only mode preserves domains')

  // Without a required modifier the brush owns plain drags, so panning is suppressed.
  await page.selectOption('#mode', 'x')
  await page.selectOption('#modifier', 'none')
  assert.match(await page.locator('#status').textContent(), /^Drag to select x\./)
  await drag(at(chart, 0.2, 0.5), at(chart, 0.4, 0.5))
  selection = await readJson('#snapshot')
  assert.equal(selection.mode, 'x')
  assert.deepEqual(await domains(), unchanged, 'A modifier-free brush does not pan')

  // With Shift required again, plain drags pan and leave the last selection untouched.
  await page.selectOption('#modifier', 'shift')
  const lastSelection = await page.locator('#snapshot').textContent()
  const panBefore = ms(unchanged.t)
  await drag(at(chart, 0.6, 0.5), at(chart, 0.4, 0.5))
  native = await domains()
  near(
    ms(native.t)[1] - ms(native.t)[0],
    panBefore[1] - panBefore[0],
    1000,
    'Panning keeps the span',
  )
  assert.ok(ms(native.t)[0] > panBefore[0], 'Dragging left pans forward in time')
  assert.deepEqual(native.navigator, native.t)
  assert.equal(await page.locator('#snapshot').textContent(), lastSelection)

  await page.locator('#clear').click()
  await settled()
  native = await domains()
  assert.deepEqual(ms(native.t), [start, start + 48 * hour], 'Reset restores the full domain')
  assert.deepEqual(native.q, [0, 100])
  assert.equal(native.navigator, null, 'Reset clears the navigator')
  assert.equal(await page.locator('#snapshot').textContent(), 'No selection yet.')
  assert.equal(await brushRect('#overview').getAttribute('display'), 'none')

  const nativeOverview = await plotRegion('#overview')
  await drag(at(nativeOverview, 0.25, 0.5), at(nativeOverview, 0.5, 0.5))
  native = await domains()
  const nativeTolerance = chartTolerance(48 * hour, nativeOverview.width)
  near(ms(native.t)[0], start + 12 * hour, nativeTolerance, 'Overview selection start')
  near(ms(native.t)[1], start + 24 * hour, nativeTolerance, 'Overview selection end')
  assert.deepEqual(native.navigator, native.t)
  assert.match(await page.locator('#status').textContent(), /Overview selection updated/)

  assert.deepEqual(errors, [], 'The brush examples must not emit browser errors')
  console.log(
    'Brush parity: Shift-drag selection, brush-to-domain updates, overview navigation and two-way synchronization passed.',
  )
} finally {
  await browser?.close()
  await server.close()
}

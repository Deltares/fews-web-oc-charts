import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { createServer } from 'vite'

process.env.NODE_ENV = 'development'
const server = await createServer({
  configFile: 'vite-examples.config.ts',
  server: { host: '127.0.0.1', port: 0 },
})

const hour = 3_600_000

let browser
const errors = []
try {
  await server.listen()
  const address = server.httpServer.address()
  assert.ok(address && typeof address !== 'string')
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
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
  async function drag(from, to, { key, button = 'left', during } = {}) {
    await page.mouse.move(from.x, from.y)
    if (key) await page.keyboard.down(key)
    try {
      await page.mouse.down({ button })
      await page.mouse.move(to.x, to.y, { steps: 10 })
      await settled()
      if (during) await during()
      await page.mouse.up({ button })
    } finally {
      if (key) await page.keyboard.up(key)
    }
    await settled()
  }
  const touchAction = (host) =>
    page.locator(`${host} svg`).evaluate((svg) => svg.style.getPropertyValue('touch-action'))
  async function expectTouchAction(host, expected, message) {
    await page
      .waitForFunction(
        ([selector, value]) =>
          document.querySelector(`${selector} svg`).style.getPropertyValue('touch-action') ===
          value,
        [host, expected],
        { timeout: 2000 },
      )
      .catch(() => {})
    assert.equal(await touchAction(host), expected, message)
  }

  // Native pan route: direction, modifier, mouse button and enable/disable options.
  await page.goto(`http://127.0.0.1:${address.port}/examples/v5-pan/`)
  await page.locator('#chart svg').waitFor()
  await page.waitForFunction(() => document.querySelector('#snapshot')?.textContent)
  const panState = () => readJson('#snapshot')
  const start = Date.UTC(2026, 0, 1)
  const fullTime = [start, start + 48 * hour]
  let state = await panState()
  assert.deepEqual(ms(state.time), fullTime, 'Initial time domain')
  assert.deepEqual(state.value, [0, 100], 'Initial value domain')
  await expectTouchAction('#chart', 'pan-y', 'x panning leaves vertical touch scrolling')

  let chart = await plotRegion('#chart')
  const timeTolerance = (2 * 48 * hour) / chart.width
  const valueTolerance = (2 * 100) / chart.height
  async function expectPan(dx, dy, message) {
    const timeShift = -dx * 48 * hour
    const valueShift = dy * 100
    state = await panState()
    near(ms(state.time)[0] - fullTime[0], timeShift, timeTolerance, `${message} time start`)
    near(ms(state.time)[1] - fullTime[1], timeShift, timeTolerance, `${message} time end`)
    near(state.value[0], valueShift, valueTolerance, `${message} value start`)
    near(state.value[1], 100 + valueShift, valueTolerance, `${message} value end`)
  }
  async function reset() {
    await page.locator('#reset').click()
    await settled()
    state = await panState()
    assert.deepEqual(ms(state.time), fullTime, 'Reset restores the time domain')
    assert.deepEqual(state.value, [0, 100], 'Reset restores the value domain')
  }

  // x mode pans time live and leaves the value domain alone, even for diagonal drags.
  await drag(at(chart, 0.6, 0.4), at(chart, 0.35, 0.6), {
    during: async () => {
      assert.notDeepEqual(ms((await panState()).time), fullTime, 'Panning updates live')
    },
  })
  await expectPan(-0.25, 0, 'x pan')
  assert.match(await page.locator('#status').textContent(), /^No modifier; drag pans x\./)

  // Only the primary button pans; v4's configurable mouseButton is not part of v5.
  for (const button of ['right', 'middle']) {
    await drag(at(chart, 0.6, 0.5), at(chart, 0.35, 0.5), { button })
    await expectPan(-0.25, 0, `${button}-button drag is ignored`)
  }
  await reset()

  await page.selectOption('#mode', 'y')
  await expectTouchAction('#chart', 'pan-x', 'y panning leaves horizontal touch scrolling')
  await drag(at(chart, 0.4, 0.3), at(chart, 0.6, 0.5))
  await expectPan(0, 0.2, 'y pan')
  await reset()

  await page.selectOption('#mode', 'xy')
  await expectTouchAction('#chart', 'none', 'xy panning captures all touch movement')
  await drag(at(chart, 0.6, 0.3), at(chart, 0.35, 0.5))
  await expectPan(-0.25, 0.2, 'xy pan')
  await reset()

  // Modifier requirements: only drags with the configured key pan.
  await page.selectOption('#mode', 'x')
  for (const [modifier, key, other] of [
    ['shift', 'Shift', 'Control'],
    ['ctrl', 'Control', 'Shift'],
  ]) {
    await page.selectOption('#modifier', modifier)
    assert.match(
      await page.locator('#status').textContent(),
      new RegExp(`^${modifier} required; drag pans x\\.`),
    )
    await drag(at(chart, 0.6, 0.5), at(chart, 0.35, 0.5))
    await expectPan(0, 0, `Plain drag with ${modifier} required`)
    await drag(at(chart, 0.6, 0.5), at(chart, 0.35, 0.5), { key: other })
    await expectPan(0, 0, `${other} drag with ${modifier} required`)
    await drag(at(chart, 0.6, 0.5), at(chart, 0.35, 0.5), { key })
    await expectPan(-0.25, 0, `${key} drag with ${modifier} required`)
    await reset()
  }
  await page.selectOption('#modifier', 'none')

  // Disabling uninstalls the plugin and restores touch-action; enabling reinstalls it.
  await page.locator('#enabled').uncheck()
  await settled()
  assert.match(await page.locator('#status').textContent(), /^Pan disabled/)
  await expectTouchAction('#chart', '', 'Disabling restores the original touch-action')
  await drag(at(chart, 0.6, 0.5), at(chart, 0.35, 0.5))
  await expectPan(0, 0, 'Disabled pan')
  await page.locator('#enabled').check()
  await settled()
  await expectTouchAction('#chart', 'pan-y', 'Enabling reinstalls the pan plugin')
  assert.match(await page.locator('#status').textContent(), /^No modifier; drag pans x\./)
  chart = await plotRegion('#chart')
  await drag(at(chart, 0.6, 0.5), at(chart, 0.35, 0.5))
  await expectPan(-0.25, 0, 'Re-enabled pan')
  await reset()

  // Shared-scale route: shared pan/zoom handles synchronize both plots through t and q.
  await page.goto(`http://127.0.0.1:${address.port}/examples/v5-shared-scales/`)
  await page.locator('#detail svg').waitFor()
  await page.locator('#overview svg').waitFor()
  await page.waitForFunction(() => document.querySelector('#snapshot')?.textContent)
  const shared = () => readJson('#snapshot')
  const window6h = [start, start + 6 * hour]
  async function notifications() {
    const text = await page.locator('#subscription-status').textContent()
    return Number(text.match(/notified (\d+) time/)?.[1] ?? 0)
  }
  async function ticks(host) {
    return page
      .locator(`${host} svg [data-layer="axes"] > g[data-scale="t"] text`)
      .allTextContents()
  }
  async function expectSameTicks(message) {
    await settled()
    const overviewTicks = await ticks('#overview')
    assert.ok(overviewTicks.length > 0, `${message}: the overview renders time ticks`)
    assert.deepEqual(await ticks('#detail'), overviewTicks, `${message}: both plots share ticks`)
    return overviewTicks
  }
  let sharedState = await shared()
  assert.deepEqual(ms(sharedState.time), window6h, 'Initial shared time domain')
  assert.deepEqual(sharedState.discharge, [0, 100], 'Initial shared discharge domain')
  const initialTicks = await expectSameTicks('Initial')

  // Each plot pans by its own pixel range; both render the shared result.
  let overview = await plotRegion('#overview')
  let detail = await plotRegion('#detail')
  assert.ok(detail.width < overview.width - 50, 'The detail plot has an independent pixel range')
  let before = ms(sharedState.time)
  overview = await plotRegion('#overview')
  await drag(at(overview, 0.6, 0.5), at(overview, 0.35, 0.5))
  sharedState = await shared()
  near(
    ms(sharedState.time)[0] - before[0],
    0.25 * 6 * hour,
    (2 * 6 * hour) / overview.width,
    'Overview pan shift',
  )
  assert.deepEqual(sharedState.discharge, [0, 100], 'x pan leaves discharge unchanged')
  assert.notDeepEqual(await expectSameTicks('After overview pan'), initialTicks)

  before = ms(sharedState.time)
  detail = await plotRegion('#detail')
  await drag(at(detail, 0.35, 0.5), at(detail, 0.6, 0.5))
  sharedState = await shared()
  near(
    ms(sharedState.time)[0] - before[0],
    -0.25 * 6 * hour,
    (2 * 6 * hour) / detail.width,
    'Detail pan uses its own pixel range',
  )
  await expectSameTicks('After detail pan')

  // One wheel step produces exactly one shared-domain notification for both plots.
  async function wheel(host) {
    const region = await plotRegion(host)
    const previous = await page.locator('#snapshot').textContent()
    const center = at(region, 0.5, 0.5)
    await page.mouse.move(center.x, center.y)
    await page.mouse.wheel(0, -100)
    await page.waitForFunction(
      ([selector, text]) => document.querySelector(selector).textContent !== text,
      ['#snapshot', previous],
    )
    await settled()
  }
  const span = (range) => range[1] - range[0]
  before = ms((await shared()).time)
  let count = await notifications()
  await wheel('#detail')
  sharedState = await shared()
  assert.ok(span(ms(sharedState.time)) < span(before), 'x wheel narrows the shared time domain')
  assert.deepEqual(sharedState.discharge, [0, 100], 'x wheel leaves discharge unchanged')
  assert.equal(await notifications(), count + 1, 'One wheel step notifies the shared scale once')
  await expectSameTicks('After wheel')

  // Double-click resets the zoomed direction to the domain captured when zoom was installed.
  detail = await plotRegion('#detail')
  await page.mouse.dblclick(at(detail, 0.5, 0.5).x, at(detail, 0.5, 0.5).y)
  await settled()
  assert.deepEqual(ms((await shared()).time), window6h, 'Double-click restores the initial window')

  // A single handle update reconfigures the gesture on both plots.
  await page.selectOption('#gesture-mode', 'y')
  before = ms((await shared()).time)
  overview = await plotRegion('#overview')
  await drag(at(overview, 0.6, 0.3), at(overview, 0.35, 0.5))
  sharedState = await shared()
  assert.deepEqual(ms(sharedState.time), before, 'y pan leaves time unchanged')
  near(sharedState.discharge[0], 20, (2 * 100) / overview.height, 'y pan discharge start')
  near(sharedState.discharge[1], 120, (2 * 100) / overview.height, 'y pan discharge end')
  const discharge = sharedState.discharge
  await wheel('#detail')
  sharedState = await shared()
  assert.deepEqual(ms(sharedState.time), before, 'y wheel leaves time unchanged')
  assert.ok(span(sharedState.discharge) < span(discharge), 'y wheel narrows discharge')

  await page.selectOption('#gesture-mode', 'xy')
  const xyBefore = await shared()
  await wheel('#overview')
  sharedState = await shared()
  assert.ok(span(ms(sharedState.time)) < span(ms(xyBefore.time)), 'xy wheel narrows time')
  assert.ok(span(sharedState.discharge) < span(xyBefore.discharge), 'xy wheel narrows discharge')

  await page.locator('#reset').click()
  await settled()
  sharedState = await shared()
  assert.deepEqual(ms(sharedState.time), window6h, 'Reset restores the shared time domain')
  assert.deepEqual(sharedState.discharge, [0, 100], 'Reset restores the shared discharge domain')

  // Destroying one plot leaves the detail plot, the shared scales and the shared gestures alive.
  await page.selectOption('#gesture-mode', 'x')
  await page.locator('#toggle-overview').click()
  await settled()
  assert.equal(await page.locator('#overview svg').count(), 0, 'The overview svg is removed')
  assert.match(await page.locator('#status').textContent(), /Overview destroyed; detail mounted\./)
  assert.equal(await page.locator('#toggle-overview').textContent(), 'Recreate overview')
  detail = await plotRegion('#detail')
  count = await notifications()
  await drag(at(detail, 0.6, 0.5), at(detail, 0.35, 0.5))
  sharedState = await shared()
  near(
    ms(sharedState.time)[0] - window6h[0],
    0.25 * 6 * hour,
    (2 * 6 * hour) / detail.width,
    'Detail still pans after the overview is destroyed',
  )
  assert.ok((await notifications()) > count, 'The shared subscription survives plot destruction')

  await page.locator('#toggle-overview').click()
  await page.locator('#overview svg').waitFor()
  await expectSameTicks('Recreated overview')
  overview = await plotRegion('#overview')
  before = ms(sharedState.time)
  await drag(at(overview, 0.35, 0.5), at(overview, 0.6, 0.5))
  sharedState = await shared()
  near(
    ms(sharedState.time)[0] - before[0],
    -0.25 * 6 * hour,
    (2 * 6 * hour) / overview.width,
    'The recreated overview reinstalls the shared pan handle',
  )
  await expectSameTicks('After recreated overview pan')

  assert.deepEqual(errors, [], 'The pan examples must not emit browser errors')
  console.log(
    'Pan parity: direction, modifier, button and enable/disable options plus shared-scale synchronization passed.',
  )
} catch (error) {
  if (errors.length > 0) console.error('Browser errors:', errors)
  throw error
} finally {
  await browser?.close()
  await server.close()
}

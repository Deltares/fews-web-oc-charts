import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { createServer } from 'vite'

process.env.NODE_ENV = 'development'
const server = await createServer({
  configFile: 'vite-examples.config.ts',
  server: { host: '127.0.0.1', port: 0 },
})

let browser
try {
  await server.listen()
  const address = server.httpServer.address()
  assert.ok(address && typeof address !== 'string')
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`http://127.0.0.1:${address.port}/examples/v5-parity-zoom/`)
  await page.locator('#v5-chart svg').waitFor()
  await page.waitForFunction(() =>
    document.querySelector('#v5-snapshot').textContent.includes('time'),
  )
  await page.evaluate(() => {
    window.zoomParityWheelCount = 0
    document.addEventListener(
      'wheel',
      () => {
        window.zoomParityWheelCount += 1
      },
      { capture: true, passive: true },
    )
  })

  async function settled() {
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    )
  }
  async function snapshot(version) {
    return JSON.parse(await page.locator(`#${version}-snapshot`).textContent())
  }
  async function wheel(version, key) {
    const target = page.locator(version === 'v4' ? '#v4-chart .mouse rect' : '#v5-chart svg')
    await target.scrollIntoViewIfNeeded()
    const box = await target.boundingBox()
    assert.ok(box)
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    if (key) await page.keyboard.down(key)
    try {
      const received = await page.evaluate(() => window.zoomParityWheelCount)
      await page.mouse.wheel(0, -100)
      await page.waitForFunction((before) => window.zoomParityWheelCount > before, received)
      await settled()
    } finally {
      if (key) await page.keyboard.up(key)
    }
  }
  async function doubleClick(version) {
    const target = page.locator(version === 'v4' ? '#v4-chart .mouse rect' : '#v5-chart svg')
    await target.dblclick()
    await settled()
  }
  async function restore() {
    await page.locator('#reset').click()
    await settled()
  }
  const span = (domain) => Number(new Date(domain[1])) - Number(new Date(domain[0]))
  const initial = { v4: await snapshot('v4'), v5: await snapshot('v5') }
  const originalSvg = await page.locator('#v5-chart svg').elementHandle()

  for (const mode of ['x', 'y', 'xy']) {
    await page.selectOption('#mode', mode)
    for (const version of ['v4', 'v5']) {
      await restore()
      const before = await snapshot(version)
      await wheel(version)
      const after = await snapshot(version)
      if (mode.includes('x'))
        assert.ok(span(after.time) < span(before.time), `${version} ${mode}: x`)
      else assert.deepEqual(after.time, before.time, `${version}: y-only preserves x`)
      if (mode.includes('y')) {
        assert.ok(
          after.value[1] - after.value[0] < before.value[1] - before.value[0],
          `${version} ${mode}: y`,
        )
      }
      if (version === 'v5') {
        assert.equal(after.valueDomain, mode.includes('y') ? 'manual' : 'visible autoscale')
        assert.match(await page.locator('#v5-status').textContent(), /source: wheel/)
      } else {
        assert.match(
          await page.locator('#v4-status').textContent(),
          new RegExp(`Zoomed: ${mode.toUpperCase()}`),
        )
      }
    }
  }

  for (const [modifier, key] of [
    ['ctrl', 'Control'],
    ['shift', 'Shift'],
  ]) {
    await page.selectOption('#modifier', modifier)
    for (const version of ['v4', 'v5']) {
      await restore()
      const before = await snapshot(version)
      await wheel(version)
      assert.deepEqual(await snapshot(version), before, `${version}: ${modifier} is required`)
      await wheel(version, key)
      assert.ok(span((await snapshot(version)).time) < span(before.time))
    }
  }

  await page.selectOption('#modifier', 'none')
  await page.locator('#wheel-enabled').uncheck()
  for (const version of ['v4', 'v5']) {
    const before = await snapshot(version)
    await wheel(version)
    assert.deepEqual(
      await snapshot(version),
      before,
      `${version}: disabled wheel preserves domains`,
    )
    await doubleClick(version)
    const after = await snapshot(version)
    assert.deepEqual(after.time, initial[version].time, `${version}: disabled wheel still resets`)
    if (version === 'v5') {
      assert.equal(after.valueDomain, 'visible autoscale')
      assert.match(await page.locator('#v5-status').textContent(), /source: reset/)
    } else {
      assert.match(await page.locator('#v4-status').textContent(), /Zoom reset/)
    }
  }

  await page.locator('#wheel-enabled').check()
  await page.selectOption('#reset-mode', 'full')
  for (const version of ['v4', 'v5']) {
    await doubleClick(version)
    assert.ok(
      span((await snapshot(version)).time) > span(initial[version].time),
      `${version}: full reset`,
    )
  }

  await restore()
  await page.selectOption('#reset-mode', 'toggle')
  await wheel('v5')
  const zoomed = await snapshot('v5')
  await doubleClick('v5')
  assert.ok(span((await snapshot('v5')).time) > span(initial.v5.time))
  await doubleClick('v5')
  const toggled = await snapshot('v5')
  assert.deepEqual(toggled.time, zoomed.time, 'v5 toggle restores the pre-reset zoom')
  assert.deepEqual(toggled.value, zoomed.value)
  await doubleClick('v4')
  const v4FirstToggle = await snapshot('v4')
  await doubleClick('v4')
  const v4SecondToggle = await snapshot('v4')
  assert.notDeepEqual(
    v4SecondToggle.value,
    v4FirstToggle.value,
    'v4 toggle alternates numeric extents',
  )

  await page.selectOption('#reset-mode', 'initial')
  await page.selectOption('#mode', 'x')
  const manualY = (await snapshot('v5')).value
  await doubleClick('v5')
  assert.deepEqual((await snapshot('v5')).value, manualY, 'x reset leaves manual y untouched')
  await restore()
  assert.deepEqual((await snapshot('v5')).time, initial.v5.time)
  assert.equal((await snapshot('v5')).valueDomain, 'visible autoscale')
  assert.ok(
    await originalSvg.evaluate((element) => element.isConnected),
    'Options do not recreate the plot',
  )

  await page.setViewportSize({ width: 600, height: 900 })
  await settled()
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    'Mobile layout must not overflow',
  )
  assert.deepEqual(errors, [], 'The example must not emit browser errors')
  console.log(
    'Zoom parity: modes, modifiers, disabled wheel, runtime updates, resets and readouts passed.',
  )
} finally {
  await browser?.close()
  await server.close()
}

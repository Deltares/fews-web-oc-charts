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
  await page.goto(`http://127.0.0.1:${address.port}/examples/v5-legend/`)
  await page.locator('#chart svg').waitFor()

  const selector = (id) => `[data-entry-id="${id}"]`
  const checkbox = (id) => page.locator(`#legend input[type="checkbox"]${selector(id)}`)
  await checkbox('group:Observed').waitFor()
  const path = (markId, layerId) =>
    page.locator(
      layerId
        ? `#chart [data-mark-id="${markId}"] [data-layer-id="${layerId}"]`
        : `#chart [data-mark="line"][data-mark-id="${markId}"]`,
    )
  async function visibility(id, state) {
    await page.waitForFunction(
      ({ selector, state }) =>
        document.querySelector(`#legend ${selector}`)?.closest('.legend-row')?.dataset
          .visibility === state,
      { selector: selector(id), state },
    )
  }
  async function legendEvent(action, source, changedId, state) {
    await page.waitForFunction(
      ({ action, source, changedId, state }) => {
        const status = document.querySelector('#legend-status')?.textContent
        if (!status) return false
        const event = JSON.parse(status)
        return (
          event.action === action &&
          event.source === source &&
          event.changes.some((change) => change.id === changedId && change.visibility === state)
        )
      },
      { action, source, changedId, state },
    )
  }
  async function settled() {
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    )
  }
  async function expectHiddenPath(locator) {
    await page.waitForFunction(
      (element) => element.getAttribute('d') === '',
      await locator.elementHandle(),
    )
  }

  const observedLine = path('observed')
  const observedMarkers = page.locator(
    '#chart [data-mark="markers"][data-mark-id="observed"] [data-mark="marker"]',
  )
  const upstreamArea = path('observed-contributions', 'upstream')
  assert.ok((await observedLine.getAttribute('d'))?.length)
  assert.ok((await observedMarkers.count()) > 0)
  assert.ok((await upstreamArea.getAttribute('d'))?.length)

  await checkbox('observed').click()
  await visibility('observed', 'hidden')
  await legendEvent('toggle', 'external', 'observed', 'hidden')
  await expectHiddenPath(observedLine)
  await page.waitForFunction(
    () =>
      document.querySelectorAll(
        '#chart [data-mark="markers"][data-mark-id="observed"] [data-mark="marker"]',
      ).length === 0,
  )

  const observedCheckbox = checkbox('observed')
  await observedCheckbox.focus()
  await page.keyboard.press('Space')
  await visibility('observed', 'visible')
  await legendEvent('toggle', 'external', 'observed', 'visible')
  assert.ok(await observedCheckbox.evaluate((element) => document.activeElement === element))
  await settled()
  assert.ok((await observedLine.getAttribute('d'))?.length)
  assert.ok((await observedMarkers.count()) > 0)

  const upstreamId = 'observed-contributions::layer:upstream'
  const upstreamCheckbox = checkbox(upstreamId)
  await upstreamCheckbox.focus()
  await page.keyboard.press('Space')
  await visibility(upstreamId, 'hidden')
  await visibility('group:Observed', 'mixed')
  await expectHiddenPath(upstreamArea)
  await legendEvent('toggle', 'external', upstreamId, 'hidden')
  assert.ok(await upstreamCheckbox.evaluate((element) => document.activeElement === element))

  await checkbox('group:Observed').click()
  await visibility('group:Observed', 'visible')
  await visibility(upstreamId, 'visible')
  await legendEvent('toggle', 'external', 'group:Observed', 'visible')

  await checkbox('group:Observed').click()
  await visibility('group:Observed', 'hidden')
  await visibility('observed', 'hidden')
  await visibility(upstreamId, 'hidden')
  await expectHiddenPath(observedLine)
  await page.locator('#show-all').click()
  await visibility('group:Observed', 'visible')
  await visibility('observed', 'visible')
  await visibility(upstreamId, 'visible')
  assert.ok((await observedLine.getAttribute('d'))?.length)

  await page.locator('#toggle-built-in').click()
  const builtInGroup = page.locator('#chart [data-layer="legend"] [data-entry-id="group:Forecast"]')
  await builtInGroup.waitFor()
  await builtInGroup.focus()
  await page.keyboard.press('Enter')
  await page.waitForFunction(
    () =>
      document
        .querySelector('#chart [data-layer="legend"] [data-entry-id="group:Forecast"]')
        ?.getAttribute('data-visibility') === 'hidden',
  )
  await legendEvent('toggle', 'built-in', 'group:Forecast', 'hidden')
  assert.equal(await builtInGroup.getAttribute('aria-pressed'), 'false')

  await page.keyboard.press('Space')
  await page.waitForFunction(
    () =>
      document
        .querySelector('#chart [data-layer="legend"] [data-entry-id="group:Forecast"]')
        ?.getAttribute('data-visibility') === 'visible',
  )
  await legendEvent('toggle', 'built-in', 'group:Forecast', 'visible')
  assert.ok(await builtInGroup.evaluate((element) => document.activeElement === element))

  await page.locator('#legend-groups').uncheck()
  await page.locator('#chart [data-layer="legend"] [data-entry-id="forecast"]').waitFor()
  await page.waitForFunction(
    () => !document.querySelector('#chart [data-layer="legend"] [data-entry-id="group:Forecast"]'),
  )
  await page.locator('#toggle-built-in').click()
  await page.waitForFunction(() => !document.querySelector('#chart [data-layer="legend"]'))
  assert.deepEqual(errors, [], 'The legend example must not emit browser errors')
  console.log(
    'Legend interactions: mark and layer visibility, grouped commands, keyboard activation and built-in cleanup passed.',
  )
} finally {
  await browser?.close()
  await server.close()
}

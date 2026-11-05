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
  await page.goto(`http://127.0.0.1:${address.port}/examples/v5-parity-mouseover/`)
  await page.locator('#all-series svg').waitFor()

  async function settled() {
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    )
  }
  async function hover(id, x = 0.5, y = 0.5) {
    const svg = page.locator(`#${id} svg`)
    const box = await svg.boundingBox()
    assert.ok(box, `#${id} must have a rendered SVG`)
    await page.mouse.move(box.x + box.width * x, box.y + box.height * y)
    await settled()
    const describedBy = (await svg.getAttribute('aria-describedby')) ?? ''
    const tooltipId = describedBy
      .split(/\s+/)
      .find((value) => value.startsWith('fews-chart-tooltip-'))
    assert.ok(tooltipId, `#${id} must reference its tooltip`)
    return {
      tooltip: page.locator(`#${tooltipId}`),
      crosshair: svg.locator('[data-layer="crosshair"]'),
    }
  }
  function expectedY(index, range) {
    const [minimum, maximum] = range
    const factor = (maximum - minimum) / 2
    const offset = minimum + factor
    return factor * Math.sin(Math.PI * (2.8 * (index / 99) + 1.2)) + offset
  }
  function nearestIndex(value, range) {
    const index = Math.round(((value - range[0]) / (range[1] - range[0])) * 99)
    return Math.min(99, Math.max(0, index))
  }

  const all = await hover('all-series')
  const xGuide = all.crosshair.locator('[data-crosshair-axis="x"]')
  await page.waitForFunction(
    (element) => element.getAttribute('display') !== 'none',
    await xGuide.elementHandle(),
  )
  const snappedX = Number(
    await all.crosshair.locator('[data-crosshair-label="x"] text').textContent(),
  )
  assert.ok(Number.isFinite(snappedX), 'The x crosshair must report its snapped sample')
  const firstXIndex = nearestIndex(snappedX, [-4, 10])
  assert.ok(
    Math.abs(-4 + (firstXIndex * 14) / 99 - snappedX) < 1e-9,
    'The x crosshair must snap to the nearest sample on its target mark',
  )
  const allRows = all.tooltip.locator('[data-tooltip-entry]')
  await page.waitForFunction(
    (element) => element.getAttribute('aria-hidden') === 'false',
    await all.tooltip.elementHandle(),
  )
  assert.deepEqual(await allRows.locator('[data-tooltip-label]').allTextContents(), [
    'Example 1',
    'Example 2',
    'Example 3',
  ])
  for (const [index, range] of [
    [
      [-4, 10],
      [-2, 4],
    ],
    [
      [0, 5],
      [-1, 1],
    ],
    [
      [6, 8],
      [2, 3],
    ],
  ].entries()) {
    const sampleIndex = nearestIndex(snappedX, range[0])
    const expected = expectedY(sampleIndex, range[1]).toFixed(3)
    assert.match(
      await allRows.nth(index).textContent(),
      new RegExp(`· ${expected.replace('.', '\\.')}`),
      `Example ${index + 1} must report its nearest x sample`,
    )
  }

  const selected = await hover('selected-series')
  await page.waitForFunction(
    (element) => element.getAttribute('aria-hidden') === 'false',
    await selected.tooltip.elementHandle(),
  )
  assert.deepEqual(
    await selected.tooltip.locator('[data-tooltip-label]').allTextContents(),
    ['Example 1', 'Example 3'],
    'The time-series tooltip must include only selected marks',
  )
  assert.match(
    await selected.crosshair.locator('[data-crosshair-label="x"] text').textContent(),
    /^\d{1,2} [A-Z][a-z]{2} 2025,/,
    'The time x scale must format the snapped coordinate as a date',
  )

  const formatted = await hover('formatted-series')
  await page.waitForFunction(
    (element) => element.getAttribute('aria-hidden') === 'false',
    await formatted.tooltip.elementHandle(),
  )
  const formattedText = await formatted.tooltip.textContent()
  assert.match(formattedText, /x: -?\d+\.\d{2}/, 'Numeric x values must use two decimals')
  assert.match(formattedText, /Value: -?\d+\.\d{2} \(Extent: -3\.00–5\.00\)/)
  assert.match(formattedText, /m\b/, 'The y value must include its configured unit')

  const vertical = await hover('vertical-series', 0.5, 0.43)
  const yGuide = vertical.crosshair.locator('[data-crosshair-axis="y"]')
  await page.waitForFunction(
    (element) => element.getAttribute('display') !== 'none',
    await yGuide.elementHandle(),
  )
  const snappedYText = await vertical.crosshair
    .locator('[data-crosshair-label="y"] text')
    .textContent()
  const snappedY = Number(snappedYText)
  assert.ok(Number.isFinite(snappedY), 'The y crosshair must report its snapped sample')
  // The callout is rounded to the mark's 3 digits.
  const firstSeriesSamples = Array.from({ length: 100 }, (_, index) => expectedY(index, [-2, 4]))
  assert.ok(
    firstSeriesSamples.some((sample) => Number(sample.toFixed(3)) === snappedY),
    `The y-directed crosshair must snap to a sample on its target mark (got ${snappedYText})`,
  )
  await page.waitForFunction(
    (element) => element.getAttribute('aria-hidden') === 'false',
    await vertical.tooltip.elementHandle(),
  )
  assert.deepEqual(
    await vertical.tooltip.locator('[data-tooltip-label]').allTextContents(),
    ['Example 1', 'Example 2', 'Example 3'],
    'Y-directed inspection must report every series',
  )

  assert.deepEqual(errors, [], 'The mouseover parity example must not emit browser errors')
  console.log(
    'Mouseover parity: all/selected series, snapped x/y samples, crosshair guides and formatting passed.',
  )
} finally {
  await browser?.close()
  await server.close()
}

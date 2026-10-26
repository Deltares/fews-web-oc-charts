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

  async function open(route, readySelector) {
    await page.goto(`http://127.0.0.1:${address.port}/examples/${route}/`)
    await page.locator(readySelector).waitFor()
    await page.locator('theme-button input').click()
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    )
  }
  async function hoverChart(id, target = 'svg') {
    const svg = page.locator(`#${id} svg`)
    const mark = page.locator(`#${id} ${target}`)
    await mark.scrollIntoViewIfNeeded()
    const box = await mark.boundingBox()
    assert.ok(box && box.width > 0 && box.height > 0, `#${id} must have rendered hit geometry`)
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.waitForFunction(
      (element) => {
        const id = element
          .getAttribute('aria-describedby')
          ?.split(/\s+/)
          .find((value) => value.startsWith('fews-chart-tooltip-'))
        return id && document.getElementById(id)?.getAttribute('aria-hidden') === 'false'
      },
      await svg.elementHandle(),
    )
    const describedBy = (await svg.getAttribute('aria-describedby')) ?? ''
    const tooltipId = describedBy
      .split(/\s+/)
      .find((value) => value.startsWith('fews-chart-tooltip-'))
    assert.ok(tooltipId, `#${id} must reference its tooltip`)
    return page.locator(`#${tooltipId}`)
  }

  await open('v5-parity-basic-line', '#chart-container svg')
  const lineTooltip = await hoverChart('chart-container')
  assert.match(await lineTooltip.textContent(), /y · -?\d/, 'Line samples must be inspectable')

  await open('v5-parity-marker', '#chart-container svg')
  const markerTooltip = await hoverChart('chart-container')
  assert.match(await markerTooltip.textContent(), /y · -?\d/, 'Marker samples must be inspectable')

  await open('v5-parity-bar', '#chart-container-simple svg')
  const barTooltip = await hoverChart(
    'chart-container-simple',
    '[data-mark="bar-segment"] >> nth=25',
  )
  assert.match(await barTooltip.textContent(), /bounds:/, 'Bar rectangles must report their bounds')
  for (const layer of ['model A', 'model B', 'model C']) {
    const groupedTooltip = await hoverChart(
      'chart-container-grouped',
      `[data-mark="bar-segment"][data-layer-id="${layer}"][data-sample-id="0"]`,
    )
    assert.deepEqual(
      await groupedTooltip.locator('[data-tooltip-label]').allTextContents(),
      ['Mark 1 · model A', 'Mark 1 · model B', 'Mark 1 · model C'],
      'X-directed grouped bar inspection must report every layer in the selected category',
    )
  }

  await open('v5-parity-matrix', '#chart-container-sparsity svg')
  await page.evaluate(async () => {
    const { axis, colorScale, createGrid, createPlot, heatmap, linearScale, tooltip } =
      await import('/src/index.ts')
    const host = document.createElement('div')
    host.id = 'heatmap-hit-fixture'
    host.style.cssText = 'width:480px;height:320px;margin:16px'
    document.body.append(host)
    const mark = heatmap(
      createGrid({
        xEdges: [0, 1, 2],
        yEdges: [0, 1, 2],
        values: [2.5, Number.NaN, 4.25, 6],
      }),
      {
        id: 'matrix-hit-fixture',
        scales: { x: 'x', y: 'y' },
        color: colorScale({ domain: [0, 10], colors: ['blue', 'red'] }),
      },
    )
    createPlot(host, {
      width: 480,
      height: 320,
      scales: { x: linearScale({ domain: [0, 2] }), y: linearScale({ domain: [0, 2] }) },
      axes: [axis('x', { position: 'bottom' }), axis('y', { position: 'left' })],
      marks: [mark],
      plugins: [tooltip({ marks: [mark] })],
    })
  })
  const heatmap = page.locator('#heatmap-hit-fixture svg')
  await heatmap.waitFor()
  const heatmapCell = heatmap.locator('[data-mark="heatmap-cell"][data-index="0"]')
  await heatmapCell.scrollIntoViewIfNeeded()
  const cellBox = await heatmapCell.boundingBox()
  assert.ok(cellBox, 'A finite heatmap cell must render')
  await page.mouse.move(cellBox.x + cellBox.width / 2, cellBox.y + cellBox.height / 2)
  const heatmapTooltipId = (await heatmap.getAttribute('aria-describedby'))
    ?.split(/\s+/)
    .find((value) => value.startsWith('fews-chart-tooltip-'))
  assert.ok(heatmapTooltipId, 'The heatmap must reference its tooltip')
  const heatmapTooltip = page.locator(`#${heatmapTooltipId}`)
  await page.waitForFunction(
    (element) => element.getAttribute('aria-hidden') === 'false',
    await heatmapTooltip.elementHandle(),
  )
  assert.match(await heatmapTooltip.textContent(), /value: 2\.5/)

  const missingCellX = cellBox.x + cellBox.width * 1.5
  const missingCellY = cellBox.y + cellBox.height / 2
  await page.mouse.move(missingCellX, missingCellY)
  await page.waitForFunction(
    (element) => element.getAttribute('aria-hidden') === 'true',
    await heatmapTooltip.elementHandle(),
  )
  assert.equal(
    await heatmapTooltip.locator('[data-tooltip-entry]').count(),
    0,
    'A missing heatmap cell must not produce tooltip hits',
  )

  assert.deepEqual(errors, [], 'Mark-hit parity routes must not emit browser errors')
  console.log(
    'Mark-hit parity: line and marker samples, bar rectangles/layers, finite and missing heatmap cells passed.',
  )
} finally {
  await browser?.close()
  await server.close()
}

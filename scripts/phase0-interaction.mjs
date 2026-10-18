import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { cpus, release } from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { setTimeout as delay } from 'node:timers/promises'
import { createServer } from 'vite'
import { chromium } from 'playwright'

const warmups = 10
const measuredRuns = 30
const steps = 30
const gestureDurationMs = 500
const sustainedDurationMs = 10_000
const traceDirectory = process.env.PHASE0_TRACE_DIR
const server = await createServer({
  configFile: false,
  root: process.cwd(),
  optimizeDeps: {
    entries: ['scripts/phase0-interaction.html'],
    include: ['d3', 'lodash-es', 'luxon'],
  },
  server: { host: '127.0.0.1', port: 0 },
  appType: 'mpa',
})

function percentile95(values) {
  assert.ok(values.length > 0, 'Cannot report a percentile from empty measurements.')
  assert.ok(values.every(Number.isFinite), 'Measurements must be finite.')
  return [...values].sort((left, right) => left - right)[Math.ceil(values.length * 0.95) - 1]
}

async function drag(page, direction, sustained = false) {
  await page.bringToFront()
  await page.evaluate(() => window.interactionFixture.reset())
  const initial = await page.evaluate(() => window.interactionFixture.state())
  assert.deepEqual(initial.domain, [400_000, 600_000])
  assert.deepEqual(initial.yDomain, [-1.25, 1.25])
  assert.ok(initial.path.length > 0, 'The initial chart must have geometry.')
  const startX = 500
  const distance = direction * 120
  await page.mouse.move(startX, 200)
  await page.mouse.down()
  const start = performance.now()
  if (sustained) {
    let index = 0
    while (performance.now() - start < sustainedDurationMs) {
      index += 1
      // Triangular motion stays inside the same data window for the full ten seconds.
      const phase = (index % 120) / 120
      const delta = phase < 0.5 ? phase * 240 : (1 - phase) * 240
      await page.mouse.move(startX + delta, 200)
      await delay(Math.max(0, Math.min(start + (index * 1000) / 60 - performance.now(), 1000 / 60)))
    }
    await page.mouse.move(startX + distance, 200)
  } else {
    for (let index = 1; index <= steps; index += 1) {
      await delay(Math.max(0, start + (index * gestureDurationMs) / steps - performance.now()))
      await page.mouse.move(startX + (distance * index) / steps, 200)
    }
  }
  await page.mouse.up()
  await page.waitForFunction(() => window.interactionFixture.result() !== undefined, undefined, {
    timeout: 30_000,
  })
  const result = await page.evaluate(() => window.interactionFixture.result())
  assert.ok(result, 'The gesture must produce settled metrics.')
  const shift = -(distance / 1000) * 200_000
  for (const [index, expected] of [400_000 + shift, 600_000 + shift].entries()) {
    assert.ok(
      Math.abs(result.finalDomain[index] - expected) < 1e-6,
      'The committed domain must match the drag.',
    )
  }
  assert.ok(result.deliveredMoves >= steps, 'The real pointer path must receive the gesture.')
  assert.ok(result.geometryUpdates > 0, 'The gesture must update visible geometry.')
  if (new URL(page.url()).searchParams.get('implementation') === 'spike') {
    assert.equal(
      result.pathUpdates,
      1,
      'The spike must rebuild geometry once on release, not during preview.',
    )
    assert.ok(result.previewUpdates > 1, 'The spike must exercise its transform preview fast path.')
  } else {
    assert.ok(
      result.pathUpdates >= steps,
      'v4 must exercise its real redraw path during the gesture.',
    )
  }
  const settled = await page.evaluate(() => window.interactionFixture.state())
  assert.equal(settled.preview, false, 'Temporary preview transforms must be removed.')
  assert.notEqual(
    settled.path,
    initial.path,
    'Release must commit newly exposed data, not only transform the old line.',
  )
  await delay(75)
  const idle = await page.evaluate(() => window.interactionFixture.state())
  assert.deepEqual(idle, settled, 'Geometry and domain must remain idle after settling.')
  return result
}

function summary(runs) {
  const frames = runs.flatMap((run) => run.frameIntervalsMs)
  return {
    gestures: runs.length,
    gestureP95Ms: percentile95(runs.map((run) => run.gestureMs)),
    releaseToSettledP95Ms: percentile95(runs.map((run) => run.releaseToSettledMs)),
    frameIntervalP95Ms: percentile95(frames),
    framesOver20Ms: frames.filter((value) => value > 20).length,
    recordedFrameIntervals: frames.length,
    inputToDomUpdateP95Ms: percentile95(runs.flatMap((run) => run.inputToDomUpdateMs)),
    deliveredMoves: runs.reduce((sum, run) => sum + run.deliveredMoves, 0),
    geometryUpdates: runs.reduce((sum, run) => sum + run.geometryUpdates, 0),
    pathUpdates: runs.reduce((sum, run) => sum + run.pathUpdates, 0),
    previewUpdates: runs.reduce((sum, run) => sum + run.previewUpdates, 0),
  }
}

async function diagnosticTrace(page, name) {
  const session = await page.context().newCDPSession(page)
  const complete = new Promise((resolve) => session.once('Tracing.tracingComplete', resolve))
  await session.send('Tracing.start', {
    categories: 'devtools.timeline,blink.user_timing,input,latencyInfo,cc,benchmark',
    transferMode: 'ReturnAsStream',
  })
  await drag(page, 1)
  await session.send('Tracing.end')
  const { stream } = await complete
  assert.ok(stream, 'Chromium must return its diagnostic trace stream.')
  const chunks = []
  let eof = false
  while (!eof) {
    const chunk = await session.send('IO.read', { handle: stream })
    chunks.push(Buffer.from(chunk.data, chunk.base64Encoded ? 'base64' : 'utf8'))
    eof = chunk.eof
  }
  await session.send('IO.close', { handle: stream })
  await session.detach()
  await writeFile(path.join(traceDirectory, `${name}-chromium-trace.json`), Buffer.concat(chunks))
}

let browser
try {
  await server.listen()
  const address = server.httpServer.address()
  assert.ok(address && typeof address !== 'string', 'The benchmark server must have a TCP address.')
  browser = await chromium.launch({ headless: true })
  const pages = {}
  const errors = []
  for (const implementation of ['v4', 'spike']) {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
    })
    page.on('pageerror', (error) => errors.push(`${implementation}: ${error.message}`))
    await page.goto(
      `http://127.0.0.1:${address.port}/scripts/phase0-interaction.html?implementation=${implementation}`,
    )
    await page.waitForFunction(() => window.interactionFixture !== undefined)
    await page.evaluate(() => document.fonts.ready)
    pages[implementation] = page
  }
  const measurements = { v4: [], spike: [] }
  const screenshots = []
  for (let index = 0; index < warmups + measuredRuns; index += 1) {
    const direction = index % 2 === 0 ? 1 : -1
    const order = index % 2 === 0 ? ['v4', 'spike'] : ['spike', 'v4']
    const images = {}
    for (const implementation of order) {
      const page = pages[implementation]
      const result = await drag(page, direction)
      if (index >= warmups) measurements[implementation].push(result)
      if (index === warmups || index === warmups + 1) {
        images[implementation] = await page.locator('#chart').screenshot()
      }
    }
    if (images.v4 && images.spike) {
      const ratio = await pages.spike.evaluate(
        ({ reference, actual }) => window.compareChartScreenshots(reference, actual),
        { reference: images.v4.toString('base64'), actual: images.spike.toString('base64') },
      )
      screenshots.push({ direction, changedPixelRatio: ratio })
      if (traceDirectory) {
        await mkdir(traceDirectory, { recursive: true })
        for (const implementation of ['v4', 'spike']) {
          await writeFile(
            path.join(traceDirectory, `${implementation}-pan-${direction}.png`),
            images[implementation],
          )
        }
      }
    }
    if ((index + 1) % 10 === 0) {
      console.error(`Completed ${index + 1}/${warmups + measuredRuns} paired gestures.`)
    }
  }
  const sustained = {}
  const sustainedSamples = {}
  for (const implementation of ['v4', 'spike']) {
    const result = await drag(pages[implementation], 1, true)
    sustainedSamples[implementation] = result
    sustained[implementation] = summary([result])
  }
  assert.deepEqual(errors, [], 'Neither fixture may emit runtime errors.')
  const report = {
    benchmark: 'Real-input line interactions; axes/grid disabled on both implementations',
    timing:
      'Browser-clock DOM updates, rAF cadence, and two-stable-rAF settling; not exact presentation latency',
    os: process.platform,
    osRelease: release(),
    cpu: cpus()[0]?.model ?? 'unknown',
    logicalCpuCount: cpus().length,
    browser: browser.version(),
    viewport: '1280x720 @ 1x',
    plotSize: '1000x400',
    points: 1_000_000,
    initialDomain: [400_000, 600_000],
    warmups,
    measuredRuns,
    requestedGestureDurationMs: gestureDurationMs,
    stepsPerGesture: steps,
    screenshots,
    visualGate: {
      maximumChangedPixelRatio: 0.001,
      passed: screenshots.every((screenshot) => screenshot.changedPixelRatio <= 0.001),
    },
    measured: { v4: summary(measurements.v4), spike: summary(measurements.spike) },
    sustained: { requestedDurationMs: sustainedDurationMs, ...sustained },
  }
  console.log(JSON.stringify(report, null, 2))
  if (traceDirectory) {
    await mkdir(traceDirectory, { recursive: true })
    await writeFile(
      path.join(traceDirectory, 'interaction-results.json'),
      JSON.stringify({ ...report, measuredSamples: measurements, sustainedSamples }, null, 2),
    )
    for (const implementation of ['v4', 'spike']) {
      await diagnosticTrace(pages[implementation], implementation)
    }
    assert.deepEqual(errors, [], 'Diagnostic gestures must not emit runtime errors.')
  }
  for (const screenshot of screenshots) {
    assert.ok(
      screenshot.changedPixelRatio <= 0.001,
      `Settled chart screenshots differ by ${(screenshot.changedPixelRatio * 100).toFixed(4)}%; limit 0.1%.`,
    )
  }
} finally {
  await browser?.close()
  await server.close()
}

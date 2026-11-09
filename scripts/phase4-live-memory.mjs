import assert from 'node:assert/strict'
import { cpus, release } from 'node:os'
import { createServer } from 'vite'
import { chromium } from 'playwright'

const MiB = 1024 * 1024
const budgets = {
  lineRetainedBytes: 20 * MiB,
  compositeRetainedBytes: 32 * MiB,
  plateauGrowthBytes: MiB,
  plateauSpreadBytes: 2 * MiB,
  cleanupBytes: MiB,
}
const server = await createServer({
  configFile: false,
  root: process.cwd(),
  optimizeDeps: {
    entries: ['scripts/phase4-live-memory.html'],
    include: ['d3', 'lodash-es', 'luxon'],
  },
  server: { host: '127.0.0.1', port: 0 },
  appType: 'mpa',
})
let browser
const results = []
try {
  await server.listen()
  const address = server.httpServer.address()
  assert(address && typeof address !== 'string', 'Vite did not provide a TCP address.')
  browser = await chromium.launch({ headless: true })
  for (const fixture of ['line', 'composites']) {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 1,
    })
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(`http://127.0.0.1:${address.port}/scripts/phase4-live-memory.html`)
    await page.waitForFunction(() => !!window.phase4Memory)
    await page.evaluate(() => document.fonts.ready)
    const session = await page.context().newCDPSession(page)
    await session.send('HeapProfiler.enable')
    const measure = async (gc = true) => {
      if (gc) await session.send('HeapProfiler.collectGarbage')
      const usage = await session.send('Runtime.getHeapUsage')
      assert(Number.isFinite(usage.backingStorageSize), 'CDP did not report backing-store memory.')
      return {
        heapBytes: usage.usedSize,
        backingBytes: usage.backingStorageSize,
        totalBytes: usage.usedSize + usage.backingStorageSize,
      }
    }
    // Warm module/JIT paths before taking the empty-plot baseline.
    await page.evaluate(async (kind) => {
      await window.phase4Memory.empty(kind)
      await window.phase4Memory.populate()
      await window.phase4Memory.warm()
      await window.phase4Memory.advance(128)
      await window.phase4Memory.empty(kind)
    }, fixture)
    const baseline = await measure()
    await page.evaluate(async () => {
      await window.phase4Memory.populate()
      await window.phase4Memory.warm()
    })
    const occupied = await measure()
    const retainedBytes = occupied.totalBytes - baseline.totalBytes
    const samples = []
    let accounting
    let observedPreGcHighWaterBytes = 0
    await page.evaluate(() => window.phase4Memory.advance(128))
    for (let sample = 0; sample < 6; sample += 1) {
      accounting = await page.evaluate(() => window.phase4Memory.advance(128))
      const preGc = await measure(false)
      observedPreGcHighWaterBytes = Math.max(observedPreGcHighWaterBytes, preGc.totalBytes)
      samples.push(await measure())
    }
    const plateau = samples.map((sample) => sample.totalBytes)
    const growth = plateau.at(-1) - plateau[0]
    const spread = Math.max(...plateau) - Math.min(...plateau)
    const dom = await session.send('Memory.getDOMCounters')
    await page.evaluate(() => window.phase4Memory.destroy())
    const cleaned = await measure()
    const result = {
      fixture,
      baseline,
      occupied,
      retainedBytes,
      samples,
      plateauGrowthBytes: growth,
      plateauSpreadBytes: spread,
      cleanupGrowthBytes: cleaned.totalBytes - baseline.totalBytes,
      observedPreGcHighWaterBytes,
      accounting,
      dom,
    }
    results.push(result)
    console.log(JSON.stringify(result, null, 2))
    assert.deepEqual(errors, [], 'The browser fixture reported errors.')
    const retainedBudget =
      fixture === 'line' ? budgets.lineRetainedBytes : budgets.compositeRetainedBytes
    assert(
      retainedBytes < retainedBudget,
      `${fixture}: retained memory exceeded ${retainedBudget} bytes.`,
    )
    assert(
      plateau.every((bytes) => bytes - baseline.totalBytes < retainedBudget),
      `${fixture}: live retained budget exceeded.`,
    )
    assert(growth <= budgets.plateauGrowthBytes, `${fixture}: post-warmup memory kept growing.`)
    assert(spread <= budgets.plateauSpreadBytes, `${fixture}: post-warmup memory did not plateau.`)
    assert(
      cleaned.totalBytes - baseline.totalBytes <= budgets.cleanupBytes,
      `${fixture}: destroy retained fixture resources.`,
    )
    await page.close()
  }
  console.log(
    JSON.stringify(
      {
        status: 'passed',
        browser: browser.version(),
        os: process.platform,
        osRelease: release(),
        cpu: cpus()[0]?.model,
        viewport: '1280x720 @ 1x',
        budgets,
        accounting:
          'Post-GC JS heap plus CDP backing stores; native SVG memory is not included. DOM counts and path characters are separate proxies, not native byte measurements. Pre-GC high-water samples are not a true allocation peak. Canonical-growth peaks and full sync/live acceptance remain separate.',
        fixtures: results.length,
      },
      null,
      2,
    ),
  )
} finally {
  await browser?.close()
  await server.close()
}

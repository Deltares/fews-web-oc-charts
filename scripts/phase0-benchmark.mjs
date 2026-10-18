import { createServer } from 'vite'
import { chromium } from 'playwright'
import { cpus, release } from 'node:os'

const server = await createServer({
  configFile: false,
  root: process.cwd(),
  optimizeDeps: {
    entries: ['scripts/phase0-benchmark.html'],
    include: ['d3'],
  },
  server: { host: '127.0.0.1', port: 0 },
  appType: 'mpa',
})

let browser
try {
  await server.listen()
  const address = server.httpServer.address()
  if (!address || typeof address === 'string') {
    throw new Error('Vite did not provide a TCP address for the benchmark server.')
  }

  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  })
  await page.goto(`http://127.0.0.1:${address.port}/scripts/phase0-benchmark.html`)
  await page.addStyleTag({
    content:
      '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}',
  })
  await page.evaluate(() => document.fonts.ready)

  const memorySession = await page.context().newCDPSession(page)
  await memorySession.send('HeapProfiler.enable')
  await memorySession.send('HeapProfiler.collectGarbage')
  const emptyPlotMemory = await memorySession.send('Runtime.getHeapUsage')
  const memoryFixture = await page.evaluate(() => globalThis.runPhase0MemoryProbe())
  await memorySession.send('HeapProfiler.collectGarbage')
  const occupiedPlotMemory = await memorySession.send('Runtime.getHeapUsage')
  const incrementalHeapBytes = occupiedPlotMemory.usedSize - emptyPlotMemory.usedSize
  const incrementalArrayBufferBytes =
    occupiedPlotMemory.backingStorageSize - emptyPlotMemory.backingStorageSize
  const retainedMemoryBytes = incrementalHeapBytes + incrementalArrayBufferBytes

  const result = await page.evaluate(() => globalThis.runPhase0Benchmark())
  console.log(
    JSON.stringify(
      {
        benchmark:
          'Renderer microbenchmark; excludes real input, scheduling, paint and final commit',
        os: process.platform,
        osRelease: release(),
        cpu: cpus()[0]?.model ?? 'unknown',
        logicalCpuCount: cpus().length,
        browser: browser.version(),
        viewport: '1280x720 @ 1x',
        memoryFixture,
        incrementalHeapBytes,
        incrementalArrayBufferBytes,
        retainedMemoryMiB: retainedMemoryBytes / (1024 * 1024),
        ...result,
      },
      null,
      2,
    ),
  )

  if (result.speedup < 5) {
    throw new Error(
      `Renderer microbenchmark target missed: expected at least 5x, measured ${result.speedup.toFixed(2)}x.`,
    )
  }
  if (result.spikePanP95Ms >= 8) {
    throw new Error(
      `Phase 0 pan budget missed: expected under 8 ms, measured ${result.spikePanP95Ms.toFixed(2)} ms.`,
    )
  }
  if (result.changedPixelRatio > 0.001) {
    throw new Error(
      `Pan output differs by ${(result.changedPixelRatio * 100).toFixed(4)}%; the limit is 0.1%.`,
    )
  }
  if (retainedMemoryBytes >= 20 * 1024 * 1024) {
    throw new Error(
      `Phase 0 retained-memory budget missed: expected under 20 MiB, measured ${(retainedMemoryBytes / (1024 * 1024)).toFixed(2)} MiB.`,
    )
  }
} finally {
  await browser?.close()
  await server.close()
}

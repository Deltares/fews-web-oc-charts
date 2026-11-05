// Production sync/live acceptance (PLAN-v5 Phase 4, step 6) for examples/v5-live-stream/.
// Usage: npm run test:live:stream [-- --url http://127.0.0.1:5199]
import { cpus, release } from 'node:os'
import { chromium } from 'playwright'
import { createServer } from 'vite'
import { budgets, runLiveStreamScenario } from './phase4-live-stream-scenario.mjs'

const urlFlag = process.argv.indexOf('--url')
const externalUrl = urlFlag >= 0 ? process.argv[urlFlag + 1] : undefined
let server
let browser
try {
  let baseUrl = externalUrl
  if (!baseUrl) {
    process.env.NODE_ENV = 'development'
    server = await createServer({
      configFile: 'vite-examples.config.ts',
      server: { host: '127.0.0.1', port: 0 },
    })
    await server.listen()
    const address = server.httpServer.address()
    if (!address || typeof address === 'string') throw new Error('Vite did not provide a port.')
    baseUrl = `http://127.0.0.1:${address.port}`
  }
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ deviceScaleFactor: 1 })
  const results = await runLiveStreamScenario(page, {
    baseUrl,
    log: (message) => console.error(`ok - ${message}`),
  })
  console.log(JSON.stringify(results, null, 2))
  console.log(
    JSON.stringify(
      {
        status: 'passed',
        browser: browser.version(),
        os: process.platform,
        osRelease: release(),
        cpu: cpus()[0]?.model,
        viewport: '1280x1200 @ 1x (detail moved off-screen by shrinking the height)',
        budgets,
        accounting:
          'Computation: canonical series/table bytes and stack/LOD cache entries and bytes. Rendering: DOM nodes, paths, rectangles and path characters. Memory: post-GC CDP JS heap plus backing stores; native SVG/DOM memory is not included and DOM counts are proxies.',
      },
      null,
      2,
    ),
  )
} finally {
  await browser?.close()
  await server?.close()
}

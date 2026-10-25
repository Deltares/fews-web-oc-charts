import { createServer } from 'vite'
import { chromium, firefox, webkit } from 'playwright'
import path from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'

const root = process.cwd()
const fixtures = [
  { name: 'basic-line', hosts: ['chart-container', 'chart-container-time'] },
  { name: 'range', hosts: ['chart-container'] },
  { name: 'marker', hosts: ['chart-container', 'chart-container-skip'] },
  { name: 'area', hosts: ['chart-container', 'chart-container-step'] },
  { name: 'chart-text', hosts: ['chart-container'] },
  { name: 'reverse', hosts: ['chart-container', 'chart-container-time'] },
  { name: 'polar-line-marker', hosts: ['chart-container'] },
  { name: 'polar-range', hosts: ['chart-container-solid', 'chart-container-mapped'] },
  {
    name: 'polar-axes-options',
    hosts: [
      'chart-container-1-1',
      'chart-container-1-2',
      'chart-container-1-3',
      'chart-container-2-1',
      'chart-container-2-2',
      'chart-container-2-3',
    ],
  },
  {
    name: 'bar',
    hosts: ['chart-container-simple', 'chart-container-colormapped', 'chart-container-grouped'],
  },
  {
    name: 'matrix',
    hosts: ['chart-container-sparsity', 'chart-container-availability', 'chart-container-time'],
  },
]
const engines = { chromium, firefox, webkit }
const requested = (process.env.VISUAL_BROWSERS ?? 'chromium,firefox,webkit').split(',')
if (!requested.length || requested.some((name) => !Object.hasOwn(engines, name))) {
  throw new Error('VISUAL_BROWSERS must contain chromium, firefox and/or webkit.')
}
const server = await createServer({
  configFile: false,
  root,
  resolve: {
    alias: {
      '@lib': path.join(root, 'src'),
      '@shared': path.join(root, 'examples/shared'),
    },
  },
  server: { host: '127.0.0.1', port: 0, watch: null, hmr: false },
  appType: 'mpa',
})
const failures = []
try {
  await server.listen()
  const address = server.httpServer.address()
  if (!address || typeof address === 'string') throw new Error('Missing Vite TCP address.')
  const baseUrl = `http://127.0.0.1:${address.port}`
  for (const name of requested) {
    const browser = await engines[name].launch()
    try {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        deviceScaleFactor: 1,
        locale: 'en-US',
        timezoneId: 'UTC',
        colorScheme: 'light',
        reducedMotion: 'reduce',
      })
      const page = await context.newPage()
      const errors = []
      page.on('pageerror', (error) => errors.push(error.message))
      for (const fixture of fixtures) {
        for (const dark of [false, true]) {
          const images = []
          for (const prefix of ['', 'v5-parity-']) {
            errors.length = 0
            await page.goto(`${baseUrl}/examples/${prefix}${fixture.name}/`, {
              waitUntil: 'networkidle',
            })
            await page.evaluate(async (dark) => {
              document.documentElement.classList.toggle('dark', dark)
              await document.fonts.ready
              await new Promise((resolve) =>
                window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)),
              )
              await new Promise((resolve, reject) => {
                const limit = window.setTimeout(() => {
                  observer.disconnect()
                  reject(new Error('The static example did not settle within 10 seconds.'))
                }, 10000)
                let quiet
                const done = () => {
                  window.clearTimeout(limit)
                  observer.disconnect()
                  resolve()
                }
                const observer = new MutationObserver(() => {
                  window.clearTimeout(quiet)
                  quiet = window.setTimeout(done, 100)
                })
                observer.observe(document.body, {
                  attributes: true,
                  childList: true,
                  characterData: true,
                  subtree: true,
                })
                quiet = window.setTimeout(done, 100)
              })
            }, dark)
            if (errors.length) throw new Error(errors.join('\n'))
            // Force a full repaint: incremental repaints during animated v4 draws can
            // leave Chromium anti-aliasing that differs from a one-pass paint.
            await page.evaluate(async (hosts) => {
              const frames = () =>
                new Promise((resolve) =>
                  window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)),
                )
              const svgs = hosts.map((id) => document.querySelector(`#${id} svg`))
              for (const svg of svgs) svg.style.visibility = 'hidden'
              await frames()
              for (const svg of svgs) svg.style.visibility = ''
              await frames()
            }, fixture.hosts)
            const shots = []
            for (const id of fixture.hosts) {
              shots.push(await page.locator(`#${id} svg`).screenshot({ animations: 'disabled' }))
            }
            images.push(shots)
          }
          for (let index = 0; index < fixture.hosts.length; index++) {
            const reference = images[0][index]
            const actual = images[1][index]
            const difference = await page.evaluate(
              async ([reference, actual]) => {
                const decode = async (base64) => {
                  const image = new window.Image()
                  image.src = `data:image/png;base64,${base64}`
                  await image.decode()
                  const canvas = document.createElement('canvas')
                  canvas.width = image.naturalWidth
                  canvas.height = image.naturalHeight
                  const context = canvas.getContext('2d')
                  if (!context) throw new Error('Missing screenshot comparison context.')
                  context.drawImage(image, 0, 0)
                  return {
                    width: canvas.width,
                    height: canvas.height,
                    data: context.getImageData(0, 0, canvas.width, canvas.height).data,
                  }
                }
                const left = await decode(reference)
                const right = await decode(actual)
                if (left.width !== right.width || left.height !== right.height)
                  return 'different dimensions'
                let changed = 0
                for (let pixel = 0; pixel < left.data.length; pixel += 4) {
                  if (
                    [0, 1, 2, 3].some(
                      (channel) => left.data[pixel + channel] !== right.data[pixel + channel],
                    )
                  )
                    changed++
                }
                return changed
              },
              [reference.toString('base64'), actual.toString('base64')],
            )
            const label = `${name}/${fixture.name}/${fixture.hosts[index]}/${dark ? 'dark' : 'light'}`
            console.log(`${label}: ${difference} changed pixels`)
            if (difference !== 0) {
              const output = path.join(os.tmpdir(), 'fews-static-parity', label)
              await mkdir(output, { recursive: true })
              await writeFile(path.join(output, 'v4.png'), reference)
              await writeFile(path.join(output, 'v5.png'), actual)
              failures.push(`${label}: ${difference}; screenshots: ${output}`)
            }
          }
        }
      }
    } finally {
      await browser.close()
    }
  }
} finally {
  await server.close()
}
if (failures.length) throw new Error(`Static parity failed:\n${failures.join('\n')}`)

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createServer } from 'vite'
import { chromium, firefox, webkit } from 'playwright'

const root = process.cwd()
const fixtures = [
  { name: 'basic-line', route: '/examples/v5-basic-line/', selector: '#chart' },
  { name: 'shared-scales', route: '/examples/v5-shared-scales/', selector: '#overview' },
  { name: 'civil-time-spring', route: '/examples/v5-time-axes/', selector: '#plot' },
  {
    name: 'civil-time-fall',
    route: '/examples/v5-time-axes/',
    selector: '#plot',
    period: 'fall',
    statusIncludes: '2026-10-25',
  },
  ...['svg', 'canvas'].flatMap((renderer) => [
    ...['grouped', 'stacked', 'named', 'horizontal'].map((kind) => ({
      name: `${kind}-bars-${renderer}`,
      route: `/examples/v5-bars/?renderer=${renderer}`,
      selector: `#${kind}`,
    })),
    ...['implicit', 'named'].map((kind) => ({
      name: `${kind}-areas-${renderer}`,
      route: `/examples/v5-stacked-area/?renderer=${renderer}`,
      selector: `#${kind}`,
    })),
    {
      name: `named-areas-step-restacked-${renderer}`,
      route: `/examples/v5-stacked-area/?renderer=${renderer}`,
      selector: '#named',
      restack: true,
    },
  ]),
]
const computedStyleProperties = [
  'display',
  'width',
  'height',
  'overflow',
  'background-color',
  'background-image',
  'background-position',
  'background-repeat',
  'background-size',
  'color',
  'font-family',
  'font-size',
  'font-weight',
  'line-height',
  'color-scheme',
  'letter-spacing',
  'word-spacing',
  'text-rendering',
  'shape-rendering',
]
const browserTypes = { chromium, firefox, webkit }
const requestedBrowsers = process.env.VISUAL_BROWSERS?.split(',')
  .map((name) => name.trim())
  .filter(Boolean) ?? ['chromium', 'firefox', 'webkit']
const update = process.argv.includes('--update')
const maxChangedPixelRatio = 0.001
const channelThreshold = 2
const viewport = { width: 1280, height: 720 }

if (requestedBrowsers.length === 0) {
  throw new Error('VISUAL_BROWSERS must select at least one browser.')
}
for (const name of requestedBrowsers) {
  if (!Object.hasOwn(browserTypes, name)) {
    throw new Error(`Unknown visual-test browser "${name}".`)
  }
}

function normalizeSvg(markup) {
  return markup.replaceAll(/fews-plot-clip-\d+/g, 'fews-visual-clip')
}

async function waitForStablePlot(page, selector) {
  await page.locator(`${selector} svg.fews-chart`).waitFor({ state: 'visible' })
  await page.waitForFunction((hostSelector) => {
    const svg = document.querySelector(`${hostSelector} svg.fews-chart`)
    const axes = svg?.querySelector('[data-layer="axes"]')
    return (
      svg?.getAttribute('width') !== '0' &&
      svg?.getAttribute('height') !== '0' &&
      axes?.children.length
    )
  }, selector)
  await page.evaluate(async () => {
    await document.fonts.ready
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  })
}

async function screenshotPixels(page, selector) {
  return page.locator(`${selector} svg.fews-chart`).screenshot({
    animations: 'disabled',
    caret: 'hide',
  })
}

async function comparePixels(page, expectedPng, actualPng) {
  return page.evaluate(
    async ({ expected, actual, channelDelta }) => {
      const decode = async (bytes) => {
        const image = new Image()
        image.src = `data:image/png;base64,${bytes}`
        await image.decode()
        const canvas = document.createElement('canvas')
        canvas.width = image.naturalWidth
        canvas.height = image.naturalHeight
        const context = canvas.getContext('2d')
        if (!context) throw new Error('A 2D context is required for visual comparison.')
        context.drawImage(image, 0, 0)
        return {
          width: canvas.width,
          height: canvas.height,
          pixels: context.getImageData(0, 0, canvas.width, canvas.height).data,
        }
      }
      const reference = await decode(expected)
      const current = await decode(actual)
      if (reference.width !== current.width || reference.height !== current.height) {
        throw new Error(
          `Visual fixture dimensions differ: expected ${reference.width}x${reference.height}, got ${current.width}x${current.height}.`,
        )
      }
      const { changedPixelRatio } = await import('/scripts/benchmark-pixels.ts')
      return changedPixelRatio(reference.pixels, current.pixels, channelDelta)
    },
    {
      expected: expectedPng.toString('base64'),
      actual: actualPng.toString('base64'),
      channelDelta: channelThreshold,
    },
  )
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

try {
  await server.listen()
  const address = server.httpServer.address()
  if (!address || typeof address === 'string') {
    throw new Error('Vite did not provide a TCP address for visual regression tests.')
  }
  const baseUrl = `http://127.0.0.1:${address.port}`

  for (const browserName of requestedBrowsers) {
    const browserType = browserTypes[browserName]
    const browser = await browserType.launch({ headless: true, timeout: 30_000 })
    try {
      const page = await browser.newPage({ viewport, deviceScaleFactor: 1 })
      await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
      const pageErrors = []
      page.on('pageerror', (error) => {
        pageErrors.push(error)
      })

      for (const fixture of fixtures) {
        pageErrors.length = 0
        await page.goto(`${baseUrl}${fixture.route}`, { waitUntil: 'networkidle' })
        await page.addStyleTag({
          content:
            '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}',
        })
        await waitForStablePlot(page, fixture.selector)
        if (fixture.restack) {
          await page.locator('#lateral').uncheck()
          await page.locator('#step').check()
          await waitForStablePlot(page, fixture.selector)
        }

        const baselinePath = path.join(
          root,
          'test/visual/baselines',
          browserName,
          `${fixture.name}.svg`,
        )
        if (fixture.period) {
          await page.locator('#period').selectOption(fixture.period)
          await page.waitForFunction((statusText) => {
            const status = document.querySelector('#status')
            return status?.textContent?.includes(statusText)
          }, fixture.statusIncludes)
          await waitForStablePlot(page, fixture.selector)
        }

        const actualMarkup = normalizeSvg(
          await page
            .locator(`${fixture.selector} svg.fews-chart`)
            .evaluate((svg, styleProperties) => {
              const snapshot = svg.cloneNode(true)
              const computed = getComputedStyle(svg)
              for (const property of styleProperties) {
                snapshot.style.setProperty(property, computed.getPropertyValue(property))
              }
              const canvases = svg.querySelectorAll('foreignObject canvas')
              snapshot.querySelectorAll('foreignObject').forEach((foreign, index) => {
                const canvas = canvases[index]
                if (!(canvas instanceof HTMLCanvasElement))
                  throw new Error('Missing canvas for visual snapshot.')
                const image = document.createElementNS('http://www.w3.org/2000/svg', 'image')
                for (const attribute of ['x', 'y', 'width', 'height']) {
                  image.setAttribute(attribute, foreign.getAttribute(attribute) ?? '0')
                }
                image.setAttribute('href', canvas.toDataURL('image/png'))
                foreign.replaceWith(image)
              })
              return new XMLSerializer().serializeToString(snapshot)
            }, computedStyleProperties),
        )
        if (update) {
          await mkdir(path.dirname(baselinePath), { recursive: true })
          await writeFile(baselinePath, `${actualMarkup}\n`)
        }

        let expectedMarkup
        try {
          expectedMarkup = await readFile(baselinePath, 'utf8')
        } catch (error) {
          if (error.code !== 'ENOENT') throw error
          throw new Error(
            `Missing ${browserName} visual baseline for ${fixture.name}; run VISUAL_BROWSERS=${browserName} npm run test:visual:update and review the generated fixtures.`,
          )
        }

        const actualPng = await screenshotPixels(page, fixture.selector)
        await page.evaluate(
          ({ hostSelector, markup }) => {
            const host = document.querySelector(hostSelector)
            if (!host) throw new Error(`Missing visual fixture host "${hostSelector}".`)
            const template = document.createElement('template')
            template.innerHTML = markup
            const baseline = template.content.firstElementChild
            if (!(baseline instanceof SVGSVGElement)) {
              throw new Error('Visual baseline must contain an SVG element.')
            }
            const original = host.querySelector('svg.fews-chart')
            if (!original) throw new Error('Visual fixture chart was removed before comparison.')
            original.replaceWith(baseline)
            window.__phase1VisualOriginalSvg = original
          },
          { hostSelector: fixture.selector, markup: expectedMarkup },
        )
        let referencePng
        try {
          referencePng = await screenshotPixels(page, fixture.selector)
        } finally {
          await page.evaluate((hostSelector) => {
            const host = document.querySelector(hostSelector)
            const baseline = host?.querySelector('svg.fews-chart')
            const original = window.__phase1VisualOriginalSvg
            if (!host || !baseline || !original) {
              throw new Error('Could not restore the live visual fixture after comparison.')
            }
            baseline.replaceWith(original)
            delete window.__phase1VisualOriginalSvg
          }, fixture.selector)
        }

        const changedRatio = await comparePixels(page, referencePng, actualPng)
        if (pageErrors.length) throw pageErrors[0]
        console.log(
          `${browserName} ${fixture.name}: ${(changedRatio * 100).toFixed(4)}% changed pixels`,
        )
        if (changedRatio > maxChangedPixelRatio) {
          throw new Error(
            `${browserName} ${fixture.name} changed ${(changedRatio * 100).toFixed(4)}% of pixels; the limit is ${maxChangedPixelRatio * 100}%.`,
          )
        }
      }
      await page.close()
    } finally {
      await browser.close()
    }
  }
} finally {
  await server.close()
}

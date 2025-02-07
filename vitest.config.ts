import { type ViteUserConfig, defineConfig } from 'vitest/config'

type TestConfig = NonNullable<ViteUserConfig['test']>
type BrowserConfig = NonNullable<TestConfig['browser']>
type BrowserInstanceConfig = NonNullable<BrowserConfig['instances']>[number]

function getBrowserInstances(mode: string): BrowserInstanceConfig[] {
  if (mode !== 'test' && mode !== 'all-browsers') {
    throw new Error(`Unknown test mode "${mode}".`)
  }
  // Run test suite with all browsers in Playwright when running in "all-browsers"
  // mode, otherwise, only run in chromium.
  // FIXME: currently, "webkit" requires many extra dependencies to be installed
  //        in the runner for the CI, so only use chromium and firefox for now.
  const browsers = mode === 'all-browsers' ? ['chromium', 'firefox'] : ['chromium']
  return browsers.map((browser) => ({ browser }))
}

export default defineConfig((configEnv) => {
  return {
    test: {
      browser: {
        enabled: true,
        screenshotFailures: false,
        provider: 'playwright',
        headless: true,
        api: 5174,
        instances: getBrowserInstances(configEnv.mode),
      },
    },
  }
})

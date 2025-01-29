import { type ViteUserConfig, defineConfig } from 'vitest/config'

type TestConfig = NonNullable<ViteUserConfig['test']>
type BrowserConfig = NonNullable<TestConfig['browser']>
type BrowserInstanceConfig = NonNullable<BrowserConfig['instances']>[number]

function getBrowserInstances(mode: string): BrowserInstanceConfig[] {
  if (mode !== 'test' && mode !== 'full-test') {
    throw new Error(`Unknown test mode "${mode}".`)
  }
  // Run test suite with all browsers in Playwright when running in "full-test"
  // mode, otherwise, only run in chromium.
  const browsers =
    mode === 'full-test' ? ['chromium', 'firefox', 'webkit'] : ['chromium']
  return browsers.map(browser => ({ browser }))
}

export default defineConfig(configEnv => {
  return {
    test: {
      browser: {
        enabled: true,
        screenshotFailures: false,
        provider: 'playwright',
        headless: true,
        api: 5174,
        instances: getBrowserInstances(configEnv.mode)
      }
    }
  }
})

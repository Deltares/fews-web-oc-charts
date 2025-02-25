import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const currentDir = process.cwd()
const currentScriptDir = path.dirname(new URL(import.meta.url).pathname)

// Loop through all folders in the examples directory and get all index.html files
const folders = fs
  .readdirSync(currentScriptDir)
  .filter((file) =>
    fs.statSync(path.join(currentScriptDir, file)).isDirectory(),
  )

const htmlFiles = folders
  .map((folder) => {
    const folderPath = path.join(currentScriptDir, folder)
    const files = fs.readdirSync(folderPath)
    return files
      .filter((file) => file === 'index.html')
      .map((file) => path.join(folderPath, file))
  })
  .flat()

// Run tests for each index.html file
htmlFiles.forEach((file) => {
  const relativeFilePath = path.relative(currentScriptDir, file)
  test(`${relativeFilePath} test`, async ({ page }, testInfo) => {
    await page.goto(`/examples/${relativeFilePath}`)
    await page.setViewportSize({ width: 800, height: 600 })

    // const element = page.locator('#chart-container')
    const elements = page.locator('.chart-container')
    const elementsCount = await elements.count()
    let texts = []

    for (let index = 0; index < elementsCount; index++) {
      const element = await elements.nth(index)
      await expect(element).toHaveScreenshot(
        `${relativeFilePath}-${index}-light.png`,
      )
    }

    const themeButton = page.locator('theme-button')
    const themeButtonExists = await themeButton.count()
    if (themeButtonExists === 0) {
      test.skip('Theme button not found, skipping dark mode tests')
      return
    }

    await themeButton.click()

    for (let index = 0; index < elementsCount; index++) {
      const element = await elements.nth(index)
      await expect(element).toHaveScreenshot(
        `${relativeFilePath}-${index}-dark.png`,
      )
    }
  })
})

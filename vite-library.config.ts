import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    lib: {
      entry: resolveRelativePath('src/index.ts'),
      // Only build ES module.
      formats: ['es'],
      name: 'fews-web-oc-charts',
      fileName: 'fews-web-oc-charts',
    },
  },
})

function resolveRelativePath(relative: string): string {
  return resolve(__dirname, relative)
}

import { resolve } from 'path'
import { defineConfig } from 'vite'

import rollupPluginTypescript from '@rollup/plugin-typescript'

export default defineConfig({
  build: {
    lib: {
      entry: resolveRelativePath('src/index.ts'),
      // Only build ES module.
      formats: ['es'],
      name: 'fews-web-oc-charts',
      fileName: 'fews-web-oc-charts',
    },
    rollupOptions: {
      plugins: [
        rollupPluginTypescript({
          allowImportingTsExtensions: false,
          declaration: true,
          declarationDir: resolveRelativePath('dist'),
          rootDir: resolveRelativePath('src'),
        }),
      ],
    },
  },
})

function resolveRelativePath(relative: string): string {
  return resolve(__dirname, relative)
}

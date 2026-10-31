import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import pkg from './package.json' with { type: 'json' }

const dependencies = Object.keys(pkg.dependencies)

export default defineConfig({
  build: {
    lib: {
      entry: resolveRelativePath('src/index.ts'),
      // Only build ES module.
      formats: ['es'],
      name: 'fews-web-oc-charts',
    },
    rolldownOptions: {
      // Keep dependencies (and their subpaths) external so consumers can share and tree-shake them.
      external: (id) => dependencies.some((dep) => id === dep || id.startsWith(`${dep}/`)),
      output: {
        // Emit one module per source file so unused modules can be tree-shaken.
        preserveModules: true,
        preserveModulesRoot: 'src',
        entryFileNames: '[name].js',
      },
    },
  },
})

function resolveRelativePath(relative: string): string {
  return resolve(import.meta.dirname, relative)
}

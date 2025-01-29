import { resolve } from 'path'
import { defineConfig } from 'vite'


export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        "alertlines": resolveRelativePath('examples/alertLines/index.html'),
      }
    }
  },
})

function resolveRelativePath(relative: string): string {
  return resolve(__dirname, relative)
}

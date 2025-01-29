import { resolve } from 'path'
import { defineConfig } from 'vite'


export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        "alertlines": resolveRelativePath('examples/alertLines/index.html'),
        "availability": resolveRelativePath('examples/availability/index.html'),
        "chart-text": resolveRelativePath('examples/chart-text/index.html'),
        "colourbar": resolveRelativePath('examples/colourbar/index.html'),
        "ensemble": resolveRelativePath('examples/ensemble/index.html'),
        "ensemblezoom": resolveRelativePath('examples/ensemblezoom/index.html'),
        "escalation-levels": resolveRelativePath('examples/escalation-levels/index.html'),
        "extent-filter": resolveRelativePath('examples/extent-filter/index.html'),
      }
    }
  },
})

function resolveRelativePath(relative: string): string {
  return resolve(__dirname, relative)
}

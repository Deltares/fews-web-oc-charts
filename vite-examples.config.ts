import { resolve } from 'path'
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        'alert-lines': resolveRelativePath('examples/alert-lines/index.html'),
        area: resolveRelativePath('examples/area/index.html'),
        'basic-line': resolveRelativePath('examples/basic-line/index.html'),
        'chart-text': resolveRelativePath('examples/chart-text/index.html'),
        colourbar: resolveRelativePath('examples/colourbar/index.html'),
        'escalation-levels': resolveRelativePath('examples/escalation-levels/index.html'),
        'extent-filter': resolveRelativePath('examples/extent-filter/index.html'),
        'grouped-bar': resolveRelativePath('examples/grouped-bar/index.html'),
        'intercept-tests': resolveRelativePath('examples/intercept-tests/index.html'),
        legend: resolveRelativePath('examples/legend/index.html'),
        marker: resolveRelativePath('examples/marker/index.html'),
        matrix: resolveRelativePath('examples/matrix/index.html'),
        mouseover: resolveRelativePath('examples/mouseover/index.html'),
        'precipitation-bar': resolveRelativePath('examples/precipitation-bar/index.html'),
        progress: resolveRelativePath('examples/progress/index.html'),
        rule: resolveRelativePath('examples/rule/index.html'),
        'secondary-axis': resolveRelativePath('examples/secondary-axis/index.html'),
        'shared-zoom': resolveRelativePath('examples/shared-zoom/index.html'),
        spectrum: resolveRelativePath('examples/spectrum/index.html'),
        'time-axes': resolveRelativePath('examples/time-axes/index.html'),
        vertical: resolveRelativePath('examples/vertical/index.html'),
        'wheel-zoom': resolveRelativePath('examples/wheel-zoom/index.html'),
        'wind-current-roses': resolveRelativePath('examples/wind-current-roses/index.html'),
        'wind-direction': resolveRelativePath('examples/wind-direction/index.html'),
        'windrose-wbviewer': resolveRelativePath('examples/windrose-wbviewer/index.html'),
        xlevel: resolveRelativePath('examples/xlevel/index.html'),
        'zoom-options': resolveRelativePath('examples/zoom-options/index.html'),
      },
    },
  },
  resolve: {
    alias: {
      '@lib': resolveRelativePath('./src'),
      '@shared': resolveRelativePath('./examples/shared'),
    },
  },
})

function resolveRelativePath(relative: string): string {
  return resolve(__dirname, relative)
}

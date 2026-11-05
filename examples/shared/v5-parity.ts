import { createPlot, createPolarPlot, type Plot, type PlotConfig, type PolarPlotConfig } from '@lib'

const plots: Plot[] = []
const observers: MutationObserver[] = []

export function onParityThemeChange(changed: () => void) {
  const observer = new MutationObserver(changed)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  observers.push(observer)
}

export function parityPlot(id: string, config: PlotConfig): Plot {
  const host = document.getElementById(id)
  if (!host) throw new Error(`Missing parity example host "${id}".`)
  const plot = createPlot(host, {
    axisLayout: 'inset',
    autoMargins: true,
    background: 'canvas',
    themeElement: document.documentElement,
    ...config,
    margins: { top: 40, right: 40, bottom: 40, left: 40, ...config.margins },
  })
  plots.push(plot)
  return plot
}

export function parityPolarPlot(id: string, config: PolarPlotConfig) {
  const host = document.getElementById(id)
  if (!host) throw new Error(`Missing parity example host "${id}".`)
  const plot = createPolarPlot(host, {
    axisLayout: 'inset',
    background: 'canvas',
    clipMarks: false,
    themeElement: document.documentElement,
    ...config,
    margins: { top: 40, right: 40, bottom: 40, left: 40, ...config.margins },
  })
  plots.push(plot)
  return plot
}

function dispose() {
  for (const observer of observers.splice(0)) observer.disconnect()
  for (const plot of plots) plot.destroy()
  plots.length = 0
}

window.addEventListener('pagehide', (event) => {
  if (!event.persisted) dispose()
})
import.meta.hot?.dispose(dispose)

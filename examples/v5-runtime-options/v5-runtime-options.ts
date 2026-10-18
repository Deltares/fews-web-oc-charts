import '../shared/v5.css'
import {
  axis,
  bandScale,
  batch,
  createPlot,
  degreesScale,
  linearScale,
  type PlotConfig,
  type ThemeMode,
} from '@lib'

const host = document.querySelector<HTMLElement>('#plot')
const theme = document.querySelector<HTMLSelectElement>('#theme')
const accent = document.querySelector<HTMLInputElement>('#accent')
const clearToken = document.querySelector<HTMLButtonElement>('#clear-token')
const title = document.querySelector<HTMLInputElement>('#title')
const reverse = document.querySelector<HTMLInputElement>('#reverse')
const secondary = document.querySelector<HTMLInputElement>('#secondary')
const patch = document.querySelector<HTMLButtonElement>('#patch')
const unset = document.querySelector<HTMLButtonElement>('#unset')
const replace = document.querySelector<HTMLButtonElement>('#replace')
const toggle = document.querySelector<HTMLButtonElement>('#toggle-plot')
const status = document.querySelector<HTMLElement>('#status')
const snapshot = document.querySelector<HTMLElement>('#snapshot')
if (
  !host ||
  !theme ||
  !accent ||
  !clearToken ||
  !title ||
  !reverse ||
  !secondary ||
  !patch ||
  !unset ||
  !replace ||
  !toggle ||
  !status ||
  !snapshot
) {
  throw new Error('The runtime-option example is missing required elements.')
}

const station = bandScale({ domain: ['Lobith', 'Nijmegen', 'Arnhem'] })
const level = linearScale({ domain: [-2, 12] })
const flow = linearScale({ domain: [0, 1000], includeZero: true })
const direction = degreesScale()
const stationAxis = axis('station', { id: 'station', position: 'bottom', label: 'Station' })
const levelAxis = axis('level', {
  id: 'level',
  position: 'left',
  label: 'Water level',
  unit: 'm',
  grid: true,
})
const flowAxis = axis('flow', { id: 'flow', position: 'left', label: 'Discharge', unit: 'm3/s' })
const directionAxis = axis('direction', {
  id: 'direction',
  position: 'right',
  label: 'Direction',
  unit: 'degrees',
})
const scales = { station, level, flow, direction }
const allAxes = [stationAxis, levelAxis, flowAxis, directionAxis]
const events = new AbortController()

const config = (): PlotConfig => {
  return { title: 'Station overview', scales, axes: allAxes, themeElement: host }
}
let plot = createPlot(host, config())

const describe = (message: string) => {
  status.textContent = message
  const { explicit, resolved } = plot.options.get()
  const summarize = (options: typeof explicit) => ({
    title: options.title,
    margins: options.margins,
    theme: options.theme,
    scales: Object.keys(options.scales ?? {}),
    axes: options.axes?.map((entry) => entry.options.get().resolved.id),
  })
  snapshot.textContent = JSON.stringify(
    {
      destroyed: plot.destroyed,
      explicit: summarize(explicit),
      resolved: summarize(resolved),
      level: level.options.get().resolved,
      levelAxis: {
        ...levelAxis.options.get().resolved,
        format: levelAxis.options.get().resolved.format ? 'custom callback' : 'default',
      },
    },
    null,
    2,
  )
}

const syncControls = () => {
  const current = plot.options.get().resolved
  theme.value = current.theme
  title.value = current.title
  reverse.checked = level.options.get().resolved.reverse
  secondary.checked = current.axes.includes(flowAxis)
}

function themeMode(value: string): ThemeMode {
  if (value !== 'auto' && value !== 'light' && value !== 'dark')
    throw new Error(`Unknown theme "${value}".`)
  return value
}

theme.addEventListener(
  'change',
  () => {
    plot.update({ theme: themeMode(theme.value) })
    describe('Updated the plot theme; shared handles were not changed.')
  },
  events,
)
accent.addEventListener(
  'input',
  () => {
    host.style.setProperty('--fews-chart-foreground', accent.value)
    describe('Updated the scoped foreground CSS token.')
  },
  events,
)
clearToken.addEventListener(
  'click',
  () => {
    host.style.removeProperty('--fews-chart-foreground')
    describe('Removed the CSS token; the current theme supplies the foreground.')
  },
  events,
)
title.addEventListener(
  'input',
  () => {
    plot.update({ title: title.value })
    describe('Updated the title without recreating the plot.')
  },
  events,
)
reverse.addEventListener(
  'change',
  () => {
    level.update({ reverse: reverse.checked })
    describe('Updated the retained level scale handle.')
  },
  events,
)
secondary.addEventListener(
  'change',
  () => {
    plot.update({
      axes: secondary.checked ? allAxes : allAxes.filter((entry) => entry !== flowAxis),
    })
    describe('Replaced axis membership; the flow scale remains bound.')
  },
  events,
)
patch.addEventListener(
  'click',
  () => {
    batch(() => {
      plot.update({ title: 'Patched title', margins: { top: 28, right: 24 } })
      levelAxis.update({
        label: 'Custom level',
        format: (value) => `${Number(value).toFixed(1)} m`,
      })
    })
    syncControls()
    describe('Patched nested margins and an axis formatter in one frame.')
  },
  events,
)
unset.addEventListener(
  'click',
  () => {
    batch(() => {
      plot.update({
        title: undefined,
        margins: { top: undefined, right: undefined },
        theme: undefined,
      })
      levelAxis.update({ label: undefined, format: undefined })
      level.update({ reverse: undefined })
    })
    syncControls()
    describe('Unset overrides: defaults are restored, not the constructor values.')
  },
  events,
)
replace.addEventListener(
  'click',
  () => {
    plot.setConfig({ scales, axes: allAxes, themeElement: host })
    syncControls()
    describe(
      'Replaced plot config: title/theme/margins reset; retained scale and axis options survive.',
    )
  },
  events,
)
const plotControls = [theme, accent, clearToken, title, reverse, secondary, patch, unset, replace]
toggle.addEventListener(
  'click',
  () => {
    if (plot.destroyed) {
      plot = createPlot(host, config())
      syncControls()
    } else plot.destroy()
    for (const control of plotControls) control.disabled = plot.destroyed
    toggle.textContent = plot.destroyed ? 'Recreate plot' : 'Destroy plot'
    describe(
      plot.destroyed
        ? 'Plot destroyed; observers and local ranges released.'
        : 'Plot recreated with retained shared handles.',
    )
  },
  events,
)
describe('Ready. Edit options or use the preset actions.')

function dispose() {
  events.abort()
  plot.destroy()
}
window.addEventListener(
  'pagehide',
  (event) => {
    if (!event.persisted) dispose()
  },
  events,
)
import.meta.hot?.dispose(dispose)

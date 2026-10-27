import '../shared/v5.css'
import './ensemble.css'
import {
  axis,
  createEnsemble,
  createPlot,
  crosshair,
  ensemble,
  highlight,
  legend,
  line,
  linearScale,
  rule,
  timeScale,
  tooltip,
} from '@lib'
import data from '../data/ensemble.json'

function required<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`The ensemble example is missing "${selector}".`)
  return element
}

const events = new AbortController()
const rendererOption = required<HTMLSelectElement>('#renderer')
const maxMembersOption = required<HTMLInputElement>('#max-members')
const controlOption = required<HTMLInputElement>('#control')
const thresholdOption = required<HTMLInputElement>('#threshold')

// The file stores one row per time step; the store takes one column per member.
const times = data.times.map((seconds) => seconds * 1000)
const memberCount = data.values[0].length
const members = Array.from({ length: memberCount }, (_, member) =>
  data.values.map((row) => row[member]),
)
const store = createEnsemble(
  { x: times, members },
  {
    metadata: members.map((_, index) => ({
      id: String(index),
      label: index === 0 ? 'Control' : `Member ${index}`,
    })),
  },
)
// The control part is optional: `control: false` draws the ensemble without one.
function controlOptions() {
  return controlOption.checked ? { member: 0, stroke: '#222222', width: 1.5 } : false
}

const forecast = ensemble(store, {
  id: 'forecast',
  x: 't',
  y: 'q',
  label: 'Forecast',
  members: { stroke: '#4477aa', opacity: 0.25, width: 1 },
  spread: {
    bands: [
      [5, 95],
      [25, 75],
    ],
    fill: '#4477aa',
    opacity: 0.25,
  },
  median: { stroke: '#114477', width: 2 },
  mean: { stroke: '#cc3311', width: 1.5, strokeDasharray: '6 3' },
  control: controlOptions(),
  exceedance: { threshold: Number(thresholdOption.value) },
})
const exceedanceColor = '#e0509a'
const exceedanceWidth = 1.5

function thresholdRule(value: number) {
  return rule({
    id: 'threshold',
    label: 'Threshold',
    scale: 'q',
    value,
    stroke: exceedanceColor,
    strokeWidth: exceedanceWidth,
  })
}

const sharedTime = timeScale({ domain: [times[0], times[times.length - 1]], timeZone: 'UTC' })
const MARGINS = { left: 80, right: 24, top: 12, bottom: 16 }
const guide = crosshair({ mode: 'x', labels: { x: 't' } })
let threshold = thresholdRule(Number(thresholdOption.value))
const plot = createPlot(required('#chart'), {
  title: 'Ensemble forecast',
  scales: {
    t: sharedTime,
    q: linearScale({ nice: true }),
  },
  axisLayout: 'inset',
  margins: MARGINS,
  directions: { t: 'x' },
  axes: [axis('q', { style: 'classic', position: 'left', label: 'Value', grid: true })],
  marks: [forecast, threshold],
  plugins: [
    guide,
    tooltip({ marks: [forecast], crosshair: guide, showX: false, digits: 1 }),
    highlight({ marks: [forecast], crosshair: guide }),
    legend({ position: 'top' }),
  ],
})

function exceedanceMark(threshold: number) {
  const probability = store.exceedance(threshold)
  return line({
    id: 'exceedance',
    x: 't',
    y: 'p',
    xValues: times,
    yValues: Float64Array.from({ length: store.length }, (_, index) => probability.at(index)),
    stroke: exceedanceColor,
    strokeWidth: exceedanceWidth,
  })
}

let exceedance = exceedanceMark(Number(thresholdOption.value))
const exceedanceGuide = crosshair({ mode: 'x', labels: { x: 't' } })
const exceedanceTooltip = tooltip({
  marks: [exceedance],
  crosshair: exceedanceGuide,
  showX: false,
  digits: 2,
})
const exceedancePlot = createPlot(required('#exceedance'), {
  axisLayout: 'inset',
  margins: { ...MARGINS, bottom: 56 },
  directions: { t: 'x' },
  scales: { t: sharedTime, p: linearScale({ domain: [0, 1] }) },
  axes: [
    axis('t', { style: 'classic', position: 'bottom', label: 'Time (UTC)', tickCount: 6 }),
    axis('p', { style: 'classic', position: 'left', label: 'P(exceed)', grid: true }),
  ],
  marks: [exceedance],
  plugins: [exceedanceGuide, exceedanceTooltip],
})

rendererOption.addEventListener(
  'change',
  () => {
    if (rendererOption.value !== 'svg' && rendererOption.value !== 'canvas') {
      throw new Error(`Unknown renderer "${rendererOption.value}".`)
    }
    forecast.update({ renderer: rendererOption.value })
  },
  events,
)
maxMembersOption.addEventListener(
  'input',
  () => forecast.update({ members: { max: Number(maxMembersOption.value) } }),
  events,
)
controlOption.addEventListener(
  'change',
  () => forecast.update({ control: controlOptions() }),
  events,
)
thresholdOption.addEventListener(
  'input',
  () => {
    const level = Number(thresholdOption.value)
    if (!thresholdOption.value || !Number.isFinite(level)) return
    forecast.update({ exceedance: { threshold: level } })
    threshold = thresholdRule(level)
    plot.update({ marks: [forecast, threshold] })
    // A tooltip may only inspect marks the plot owns, so detach it while the mark is replaced.
    exceedanceTooltip.update({ marks: [] })
    exceedance = exceedanceMark(level)
    exceedancePlot.update({ marks: [exceedance] })
    exceedanceTooltip.update({ marks: [exceedance] })
  },
  events,
)

function dispose() {
  events.abort()
  plot.destroy()
  exceedancePlot.destroy()
}

window.addEventListener('pagehide', dispose, { once: true })
import.meta.hot?.dispose(dispose)

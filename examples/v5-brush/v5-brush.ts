import '../shared/v5.css'
import {
  axis,
  brush,
  brushEvent,
  createPlot,
  line,
  linearScale,
  ModifierKey,
  timeScale,
  type BrushMode,
  type BrushSelection,
} from '@lib'

const host = document.querySelector<HTMLElement>('#chart')
const mode = document.querySelector<HTMLSelectElement>('#mode')
const modifier = document.querySelector<HTMLSelectElement>('#modifier')
const clear = document.querySelector<HTMLButtonElement>('#clear')
const status = document.querySelector<HTMLElement>('#status')
const snapshot = document.querySelector<HTMLElement>('#snapshot')
if (!host || !mode || !modifier || !clear || !status || !snapshot) {
  throw new Error('The brush example is missing required elements.')
}

const hour = 3_600_000
const start = Date.UTC(2026, 0, 1)
const times = Float64Array.from({ length: 49 }, (_, index) => start + index * hour)
const values = Float64Array.from(
  { length: 49 },
  (_, index) => 44 + 22 * Math.sin(index / 3) + 13 * Math.cos(index / 7),
)
const t = timeScale({ domain: [start, start + 48 * hour], timeZone: 'UTC' })
const q = linearScale({ domain: [0, 100] })
const interaction = brush({ mode: 'x' })
const plot = createPlot(host, {
  title: 'Select hourly observations',
  scales: { t, q },
  axes: [
    axis('t', { position: 'bottom', label: 'Time (UTC)', tickCount: 6 }),
    axis('q', { position: 'left', label: 'Value', grid: true }),
  ],
  marks: [
    line({
      id: 'observations',
      x: 't',
      y: 'q',
      xValues: times,
      yValues: values,
      stroke: '#1677a6',
      strokeWidth: 2,
    }),
  ],
  plugins: [interaction],
})
const events = new AbortController()

function updateStatus() {
  const requirement = modifier.value === 'none' ? 'Drag' : `Hold ${modifier.value} and drag`
  status.textContent = `${requirement} to select ${mode.value}. Scale domains are unchanged.`
}

function selectedMode(value: string): BrushMode {
  if (value === 'x' || value === 'y' || value === 'xy') return value
  throw new Error(`Unknown brush mode "${value}".`)
}

function selectedModifier(value: string): ModifierKey {
  switch (value) {
    case 'none':
      return ModifierKey.None
    case 'ctrl':
      return ModifierKey.Ctrl
    case 'shift':
      return ModifierKey.Shift
    default:
      throw new Error(`Unknown modifier "${value}".`)
  }
}

for (const control of [mode, modifier]) {
  control.addEventListener(
    'change',
    () => {
      interaction.update({
        mode: selectedMode(mode.value),
        modifier: selectedModifier(modifier.value),
      })
      updateStatus()
    },
    events,
  )
}
plot.element.addEventListener(
  brushEvent,
  (event) => {
    const selection = (event as CustomEvent<BrushSelection>).detail
    snapshot.textContent = JSON.stringify(
      {
        mode: selection.mode,
        scales: Object.fromEntries(
          Object.entries(selection.scales).map(([name, range]) => [
            name,
            name === 't' ? range.map((value) => new Date(Number(value)).toISOString()) : range,
          ]),
        ),
      },
      null,
      2,
    )
    status.textContent = `Selected ${selection.mode} ranges. Scale domains are unchanged.`
  },
  events,
)
function clearReadout() {
  snapshot.textContent = 'No selection yet.'
  updateStatus()
}
clear.addEventListener('click', clearReadout, events)
clearReadout()

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

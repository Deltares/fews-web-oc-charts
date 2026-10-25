import '../shared/v5.css'
import {
  axis,
  batch,
  brush,
  brushEvent,
  createPlot,
  effect,
  line,
  linearScale,
  ModifierKey,
  pan,
  timeScale,
  zoom,
  type BrushMode,
  type BrushSelection,
} from '@lib'

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`The brush example is missing "${selector}".`)
  return element
}
const host = required<HTMLElement>('#chart')
const overviewHost = required<HTMLElement>('#overview')
const applyZoom = required<HTMLInputElement>('#apply-zoom')
const mode = required<HTMLSelectElement>('#mode')
const modifier = required<HTMLSelectElement>('#modifier')
const clear = required<HTMLButtonElement>('#clear')
const status = required<HTMLElement>('#status')
const snapshot = required<HTMLElement>('#snapshot')
const domains = required<HTMLElement>('#domains')

const hour = 3_600_000
const start = Date.UTC(2026, 0, 1)
const times = Float64Array.from({ length: 49 }, (_, index) => start + index * hour)
const values = Float64Array.from(
  { length: 49 },
  (_, index) => 44 + 22 * Math.sin(index / 3) + 13 * Math.cos(index / 7),
)
const t = timeScale({ domain: [start + 12 * hour, start + 36 * hour], timeZone: 'UTC' })
const q = linearScale({ domain: [0, 100] })
const interaction = brush({ mode: 'auto' })
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
  plugins: [interaction, zoom({ mode: 'x', wheel: 'x', reset: 'full' }), pan({ mode: 'x' })],
})
const navigator = brush({ mode: 'x', persistent: true, modifier: ModifierKey.None })
navigator.setSelection({ mode: 'x', scales: { t: t.domain.get() } })
const overview = createPlot(overviewHost, {
  height: 170,
  scales: {
    t: timeScale({ domain: [start, start + 48 * hour], timeZone: 'UTC' }),
    q: linearScale({ domain: [0, 100] }),
  },
  axes: [axis('t', { position: 'bottom', label: 'Full time range (UTC)', tickCount: 6 })],
  marks: [
    line({ x: 't', y: 'q', xValues: times, yValues: values, stroke: '#1677a6', strokeWidth: 2 }),
  ],
  plugins: [navigator],
})
const events = new AbortController()
const toIso = (range: readonly (number | string)[] | undefined) =>
  range?.map((value) => new Date(Number(value)).toISOString()) ?? null
const domainsEffect = effect(() => {
  domains.textContent = JSON.stringify(
    {
      t: toIso(t.domain.get()),
      q: q.domain.get(),
      navigator: toIso(navigator.selection.get()?.scales.t),
    },
    null,
    2,
  )
})

function updateStatus() {
  const requirement = modifier.value === 'none' ? 'Drag' : `Hold ${modifier.value} and drag`
  status.textContent = `${requirement} to select ${mode.value}. ${applyZoom.checked ? 'Release to zoom.' : 'Selection only; main chart domains are unchanged.'}`
}

function selectedMode(value: string): BrushMode {
  if (value === 'x' || value === 'y' || value === 'xy' || value === 'auto') return value
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

for (const control of [mode, modifier, applyZoom]) {
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
    if (applyZoom.checked) {
      batch(() => {
        if (selection.scales.t) t.domain.set(selection.scales.t)
        if (selection.scales.q) q.domain.set(selection.scales.q)
      })
      syncNavigator()
    }
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
    status.textContent = `Selected ${selection.mode} ranges.${applyZoom.checked ? ' Main chart zoomed.' : ''}`
  },
  events,
)
function clearReadout() {
  batch(() => {
    t.domain.set([start, start + 48 * hour])
    q.domain.set([0, 100])
  })
  navigator.setSelection(undefined)
  snapshot.textContent = 'No selection yet.'
  updateStatus()
}
clear.addEventListener('click', clearReadout, events)
snapshot.textContent = 'No selection yet.'
updateStatus()

function syncNavigator() {
  navigator.setSelection({ mode: 'x', scales: { t: t.domain.get() } })
}
overview.element.addEventListener(
  brushEvent,
  (event) => {
    const selection = (event as CustomEvent<BrushSelection>).detail
    t.domain.set(selection.scales.t)
    status.textContent = 'Overview selection updated the main chart time domain.'
  },
  events,
)
for (const type of ['wheel', 'dblclick', 'pointerup']) {
  plot.element.addEventListener(type, syncNavigator, events)
}
plot.element.addEventListener(
  'pointermove',
  (event) => {
    if (event.buttons === 1 && !event.shiftKey) syncNavigator()
  },
  events,
)

function dispose() {
  events.abort()
  domainsEffect.dispose()
  plot.destroy()
  overview.destroy()
}
window.addEventListener(
  'pagehide',
  (event) => {
    if (!event.persisted) dispose()
  },
  events,
)
import.meta.hot?.dispose(dispose)

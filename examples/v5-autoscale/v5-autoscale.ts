import '../shared/v5.css'
import {
  axis,
  batch,
  createPlot,
  createSeries,
  linear,
  series,
  time,
  type AutoscalePolicy,
} from '@lib'

const host = document.querySelector<HTMLElement>('#chart')
const policy = document.querySelector<HTMLSelectElement>('#policy')
const zero = document.querySelector<HTMLInputElement>('#zero')
const nice = document.querySelector<HTMLInputElement>('#nice')
const padding = document.querySelector<HTMLInputElement>('#padding')
const pin = document.querySelector<HTMLInputElement>('#pin')
const windowed = document.querySelector<HTMLInputElement>('#windowed')
const windowStart = document.querySelector<HTMLInputElement>('#window-start')
const windowLabel = document.querySelector<HTMLOutputElement>('#window-label')
const observed = document.querySelector<HTMLInputElement>('#observed')
const peak = document.querySelector<HTMLInputElement>('#peak')
const area = document.querySelector<HTMLInputElement>('#area')
const append = document.querySelector<HTMLButtonElement>('#append')
const reset = document.querySelector<HTMLButtonElement>('#reset')
const status = document.querySelector<HTMLElement>('#status')
const snapshot = document.querySelector<HTMLElement>('#snapshot')
if (
  !host ||
  !policy ||
  !zero ||
  !nice ||
  !padding ||
  !pin ||
  !windowed ||
  !windowStart ||
  !windowLabel ||
  !observed ||
  !peak ||
  !area ||
  !append ||
  !reset ||
  !status ||
  !snapshot
) {
  throw new Error('The autoscale example is missing required elements.')
}

const start = Date.UTC(2026, 0, 1)
const hour = 3_600_000
const times = Float64Array.from({ length: 25 }, (_, index) => start + index * hour)
const values = Float64Array.from({ length: 25 }, (_, index) =>
  index === 9 || index === 10 ? NaN : 25 + index + 8 * Math.sin(index / 2),
)
const peaks = Float64Array.from(
  { length: 25 },
  (_, index) => 45 + Math.max(0, 1 - Math.abs(index - 18) / 3) * 135,
)
const data = createSeries({ x: times, y: values })
const peakData = createSeries({ x: times, y: peaks })
const blue = series(data, {
  x: 't',
  y: 'q',
  label: 'Observations',
  line: { stroke: '#1677a6', width: 2 },
  markers: { size: 3 },
})
const orange = series(peakData, {
  x: 't',
  y: 'q',
  label: 'Peak series',
  line: { stroke: '#c45508', width: 2 },
  markers: { size: 3 },
})
const t = time({ domain: [start, start + 6 * hour] })
const q = linear({ autoscale: 'visible', defaultDomain: [-20, 120] })
const plot = createPlot(host, {
  title: 'Automatic value domains',
  scales: { t, q },
  axes: [
    axis('t', { position: 'bottom', label: 'Time (UTC)', tickCount: 6 }),
    axis('q', { position: 'left', label: 'Value', grid: true }),
  ],
  marks: [blue, orange],
})
const events = new AbortController()

const selectedPolicy = (): AutoscalePolicy => {
  switch (policy.value) {
    case 'data':
    case 'visible':
    case 'fixed':
      return policy.value
    case 'custom':
      return ({ data }) => {
        if (!data) return undefined
        const limit = Math.max(...data.map((value) => Math.abs(Number(value))))
        return [-limit, limit]
      }
    default:
      throw new Error(`Unknown autoscale policy "${policy.value}".`)
  }
}

const describe = () => {
  const timeDomain = t.domain.get().map((value) => new Date(Number(value)).toISOString())
  const valueDomain = q.domain.get()
  const from = Number(windowStart.value)
  windowStart.disabled = !windowed.checked
  windowLabel.value = windowed.checked ? `${from}:00 to ${from + 6}:00 UTC` : 'All data'
  status.textContent = pin.checked
    ? 'Explicit value domain active. Uncheck the override to resume autoscaling.'
    : `Policy: ${policy.value}. Value domain: ${valueDomain.map((value) => Number(value).toFixed(2)).join(' to ')}.`
  snapshot.textContent = JSON.stringify(
    {
      policy: policy.value,
      explicitValueDomain: q.options.get().explicit.domain ?? null,
      timeDomain,
      valueDomain,
      defaultValueDomain: q.options.get().resolved.defaultDomain,
      observedSamples: data.length,
      visibleSeries: [blue, orange]
        .filter((mark) => mark.visible)
        .map((mark) => mark.options.get().resolved.label),
    },
    null,
    2,
  )
}

const applyControls = () => {
  batch(() => {
    const offset = Number(windowStart.value)
    t.update({
      domain: windowed.checked ? [start + offset * hour, start + (offset + 6) * hour] : undefined,
    })
    q.update({
      autoscale: selectedPolicy(),
      domain: pin.checked ? [-25, 50] : undefined,
      includeZero: zero.checked,
      nice: nice.checked,
      padding: padding.checked ? 0.1 : 0,
    })
    blue.update({ visible: observed.checked, area: area.checked ? { to: 0 } : false })
    orange.update({ visible: peak.checked })
  })
  describe()
}

for (const control of [policy, zero, nice, padding, pin, windowed, observed, peak, area]) {
  control.addEventListener('change', applyControls, events)
}
windowStart.addEventListener('input', applyControls, events)
append.addEventListener(
  'click',
  () => {
    const nextHour = (data.xAt(data.length - 1) - start) / hour + 1
    data.append({ x: [start + nextHour * hour], y: [200 + (nextHour - 24) * 10] })
    windowStart.max = String(nextHour - 6)
    windowStart.value = windowStart.max
    applyControls()
  },
  events,
)
reset.addEventListener(
  'click',
  () => {
    batch(() => {
      data.replace({ x: times, y: values })
      policy.value = 'visible'
      for (const control of [zero, nice, padding, pin, area]) control.checked = false
      for (const control of [windowed, observed, peak]) control.checked = true
      windowStart.max = '18'
      windowStart.value = '0'
      applyControls()
    })
  },
  events,
)
describe()

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

import '../shared/v5.css'
import './polar.css'
import { angularScale, axis, createPolarPlot, radialScale, type PolarPlot } from '@lib'

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`The polar-coordinate example is missing "${selector}".`)
  return element
}

const clockwiseHost = requiredElement<HTMLElement>('#clockwise')
const sectorHost = requiredElement<HTMLElement>('#sector')
const innerHost = requiredElement<HTMLElement>('#inner')
const direction = requiredElement<HTMLSelectElement>('#direction')
const intercept = requiredElement<HTMLInputElement>('#intercept')
const sweep = requiredElement<HTMLInputElement>('#sweep')
const innerRadius = requiredElement<HTMLInputElement>('#inner-radius')
const bearing = requiredElement<HTMLInputElement>('#bearing')
const distance = requiredElement<HTMLInputElement>('#distance')
const status = requiredElement<HTMLElement>('#status')
const coordinateLabels = [
  requiredElement<HTMLElement>('#clockwise-coordinate'),
  requiredElement<HTMLElement>('#sector-coordinate'),
  requiredElement<HTMLElement>('#inner-coordinate'),
]

const toRadians = (degrees: number) => (degrees * Math.PI) / 180
const compassAngle = angularScale({ domain: [0, 360] })
const compassRadius = radialScale({ domain: [0, 100] })
const sectorAngle = angularScale({ domain: [0, 360] })
const sectorRadius = radialScale({ domain: [0, 100] })
const innerAngle = angularScale({ domain: [0, 360] })
const innerDistance = radialScale({ domain: [0, 100] })

function makePlot(
  host: HTMLElement,
  title: string,
  angle: ReturnType<typeof angular>,
  radius: ReturnType<typeof radial>,
) {
  return createPolarPlot(host, {
    title,
    scales: { bearing: angle, distance: radius },
    axes: [
      axis('bearing', { position: 'angular', grid: true }),
      axis('distance', { position: 'radial', grid: true, label: 'Distance' }),
    ],
  })
}

const plots: PolarPlot[] = [
  makePlot(clockwiseHost, 'Clockwise from north', compassAngle, compassRadius),
  makePlot(sectorHost, 'Anticlockwise sector', sectorAngle, sectorRadius),
  makePlot(innerHost, 'Inner-radius scale', innerAngle, innerDistance),
]
const events = new AbortController()

function numericInput(input: HTMLInputElement, name: string, min: number, max: number) {
  const value = Number(input.value)
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${name} must be between ${min} and ${max}.`)
  }
  return value
}

function update() {
  const interceptDegrees = numericInput(intercept, 'Intercept', -180, 180)
  const sweepDegrees = numericInput(sweep, 'Angular sweep', 45, 360)
  const innerFraction = numericInput(innerRadius, 'Inner radius', 0, 0.8)
  const bearingDegrees = numericInput(bearing, 'Projected bearing', 0, 360)
  const distanceValue = numericInput(distance, 'Projected radius', 0, 100)
  const directionValue = direction.value
  if (directionValue !== 'clockwise' && directionValue !== 'anticlockwise') {
    throw new Error(`Unknown direction "${directionValue}".`)
  }

  compassAngle.update({
    direction: 'clockwise',
    intercept: 0,
    range: [0, 2 * Math.PI],
  })
  compassRadius.update({ innerRadius: 0 })
  sectorAngle.update({
    direction: directionValue,
    intercept: toRadians(interceptDegrees),
    range: [0, toRadians(sweepDegrees)],
  })
  sectorRadius.update({ innerRadius: 0 })
  innerAngle.update({ direction: 'clockwise', intercept: 0, range: [0, 2 * Math.PI] })
  innerDistance.update({ innerRadius: innerFraction })

  for (const [index, plot] of plots.entries()) {
    const point = plot.project(bearingDegrees, distanceValue)
    const label = coordinateLabels[index]
    if (!label) throw new Error(`Missing projected-coordinate label ${index}.`)
    label.textContent = `project(${bearingDegrees}°, ${distanceValue}) → (${point.x.toFixed(1)}, ${point.y.toFixed(1)}) px`
  }
  status.textContent =
    `Sector: ${directionValue}, ${sweepDegrees}° sweep, ${interceptDegrees}° intercept. ` +
    `Inner radius: ${innerFraction.toFixed(2)} of the outer radius.`
}

const controls: Array<HTMLSelectElement | HTMLInputElement> = [
  direction,
  intercept,
  sweep,
  innerRadius,
  bearing,
  distance,
]
for (const control of controls) {
  control.addEventListener('input', update, events)
  control.addEventListener('change', update, events)
}
requestAnimationFrame(() => requestAnimationFrame(update))

function dispose() {
  events.abort()
  for (const plot of plots) plot.destroy()
}
window.addEventListener(
  'pagehide',
  (event) => {
    if (!event.persisted) dispose()
  },
  events,
)
import.meta.hot?.dispose(dispose)

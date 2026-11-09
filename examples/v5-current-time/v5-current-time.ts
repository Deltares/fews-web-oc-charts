import '../shared/v5.css'
import {
  axis,
  createPlot,
  currentTime,
  effect,
  line,
  linearScale,
  sharedClock,
  timeScale,
  type CurrentTimeLabel,
} from '@lib'

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`The current time example is missing "${selector}".`)
  return element
}

const running = required<HTMLInputElement>('#running')
const later = required<HTMLButtonElement>('#later')
const now = required<HTMLButtonElement>('#now')
const label = required<HTMLSelectElement>('#label')
const status = required<HTMLElement>('#status')

const hour = 3_600_000
const start = Date.now() - 6 * hour
const times = Float64Array.from({ length: 25 }, (_, index) => start + index * hour)
const timeZone = 'Europe/Amsterdam'
const time = timeScale({ domain: [times[0], times[24]], timeZone })

const clock = sharedClock({ interval: 1000 })
clock.start()
const guides = [currentTime({ clock }), currentTime({ clock })]

for (const [index, selector] of ['#upper', '#lower'].entries()) {
  createPlot(required<HTMLElement>(selector), {
    title: index === 0 ? 'Water level' : 'Discharge',
    scales: { time, value: linearScale({ domain: [-20, 20] }) },
    axes: [
      axis('time', { position: 'bottom', label: 'Time' }),
      axis('value', { position: 'left', grid: true }),
    ],
    marks: [
      line({
        x: 'time',
        y: 'value',
        xValues: times,
        yValues: times.map((_, step) => 15 * Math.sin(step / (3 + index))),
      }),
    ],
    plugins: [guides[index]],
  })
}

running.addEventListener('change', () => {
  if (running.checked) clock.start()
  else clock.stop()
})
later.addEventListener('click', () => {
  running.checked = false
  clock.stop()
  clock.set(clock.time.get() + 3 * hour)
})
now.addEventListener('click', () => clock.tick())
label.addEventListener('change', () => {
  for (const guide of guides) guide.update({ label: label.value as CurrentTimeLabel })
})

const format = new Intl.DateTimeFormat('en-GB', {
  timeZone,
  dateStyle: 'medium',
  timeStyle: 'medium',
})
effect(() => {
  const state = clock.running.get() ? 'running' : 'stopped'
  status.textContent = `Clock ${state}: ${format.format(clock.time.get())}`
})

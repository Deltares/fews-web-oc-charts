import { angular, axis, createPolarPlot, progress, radial } from '@lib'

const host = document.querySelector<HTMLElement>('#chart')
if (!host) throw new Error('The progress example is missing its chart host.')

const tracks = [25, 50, 75]
const plot = createPolarPlot(host, {
  title: 'Completion progress',
  scales: {
    completion: angular({ domain: [0, 100], range: [0, 2 * Math.PI] }),
    track: radial({ domain: [0, 100], innerRadius: 0.22 }),
  },
  axes: [axis('completion', { position: 'angular', grid: true })],
  marks: [
    progress({
      id: 'track-backgrounds',
      x: 'completion',
      y: 'track',
      xValues: tracks.map(() => [0, 100]),
      yValues: tracks,
      thickness: 18,
      fill: '#d9e2e8',
    }),
    progress({
      id: 'completed',
      x: 'completion',
      y: 'track',
      xValues: [
        [0, 72],
        [0, 45],
        [0, 89],
      ],
      yValues: tracks,
      thickness: 18,
      fill: '#1677a6',
    }),
  ],
})

function dispose() {
  plot.destroy()
}

window.addEventListener(
  'pagehide',
  (event) => {
    if (!event.persisted) dispose()
  },
  { once: true },
)
import.meta.hot?.dispose(dispose)

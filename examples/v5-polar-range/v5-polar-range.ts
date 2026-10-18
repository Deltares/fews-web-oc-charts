import '../shared/v5.css'
import './polar-range.css'
import { angular, axis, createPolarPlot, radial, range } from '@lib'

const host = document.querySelector<HTMLElement>('#chart')
if (!host) throw new Error('The polar range example is missing its chart host.')

const plot = createPolarPlot(host, {
  title: 'Directional forecast ranges',
  scales: {
    bearing: angular({ domain: [0, 360], direction: 'clockwise' }),
    distance: radial({ domain: [0, 100], innerRadius: 0.18 }),
  },
  axes: [
    axis('bearing', { position: 'angular', grid: true }),
    axis('distance', { position: 'radial', grid: true, label: 'Distance' }),
  ],
  marks: [
    range({
      id: 'near-sector',
      x: 'bearing',
      y: 'distance',
      xValues: [
        [15, 65],
        [105, 155],
        [235, 285],
      ],
      yValues: [
        [18, 55],
        [35, 70],
        [22, 48],
      ],
      fill: '#1677a6',
      opacity: 0.48,
    }),
    range({
      id: 'far-sector',
      x: 'bearing',
      y: 'distance',
      xValues: [
        [45, 100],
        [180, 225],
        [300, 345],
      ],
      yValues: [
        [55, 88],
        [48, 82],
        [60, 94],
      ],
      fill: '#d17b0f',
      opacity: 0.4,
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

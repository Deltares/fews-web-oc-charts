import '@lib/scss/wb-charts.scss'
import '@shared/shared.css'
import '../polar-line-marker/polar-line-marker.css'
import '@shared/v5-parity.css'
import '@shared/theme-button'
import { angularScale, radialScale, axis, line } from '@lib'
import { generateExamplePolarData } from '@shared/data'
import { parityPolarPlot } from '@shared/v5-parity'

const data = generateExamplePolarData([0, 10], [0, 2], 100)
const xValues = data.map((event) => event.angular)
const yValues = data.map((event) => event.radial)
parityPolarPlot('chart-container', {
  scales: {
    a: angularScale({ domain: [0, 10], direction: 'anticlockwise', intercept: Math.PI / 2 }),
    r: radialScale({ domain: [0, 2] }),
  },
  axes: [
    axis('a', { style: 'classic', position: 'angular', tickCount: 8 }),
    axis('r', { style: 'classic', position: 'radial', tickCount: 5 }),
  ],
  marks: [
    line({
      x: 'a',
      y: 'r',
      xValues,
      yValues,
      stroke: 'skyblue',
      strokeWidth: 3,
      strokeLinecap: 'butt',
      strokeLinejoin: 'miter',
      digits: 3,
    }),
    line({
      x: 'a',
      y: 'r',
      xValues,
      yValues,
      line: false,
      digits: 3,
      markers: { render: 'classic', size: 20, fill: 'white', stroke: 'black', strokeWidth: 1 },
    }),
  ],
})

import '@lib/scss/wb-charts.scss'
import '@shared/shared.css'
import '../polar-range/polar-range.css'
import '@shared/v5-parity.css'
import '@shared/theme-button'
import { scaleSequential, interpolateWarm } from 'd3'
import { angularScale, radialScale, axis, band } from '@lib'
import { parityPolarPlot } from '@shared/v5-parity'

const data = [
  { angular: [0, 45], radial: [0, 1], value: 0 },
  { angular: [30, 90], radial: [2, 4], value: 1 },
  { angular: [120, 210], radial: [5, 6], value: 3 },
] as const
const color = scaleSequential(interpolateWarm)
for (const mapped of [false, true]) {
  parityPolarPlot(mapped ? 'chart-container-mapped' : 'chart-container-solid', {
    scales: {
      a: angularScale({ domain: [0, 360], direction: 'anticlockwise', intercept: Math.PI / 2 }),
      r: radialScale({ domain: [0, 6] }),
    },
    axes: [
      axis('a', { style: 'classic', position: 'angular', tickCount: 8 }),
      axis('r', { style: 'classic', position: 'radial', tickCount: 5 }),
    ],
    marks: data.map((entry) =>
      band({
        x: 'a',
        y: 'r',
        xValues: [entry.angular],
        yValues: [entry.radial],
        fill: mapped ? color(entry.value) : 'skyblue',
      }),
    ),
  })
}

import '@lib/scss/wb-charts.scss'
import '@shared/shared.css'
import '../range/range.css'
import '@shared/v5-parity.css'
import '@shared/theme-button'
import { axis, band, linearScale } from '@lib'
import { parityPlot } from '@shared/v5-parity'

parityPlot('chart-container', {
  scales: { x: linearScale({ domain: [0.5, 10] }), y: linearScale({ domain: [2, 12] }) },
  axes: [
    axis('x', { style: 'classic', position: 'bottom', tickCount: 5 }),
    axis('y', { style: 'classic', position: 'left', tickCount: 5 }),
  ],
  marks: [
    band({ x: 'x', y: 'y', xValues: [[1, 2]], yValues: [[2, 3]], fill: 'red' }),
    band({ x: 'x', y: 'y', xValues: [[0.5, 2.5]], yValues: [[2.5, 5]], fill: 'blue' }),
    band({ x: 'x', y: 'y', xValues: [[5, 10]], yValues: [[10, 12]], fill: 'green' }),
  ],
})

import '@lib/scss/wb-charts.scss'
import '@shared/shared.css'
import '../reverse/reverse.css'
import '@shared/v5-parity.css'
import '@shared/theme-button'
import { axis, line, linearScale, timeScale } from '@lib'
import { parityPlot } from '@shared/v5-parity'

parityPlot('chart-container', {
  scales: {
    x: linearScale({ domain: [0, 4] }),
    y: linearScale({ domain: [0, 20], reverse: true }),
  },
  axes: [
    axis('x', { style: 'classic', position: 'bottom', tickCount: 5, label: 'x', grid: true }),
    axis('y', {
      style: 'classic',
      position: 'left',
      tickCount: 5,
      label: 'y',
      unit: '[m]',
      grid: true,
    }),
  ],
  marks: [
    line({
      x: 'x',
      y: 'y',
      xValues: [0, 1, 2, 3, 4],
      yValues: [0, 1, 4, 9, 16],
      stroke: 'skyblue',
      strokeWidth: 2,
      strokeLinecap: 'butt',
      strokeLinejoin: 'miter',
      digits: 3,
    }),
  ],
})
parityPlot('chart-container-time', {
  scales: {
    x: timeScale({
      domain: [Date.parse('2025-01-01T12:00Z'), Date.parse('2025-01-05T12:00Z')],
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      locale: navigator.language,
    }),
    y: linearScale({ domain: [-1.5, 2], reverse: true }),
  },
  axes: [
    axis('x', {
      style: 'classic',
      position: 'bottom',
      tickCount: 5,
      label: 'Date',
      labelAngle: 45,
      crossAt: { scale: 'y', value: 0 },
    }),
    axis('y', { style: 'classic', position: 'left', tickCount: 5, grid: true }),
  ],
  marks: [
    line({
      x: 'x',
      y: 'y',
      xValues: Array.from(
        { length: 5 },
        (_, i) => Date.parse('2025-01-01T12:00Z') + i * 86_400_000,
      ),
      yValues: [-1, 1, 0, 2, 1],
      stroke: 'red',
      strokeWidth: 4,
      strokeDasharray: '5,5',
      strokeLinecap: 'butt',
      strokeLinejoin: 'miter',
      digits: 3,
      vectorEffect: 'none',
    }),
  ],
})

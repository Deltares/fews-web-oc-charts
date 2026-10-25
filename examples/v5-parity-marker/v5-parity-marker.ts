import '@lib/scss/wb-charts.scss'
import '@shared/shared.css'
import '../marker/marker.css'
import '@shared/v5-parity.css'
import '@shared/theme-button'
import { axis, line, linearScale, timeScale, tooltip } from '@lib'
import { generateExampleTimeSeriesData } from '@shared/data'
import { parityPlot } from '@shared/v5-parity'

const data = generateExampleTimeSeriesData(
  [new Date('2025-01-01T12:00Z'), new Date('2025-01-02T12:00Z')],
  [-2, 4],
  100,
)
for (const skip of [1, 5]) {
  parityPlot(skip === 1 ? 'chart-container' : 'chart-container-skip', {
    scales: {
      x: timeScale({
        domain: [+data[0].x, +data.at(-1)!.x],
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        locale: navigator.language,
      }),
      y: linearScale({ domain: [-3, 5] }),
    },
    axes: [
      axis('x', { style: 'classic', position: 'bottom', tickCount: 5 }),
      axis('y', { style: 'classic', position: 'left', tickCount: 5 }),
    ],
    marks: [
      line({
        x: 'x',
        y: 'y',
        xValues: data.map((event) => +event.x),
        yValues: data.map((event) => event.y),
        line: false,
        digits: 3,
        markers: {
          size: skip === 1 ? 50 : 100,
          skip,
          fill: skip === 1 ? 'black' : 'blue',
          stroke: skip === 1 ? 'red' : 'none',
          strokeWidth: 1,
        },
      }),
    ],
    plugins: [tooltip()],
  })
}

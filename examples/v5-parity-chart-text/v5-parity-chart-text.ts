import '@lib/scss/wb-charts.scss'
import '@shared/shared.css'
import '../chart-text/chart-text.css'
import '@shared/v5-parity.css'
import '@shared/theme-button'
import { axis, line, text, linearScale, timeScale } from '@lib'
import { generateExampleTimeSeriesData } from '@shared/data'
import { parityPlot, onParityThemeChange } from '@shared/v5-parity'

const data = generateExampleTimeSeriesData(
  [new Date('2025-01-01T12:00Z'), new Date('2025-01-02T12:00Z')],
  [-1, 1],
  100,
)
const xValues = data.map((event) => +event.x)
const yValues = data.map((event) => event.y)
const y = linearScale({ domain: [0, 1] })
onParityThemeChange(() => y.update({ domain: [-1.5, 1.5] }))
parityPlot('chart-container', {
  scales: {
    x: timeScale({
      domain: [xValues[0], xValues.at(-1)!],
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      locale: navigator.language,
    }),
    y,
  },
  axes: [
    axis('x', { style: 'classic', position: 'bottom', tickCount: 5 }),
    axis('y', { style: 'classic', position: 'left', tickCount: 5 }),
  ],
  marks: [
    line({
      x: 'x',
      y: 'y',
      xValues,
      yValues,
      stroke: 'skyblue',
      strokeWidth: 2,
      strokeLinecap: 'butt',
      strokeLinejoin: 'miter',
      digits: 3,
    }),
    text({
      x: 'x',
      y: 'y',
      xValues,
      yValues,
      textValues: data.map((event, index) => (index % 5 === 0 ? event.y.toFixed(2) : null)),
      textAnchor: 'middle',
      dominantBaseline: 'middle',
      fill: 'var(--text-color)',
    }),
  ],
})

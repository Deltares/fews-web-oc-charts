import '@lib/scss/wb-charts.scss'
import '@shared/shared.css'
import '../area/area.css'
import '@shared/v5-parity.css'
import '@shared/theme-button'
import { axis, band, line, linearScale, timeScale, type BandOptions } from '@lib'
import { generateExampleTimeSeriesData } from '@shared/data'
import { parityPlot } from '@shared/v5-parity'

const data = generateExampleTimeSeriesData(
  [new Date('2025-01-01T12:00Z'), new Date('2025-01-02T12:00Z')],
  [-2, 4],
  20,
)
function scales(offset: number) {
  return {
    x: timeScale({
      domain: [+data[0].x, +data.at(-1)!.x],
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      locale: navigator.language,
    }),
    y: linearScale({
      domain: [
        Math.min(...data.map((event) => event.y)) - 1 - offset,
        Math.max(...data.map((event) => event.y)) + 1 + offset,
      ],
    }),
  }
}
const axes = () => [
  axis('x', { style: 'classic', position: 'bottom', tickCount: 5 }),
  axis('y', { style: 'classic', position: 'left', tickCount: 5 }),
]
const area = (offset: number, curve: BandOptions['curve'], fill: string, opacity = 1) =>
  band({
    x: 'x',
    y: 'y',
    xValues: data.map((event) => [+event.x, +event.x]),
    yValues: data.map((event) => [event.y - 1 + offset, event.y + 1 + offset]),
    curve,
    fill,
    opacity,
  })
parityPlot('chart-container', {
  scales: scales(0),
  axes: axes(),
  marks: [area(0, 'linear', 'skyblue')],
})
parityPlot('chart-container-step', {
  scales: scales(3),
  axes: axes(),
  marks: (
    [
      [-3, 'step-before', 'blue'],
      [0, 'step', 'green'],
      [3, 'step-after', 'red'],
    ] as const
  ).flatMap(([offset, curve, fill]) => [
    area(offset, curve, fill, 0.5),
    line({
      x: 'x',
      y: 'y',
      xValues: data.map((event) => +event.x),
      yValues: data.map((event) => event.y + 1 + offset),
      line: false,
      digits: 3,
      markers: { size: 40, fill: 'white', stroke: fill, strokeWidth: 2 },
    }),
  ]),
})

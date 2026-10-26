import '@lib/scss/wb-charts.scss'
import '@shared/shared.css'
import '../matrix/matrix.css'
import '@shared/v5-parity.css'
import '@shared/theme-button'
import { scaleBand } from 'd3'
import { axis, band, bandScale, linearScale, timeScale, type PlotMark } from '@lib'
import { parityPlot, onParityThemeChange } from '@shared/v5-parity'
import { exampleRandom } from '@shared/random'
import { generateExampleTimeSeriesData } from '@shared/data'
import availability from '../matrix/example-data.json'

const random = exampleRandom()
const keys = Array.from({ length: 25 }, (_, index) => String(index))
const x = scaleBand().domain(keys).range([0, 1]).paddingInner(0.2)
const y = scaleBand().domain(keys).range([1, 0]).paddingInner(0.2)
const marks: PlotMark[] = []
for (const i of keys) {
  for (const j of keys) {
    const value = random() < 0.7 ? null : random()
    if (value === null) continue
    marks.push(
      band({
        x: 'cellsX',
        y: 'cellsY',
        xValues: [[x(i)!, x(i)! + x.bandwidth()]],
        yValues: [[1 - y(j)! - y.bandwidth(), 1 - y(j)!]],
        fill: 'blue',
        shapeRendering: 'crispEdges',
      }),
    )
  }
}
const sparseX = bandScale({ domain: [] })
const sparseY = bandScale({ domain: [] })
const sparse = parityPlot('chart-container-sparsity', {
  margins: { top: 0, right: 0, bottom: 0, left: 0 },
  scales: {
    x: sparseX,
    y: sparseY,
    cellsX: linearScale({ domain: [0, 1] }),
    cellsY: linearScale({ domain: [0, 1] }),
  },
  directions: { cellsX: 'x', cellsY: 'y' },
  axes: [
    axis('x', { style: 'classic', position: 'bottom', tickCount: 5 }),
    axis('y', { style: 'classic', position: 'left', tickCount: 5 }),
  ],
  marks: [
    band({
      x: 'cellsX',
      y: 'cellsY',
      xValues: [[0, 0.8]],
      yValues: [[0.2, 1]],
      fill: 'blue',
      shapeRendering: 'crispEdges',
    }),
  ],
})
const availabilityX = bandScale({ domain: [] })
const availabilityY = bandScale({ domain: [] })
parityPlot('chart-container-availability', {
  margins: { top: 0, right: 0, bottom: 0, left: 0 },
  scales: {
    x: availabilityX,
    y: availabilityY,
  },
  axes: [
    axis('x', { style: 'classic', position: 'bottom', tickCount: 5 }),
    axis('y', { style: 'classic', position: 'left', tickCount: 5 }),
  ],
})
const timeData = generateExampleTimeSeriesData(
  [new Date('2025-01-01T12:00Z'), new Date('2025-01-02T12:00Z')],
  [-2, 4],
  10,
)
const timeY = bandScale({ domain: [] })
parityPlot('chart-container-time', {
  margins: { top: 0, right: 0, bottom: 0, left: 0 },
  scales: {
    x: timeScale({
      domain: [+timeData[0].x, +timeData.at(-1)!.x],
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      locale: navigator.language,
    }),
    y: timeY,
  },
  axes: [
    axis('x', { style: 'classic', position: 'bottom', tickCount: 5 }),
    axis('y', { style: 'classic', position: 'left', tickCount: 5 }),
  ],
})
onParityThemeChange(() => {
  sparseX.update({ domain: keys })
  sparseY.update({ domain: keys })
  sparse.update({ marks })
  availabilityX.update({ domain: [...new Set(availability.map((event) => event.date))] })
  availabilityY.update({ domain: [...new Set(availability.map((event) => event.series))] })
  timeY.update({
    domain: [...new Set<string>(timeData.map((event) => String(Math.round(event.y))))],
  })
})

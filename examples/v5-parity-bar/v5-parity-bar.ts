import '@lib/scss/wb-charts.scss'
import '@shared/shared.css'
import '../bar/bar.css'
import '@shared/v5-parity.css'
import '@shared/theme-button'
import { scaleSequential, interpolateRdYlGn } from 'd3'
import {
  axis,
  bar,
  line,
  createTable,
  bandScale,
  linearScale,
  timeScale,
  tooltip,
  type PlotMark,
} from '@lib'
import { generateExampleTimeSeriesData } from '@shared/data'
import { parityPlot, onParityThemeChange } from '@shared/v5-parity'

const data = generateExampleTimeSeriesData(
  [new Date('2025-01-01T12:00Z'), new Date('2025-01-02T12:00Z')],
  [-2, 4],
  100,
)
const color = scaleSequential(interpolateRdYlGn).domain([-2, 4])
for (const mapped of [false, true]) {
  const marks: PlotMark[] = data.map((event, index) =>
    bar(
      createTable({
        x: [+event.x],
        y: [event.y],
        start: [+(data[index - 1]?.x ?? event.x)],
        end: [+event.x],
      }),
      {
        x: 'x',
        y: 'y',
        scales: { x: 'x', y: 'y' },
        interval: { start: 'start', end: 'end' },
        fill: mapped ? color(event.y) : 'none',
        stroke: mapped ? 'black' : 'white',
        strokeWidth: 1,
        groupPadding: 0,
        layerPadding: 0,
      },
    ),
  )
  if (!mapped)
    marks.push(
      line({
        x: 'x',
        y: 'y',
        xValues: data.map((event) => +event.x),
        yValues: data.map((event) => event.y),
        stroke: 'black',
        strokeWidth: 1,
        strokeLinecap: 'butt',
        strokeLinejoin: 'miter',
        digits: 3,
        vectorEffect: 'none',
      }),
    )
  parityPlot(mapped ? 'chart-container-colormapped' : 'chart-container-simple', {
    scales: {
      x: timeScale({
        domain: [+data[0].x, +data.at(-1)!.x],
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        locale: navigator.language,
      }),
      y: linearScale({
        domain: [
          Math.min(...data.map((event) => event.y)),
          Math.max(...data.map((event) => event.y)),
        ],
      }),
    },
    axes: [
      axis('x', { style: 'classic', position: 'bottom', tickCount: 5 }),
      axis('y', { style: 'classic', position: 'left', tickCount: 5 }),
    ],
    marks,
    plugins: [tooltip()],
  })
}
const dates = ['2025-01-01', '2025-01-02']
const groupedX = bandScale({ domain: [] })
const groupedY = linearScale({ domain: [0, 1] })
onParityThemeChange(() => {
  groupedX.update({ domain: dates })
  groupedY.update({ domain: [0, 8] })
})
parityPlot('chart-container-grouped', {
  scales: {
    x: groupedX,
    groups: bandScale({ domain: dates, paddingInner: 0.1, paddingOuter: 0.2 }),
    y: groupedY,
  },
  axes: [
    axis('x', { style: 'classic', position: 'bottom', tickCount: 5 }),
    axis('y', { style: 'classic', position: 'left', tickCount: 5 }),
  ],
  marks: [
    bar(createTable({ date: dates, a: [1, 6], b: [2, 5], c: [3, 4] }), {
      x: 'date',
      scales: { x: 'groups', y: 'y' },
      layout: 'grouped',
      layers: [
        { id: 'model A', y: 'a' },
        { id: 'model B', y: 'b' },
        { id: 'model C', y: 'c' },
      ],
      groupPadding: 0,
      layerPadding: 0.05,
      fill: 'none',
      stroke: 'none',
      text: { format: (value, id) => `${id}: ${value}`, dy: -5, fill: 'black' },
    }),
  ],
  plugins: [tooltip()],
})

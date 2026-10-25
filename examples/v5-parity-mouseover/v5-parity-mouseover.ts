import '../shared/v5.css'
import './v5-parity-mouseover.css'
import { generateExampleTimeSeriesData, generateExampleValueSeriesData } from '@shared'
import { axis, crosshair, line, linearScale, timeScale, tooltip } from '@lib'
import { parityPlot } from '../shared/v5-parity'

type ExampleData = { x: number[]; y: number[] }

const valueData: ExampleData[] = [
  generateExampleValueSeriesData([-4, 10], [-2, 4], 100),
  generateExampleValueSeriesData([0, 5], [-1, 1], 100),
  generateExampleValueSeriesData([6, 8], [2, 3], 100),
].map((events) => ({
  x: events.map(({ x }) => x),
  y: events.map(({ y }) => y),
}))

const timeStart = Date.UTC(2025, 0, 1, 10)
const timeEnd = Date.UTC(2025, 0, 2, 16)
const timeData = [
  generateExampleTimeSeriesData(
    [new Date('2025-01-01T12:00Z'), new Date('2025-01-02T12:00Z')],
    [-2, 4],
    100,
  ),
  generateExampleTimeSeriesData(
    [new Date('2025-01-01T12:00Z'), new Date('2025-01-01T18:00Z')],
    [-1, 1],
    100,
  ),
  generateExampleTimeSeriesData(
    [new Date('2025-01-01T20:00Z'), new Date('2025-01-02T08:00Z')],
    [2, 3],
    100,
  ),
].map((events) => ({
  x: events.map(({ x }) => x.getTime()),
  y: events.map(({ y }) => y),
}))

const colors = ['skyblue', 'red', 'green']
const names = ['Example 1', 'Example 2', 'Example 3']

function createMarks(data: ExampleData[]) {
  return data.map((samples, index) =>
    line({
      id: names[index],
      label: names[index],
      x: 'x',
      y: 'y',
      xValues: samples.x,
      yValues: samples.y,
      stroke: colors[index],
      strokeWidth: 2,
      digits: 3,
    }),
  )
}

const valueMarks = createMarks(valueData)
const valueCrosshair = crosshair({
  mode: 'x',
  snap: { mark: valueMarks[0], axis: 'x' },
  labels: { x: 'x' },
})
parityPlot('all-series', {
  directions: { x: 'x', y: 'y' },
  scales: {
    x: linearScale({ domain: [-6, 12] }),
    y: linearScale({ domain: [-3, 5] }),
  },
  axes: [
    axis('x', { style: 'classic', position: 'bottom', label: 'x', tickCount: 6 }),
    axis('y', { style: 'classic', position: 'left', label: 'y', tickCount: 5, grid: true }),
  ],
  marks: valueMarks,
  plugins: [
    valueCrosshair,
    tooltip({
      marks: valueMarks,
      crosshair: valueCrosshair,
      formatValue: (value, context) =>
        context.axis === 'x' ? Number(value).toFixed(2) : context.defaultText,
    }),
  ],
})

const timeMarks = createMarks(timeData)
const selectedMarks = [timeMarks[0], timeMarks[2]]
const timeCrosshair = crosshair({
  mode: 'x',
  snap: { mark: timeMarks[0], axis: 'x' },
  labels: { x: 'x' },
})
parityPlot('selected-series', {
  directions: { x: 'x', y: 'y' },
  scales: {
    x: timeScale({
      domain: [timeStart, timeEnd],
      timeZone: 'UTC',
      locale: 'en-GB',
    }),
    y: linearScale({ domain: [-3, 5] }),
  },
  axes: [
    axis('x', {
      style: 'classic',
      position: 'bottom',
      label: 'Time (UTC)',
      tickCount: 6,
      labelAngle: 45,
    }),
    axis('y', { style: 'classic', position: 'left', label: 'y', tickCount: 5, grid: true }),
  ],
  marks: timeMarks,
  plugins: [timeCrosshair, tooltip({ marks: selectedMarks, crosshair: timeCrosshair })],
})

const formattedMarks = createMarks(valueData)
const formattedValueScale = linearScale({ domain: [-3, 5] })
const formattedCrosshair = crosshair({
  mode: 'x',
  snap: { mark: formattedMarks[0], axis: 'x' },
  labels: { x: 'x' },
})
parityPlot('formatted-series', {
  directions: { x: 'x', y: 'y' },
  scales: { x: linearScale({ domain: [-6, 12] }), y: formattedValueScale },
  axes: [
    axis('x', { style: 'classic', position: 'bottom', label: 'x', tickCount: 6 }),
    axis('y', {
      style: 'classic',
      position: 'left',
      label: 'Value',
      unit: 'm',
      tickCount: 5,
      grid: true,
    }),
  ],
  marks: formattedMarks,
  plugins: [
    formattedCrosshair,
    tooltip({
      marks: formattedMarks,
      crosshair: formattedCrosshair,
      digits: 2,
      formatValue: (value, context) => {
        if (context.axis === 'x') return Number(value).toFixed(2)
        if (context.axis !== 'y') return context.defaultText
        const [minimum, maximum] = formattedValueScale.domain.get()
        const number = Number(value).toFixed(context.digits ?? 2)
        return `Value: ${number} (Extent: ${Number(minimum).toFixed(2)}–${Number(maximum).toFixed(2)})`
      },
      formatUnit: (context) => (context.axis === 'y' ? 'm' : ''),
    }),
  ],
})

const verticalMarks = createMarks(valueData)
const verticalCrosshair = crosshair({
  mode: 'y',
  snap: { mark: verticalMarks[0], axis: 'y' },
  labels: { y: 'y' },
})
parityPlot('vertical-series', {
  directions: { x: 'x', y: 'y' },
  scales: {
    x: linearScale({ domain: [-6, 12] }),
    y: linearScale({ domain: [-3, 5] }),
  },
  axes: [
    axis('x', { style: 'classic', position: 'bottom', label: 'x', tickCount: 6 }),
    axis('y', { style: 'classic', position: 'left', label: 'y', tickCount: 5, grid: true }),
  ],
  marks: verticalMarks,
  plugins: [
    verticalCrosshair,
    tooltip({
      axis: 'y',
      marks: verticalMarks,
      crosshair: verticalCrosshair,
      digits: 3,
      formatValue: (value, context) =>
        context.axis === 'y'
          ? `Value: ${Number(value).toFixed(3)}`
          : context.axis === 'x'
            ? Number(value).toFixed(2)
            : context.defaultText,
    }),
  ],
})

import '@lib/scss/wb-charts.scss'
import '@shared/shared.css'
import './mouseover.css'

import '@shared/theme-button'

import { AxisType, CartesianAxes, ChartLine, MouseOver } from '@lib'
import {
  ExampleEvent,
  generateExampleTimeSeriesData,
  generateExampleValueSeriesData,
} from '@shared'

interface ExampleData<T extends Date | number> {
  id: string
  color: string
  events: ExampleEvent<T>[]
}

function createExampleChart<T extends Date | number>(
  containerId: string,
  exampleData: ExampleData<T>[],
  xAxisType: AxisType,
  domainX: [T, T],
  domainY: [number, number],
): CartesianAxes {
  // Create new axes.
  const container = document.getElementById(containerId)

  const axes = new CartesianAxes(container, null, null, {
    x: [
      {
        type: xAxisType,
        domain:
          xAxisType === AxisType.time ? (domainX as [Date, Date]) : (domainX as [number, number]),
      },
    ],
    y: [{ type: AxisType.value, domain: domainY }],
    automargin: true,
  })

  // Create line.
  exampleData.forEach((data) => {
    const line = new ChartLine(data.events, {})
    line.addTo(
      axes,
      {
        x: { key: 'x', axisIndex: 0 },
        y: { key: 'y', axisIndex: 0 },
      },
      data.id,
      {
        fill: 'none',
        stroke: data.color,
        'stroke-width': '2',
      },
    )
  })
  axes.redraw({ x: { autoScale: true }, y: { autoScale: true } })

  return axes
}

// Generate simple scalar value series example data with various amplitudes.
const exampleValueData: ExampleData<number>[] = [
  {
    id: 'example-1',
    color: 'skyblue',
    events: generateExampleValueSeriesData([-4, 10], [-2, 4], 100),
  },
  {
    id: 'example-2',
    color: 'red',
    events: generateExampleValueSeriesData([0, 5], [-1, 1], 100),
  },
  {
    id: 'example-3',
    color: 'green',
    events: generateExampleValueSeriesData([6, 8], [2, 3], 100),
  },
]

// Generate simple scalar time series example data with various amplitudes.
const exampleTimeData: ExampleData<Date>[] = [
  {
    id: 'example-1',
    color: 'skyblue',
    events: generateExampleTimeSeriesData(
      [new Date('2025-01-01T12:00Z'), new Date('2025-01-02T12:00Z')],
      [-2, 4],
      100,
    ),
  },
  {
    id: 'example-2',
    color: 'red',
    events: generateExampleTimeSeriesData(
      [new Date('2025-01-01T12:00Z'), new Date('2025-01-01T18:00Z')],
      [-1, 1],
      100,
    ),
  },
  {
    id: 'example-3',
    color: 'green',
    events: generateExampleTimeSeriesData(
      [new Date('2025-01-01T20:00Z'), new Date('2025-01-02T08:00Z')],
      [2, 3],
      100,
    ),
  },
]

// Add mouseover showing all members of a value chart.
const axesAll = createExampleChart(
  'chart-container-1',
  exampleValueData,
  AxisType.value,
  [-6, 12],
  [-3, 5],
)
const mouseOverAll = new MouseOver()
axesAll.accept(mouseOverAll)

// Add mouseover showing only two of the three lines in a time series chart.
const axesSelection = createExampleChart(
  'chart-container-2',
  exampleTimeData,
  AxisType.time,
  [new Date('2025-01-01T10:00Z'), new Date('2025-01-02T16:00Z')],
  [-3, 5],
)
const mouseOverSelection = new MouseOver(['example-1', 'example-3'])
axesSelection.accept(mouseOverSelection)

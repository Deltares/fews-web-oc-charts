import '@lib/scss/wb-charts.scss'
import '@shared/shared.css'
import './shared-panning.css'

import '@shared/theme-button'

import { AxisType, CartesianAxes, CartesianAxesOptions, ChartLine, PanHandler } from '@lib'
import { type ExampleEvent, generateExampleTimeSeriesData } from '../shared'

function createAxes(
  containerId: string,
  data: ExampleEvent<Date>[],
  domain: [Date, Date],
): CartesianAxes {
  const axesOptions: CartesianAxesOptions = {
    x: [{ type: AxisType.time, labelAngle: 45, domain }],
    y: [{ type: AxisType.value }],
    automargin: true,
  }
  const container = document.getElementById(containerId)
  const axes = new CartesianAxes(container, null, null, axesOptions)

  const line = new ChartLine(data, {})
  line.addTo(
    axes,
    {
      x: { key: 'x', axisIndex: 0 },
      y: { key: 'y', axisIndex: 0 },
    },
    'example-time',
    {
      fill: 'none',
      stroke: 'red',
      'stroke-width': '4',
      'stroke-dasharray': '5,5',
    },
  )
  axes.redraw({ x: { autoScale: true }, y: { autoScale: true } })

  return axes
}

const domain: [Date, Date] = [new Date('2025-01-01T00:00Z'), new Date('2025-01-05T00:00Z')]

const exampleData1 = generateExampleTimeSeriesData(
  [new Date('2025-01-02T00:00Z'), new Date('2025-01-05T00:00Z')],
  [-1, 1],
  100,
)
const exampleData2 = generateExampleTimeSeriesData(
  [new Date('2025-01-01T00:00Z'), new Date('2025-01-04T00:00Z')],
  [0, 2],
  100,
)

const axes1 = createAxes('chart-container-1', exampleData1, domain)
const axes2 = createAxes('chart-container-2', exampleData2, domain)

// Create pan handler shared between the two axes.
const panHandler = new PanHandler({ mouseButton: 0 })
axes1.accept(panHandler)
axes2.accept(panHandler)

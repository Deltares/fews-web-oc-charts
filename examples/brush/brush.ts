import '@lib/scss/wb-charts.scss'
import '@shared/shared.css'
import './brush.css'

import '@shared/theme-button'

import { ExampleEvent, generateExampleTimeSeriesData } from '@shared'

import {
  AxisType,
  CartesianAxes,
  CartesianAxesOptions,
  ChartLine,
  BrushHandler,
  ZoomHandler,
  PanHandler,
  ModifierKey,
} from '@lib'

function createAxes(
  containerId: string,
  data: ExampleEvent<Date>[],
  domain: [Date, Date],
  showAxis: boolean = true,
): CartesianAxes {
  const axesOptions: CartesianAxesOptions = {
    x: [{ type: AxisType.time, labelAngle: 45, domain, showAxis }],
    y: [{ type: AxisType.value, showAxis }],
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

const domain: [Date, Date] = [new Date('2025-01-01T00:00Z'), new Date('2025-01-03T00:00Z')]
const dataDomain: [Date, Date] = [new Date('2025-01-01T00:00Z'), new Date('2025-01-08T00:00Z')]

const exampleData1 = generateExampleTimeSeriesData(dataDomain, [-1, 1], 100)

const axes1 = createAxes('chart-container', exampleData1, domain)

const zoomHandler = new ZoomHandler()
axes1.accept(zoomHandler)

const panHandler = new PanHandler({ mouseButton: 0, modifierKey: ModifierKey.Shift })
axes1.accept(panHandler)

const axes2 = createAxes('chart-container-mini', exampleData1, dataDomain, false)

const brushHandler = new BrushHandler({ brushMode: 'X' })
brushHandler.addAxes(axes1)

axes2.accept(brushHandler)

// Without this setTimeout, the brush will not be updated on initial load.
setTimeout(() => {
  brushHandler.updateBrushDomain({
    x: domain,
  })
})

axes1.addEventListener('update:x-domain', (e) => {
  brushHandler.updateBrushDomain({
    x: e.new,
  })
})

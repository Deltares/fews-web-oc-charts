import '@lib/scss/wb-charts.scss'
import '@shared/shared.css'
import './wheel-zoom.css'

import '@shared/theme-button'

import { AxisType, CartesianAxes, ChartLine, ModifierKey, WheelMode, ZoomHandler } from '@lib'
import { type ExampleEvent, generateExampleTimeSeriesData } from '@shared'

function createChart(containerId: string, exampleData: ExampleEvent<Date>[]): CartesianAxes {
  const container = document.getElementById(containerId)
  const axes = new CartesianAxes(container, null, null, {
    x: [{ type: AxisType.time }],
    y: [{ type: AxisType.value, defaultDomain: [-1.5, 1.5] }],
    automargin: true,
  })

  const line = new ChartLine(exampleData, {})
  line.addTo(axes, { x: { key: 'x', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } }, 'example', {
    fill: 'none',
    stroke: 'skyblue',
    'stroke-width': '2',
  })
  axes.redraw({ x: { autoScale: true }, y: { autoScale: true } })

  return axes
}

const exampleData = generateExampleTimeSeriesData(
  [new Date('2025-01-01T00:00Z'), new Date('2025-01-05T00:00Z')],
  [-1, 1],
  100,
)

const axesZoomXY = createChart('chart-container-zoom-xy', exampleData)
const zoomHandlerXY = new ZoomHandler(WheelMode.XY)
axesZoomXY.accept(zoomHandlerXY)

const axesZoomX = createChart('chart-container-zoom-x', exampleData)
const zoomHandlerX = new ZoomHandler(WheelMode.X)
axesZoomX.accept(zoomHandlerX)

const axesZoomY = createChart('chart-container-zoom-y', exampleData)
const zoomHandlerY = new ZoomHandler(WheelMode.Y)
axesZoomY.accept(zoomHandlerY)

const axesZoomModifier = createChart('chart-container-zoom-modifier', exampleData)
const zoomHandlerModifier = new ZoomHandler(WheelMode.XY, ModifierKey.Shift)
axesZoomModifier.accept(zoomHandlerModifier)

const axesNoWheel = createChart('chart-container-no-wheel', exampleData)
const zoomHandlerNoWheel = new ZoomHandler()
axesNoWheel.accept(zoomHandlerNoWheel)

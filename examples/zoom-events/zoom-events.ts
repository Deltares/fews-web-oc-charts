import '@lib/scss/wb-charts.scss'
import '@shared/shared.css'
import './zoom-events.css'

import '@shared/theme-button'

import { AxisType, CartesianAxes, ChartLine, WheelMode, ZoomHandler } from '@lib'
import { generateExampleTimeSeriesData } from '@shared'

function updateStatus(status: string): void {
  const statusElement = document.getElementById('status')
  statusElement.textContent = status
}

const exampleData = generateExampleTimeSeriesData(
  [new Date('2025-01-01T00:00Z'), new Date('2025-01-05T00:00Z')],
  [-1, 1],
  100,
)

const container = document.getElementById('chart-container')
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

const zoomHandler = new ZoomHandler(WheelMode.XY)
axes.accept(zoomHandler)

zoomHandler.addEventListener('zoom', (event) => updateStatus(`Zoomed: ${event.mode}`))
zoomHandler.addEventListener('reset-zoom', () => updateStatus('Zoom reset'))

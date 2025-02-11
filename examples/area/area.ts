import '@lib/scss/wb-charts.scss'
import '@shared/shared.css'
import './area.css'

import '@shared/theme-button'

import { AxisType, CartesianAxes, ChartArea } from '@lib'
import { generateExampleData } from '@shared'

function createAxes(containerId: string): CartesianAxes {
  const container = document.getElementById(containerId)
  return new CartesianAxes(container, null, null, {
    x: [{ type: AxisType.time }],
    y: [{ type: AxisType.value }],
    automargin: true,
  })
}

// Data for an area chart consists of two y-values for each x-value: the bottom
// and top of the area for each x-value. As an example, generate scalar data,
// then add a fixed offset to those data.
const startTime = new Date('2025-01-01T12:00Z')
const endTime = new Date('2025-01-02T12:00Z')
const scalarData = generateExampleData([startTime, endTime], [-2, 4], 20)
const exampleData = scalarData.map(({ x, y }) => ({
  x,
  y: [y - 1, y + 1],
}))
const offsetExampleData = (offset: number) =>
  exampleData.map(({ x, y }) => ({
    x,
    y: y.map((value) => value + offset),
  }))

// Create area chart with smooth curve.
const axes = createAxes('chart-container')
const area = new ChartArea(exampleData, {})
area.addTo(axes, { x: { key: 'x', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } }, 'example', {
  fill: 'skyblue',
})
axes.redraw({ x: { autoScale: true }, y: { autoScale: true } })

// Create area chart with stepped curve, before in the middle, and after the
// data point.
const axesStep = createAxes('chart-container-step')
const areaStepBefore = new ChartArea(offsetExampleData(-3), { curve: 'stepBefore' })
areaStepBefore.addTo(
  axesStep,
  { x: { key: 'x', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } },
  'example',
  { fill: 'blue', opacity: 0.5 },
)
const areaStepMiddle = new ChartArea(exampleData, { curve: 'step' })
areaStepMiddle.addTo(
  axesStep,
  { x: { key: 'x', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } },
  'example',
  {
    fill: 'green',
    opacity: 0.5,
  },
)
const areaStepAfter = new ChartArea(offsetExampleData(3), { curve: 'stepAfter' })
areaStepAfter.addTo(
  axesStep,
  { x: { key: 'x', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } },
  'example',
  {
    fill: 'red',
    opacity: 0.5,
  },
)

axesStep.redraw({ x: { autoScale: true }, y: { autoScale: true } })

import '@lib/scss/wb-charts.scss'
import '@shared/shared.css'
import './area.css'

import '@shared/theme-button'

import { AxisType, CartesianAxes, ChartArea, ChartMarker } from '@lib'
import { generateExampleTimeSeriesData } from '@shared'

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
const exampleScalarData = generateExampleTimeSeriesData([startTime, endTime], [-2, 4], 20)
const exampleAreaData = exampleScalarData.map(({ x, y }) => ({
  x,
  y: [y - 1, y + 1],
}))
const offsetExampleAreaData = (offset: number) =>
  exampleAreaData.map(({ x, y }) => ({
    x,
    y: y.map((value) => value + offset),
  }))
const upperBoundExampleAreaData = (offset: number) =>
  exampleAreaData.map(({ x, y }) => ({
    x,
    y: y[1] + offset,
  }))

const axisIndex = { x: { key: 'x', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } }

// Create area chart with smooth curve.
const axes = createAxes('chart-container')
const area = new ChartArea(exampleAreaData, {})
area.addTo(axes, axisIndex, 'example', {
  fill: 'skyblue',
})
axes.redraw({ x: { autoScale: true }, y: { autoScale: true } })

// Create area chart with stepped curve, before in the middle, and after the
// data point.
const axesStep = createAxes('chart-container-step')
const markerOptions = { symbol: { size: 40 } }

const referenceMarkersStepBefore = new ChartMarker(upperBoundExampleAreaData(-3), markerOptions)
const areaStepBefore = new ChartArea(offsetExampleAreaData(-3), { curve: 'stepBefore' })
areaStepBefore.addTo(axesStep, axisIndex, 'example-area-step-before', {
  fill: 'blue',
  opacity: 0.5,
})
referenceMarkersStepBefore.addTo(axesStep, axisIndex, 'example-line-step-before', {
  fill: 'white',
  stroke: 'blue',
  'stroke-width': '2',
})

const referenceMarkersStepMiddle = new ChartMarker(upperBoundExampleAreaData(0), markerOptions)
const areaStepMiddle = new ChartArea(exampleAreaData, { curve: 'step' })
areaStepMiddle.addTo(axesStep, axisIndex, 'example-area-step-middle', {
  fill: 'green',
  opacity: 0.5,
})
referenceMarkersStepMiddle.addTo(axesStep, axisIndex, 'example-line-step-middle', {
  fill: 'white',
  stroke: 'green',
  'stroke-width': '2',
})

const referenceMarkersStepAfter = new ChartMarker(upperBoundExampleAreaData(3), markerOptions)
const areaStepAfter = new ChartArea(offsetExampleAreaData(3), { curve: 'stepAfter' })
areaStepAfter.addTo(axesStep, axisIndex, 'example-area-step-after', {
  fill: 'red',
  opacity: 0.5,
})
referenceMarkersStepAfter.addTo(axesStep, axisIndex, 'example-line-step-after', {
  fill: 'white',
  stroke: 'red',
  'stroke-width': '2',
})

axesStep.redraw({ x: { autoScale: true }, y: { autoScale: true } })

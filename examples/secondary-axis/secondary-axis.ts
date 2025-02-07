import '@lib/scss/wb-charts.scss'
import '@shared/shared.css'
import './secondary-axis.css'

import * as d3 from 'd3'
import {
  AxisPosition,
  AxisType,
  CartesianAxes,
  ChartArea,
  ChartLine,
  ChartMarker,
  CurrentTime,
  MouseOver,
  ZoomHandler,
} from '@lib'
import { addListenerByClassName, percentile } from '@shared'

const container = document.getElementById('chart-container-1')
const axis = new CartesianAxes(container, null, null, {
  x: [{ type: AxisType.time, showGrid: true }],
  y: [
    { label: 'Waterstand', unit: 'cm', showGrid: true, domain: [-450, 150] },
    {
      label: 'Wind richting',
      unit: 'deg',
      position: AxisPosition.Right,
      type: AxisType.degrees,
      domain: [-150, 450],
    },
  ],
  margin: { left: 10, right: 10 },
  automargin: true,
})

const refDate = new Date()
const mouseOver = new MouseOver(['control', 'median'])
const zoom = new ZoomHandler()
const currentTime = new CurrentTime({ x: { axisIndex: 0 } })

function dataload() {
  d3.json('../data/ensemble.json')
    .then(function (data) {
      const nEnsemble = data.values[0].length
      const members = Array(nEnsemble)
      const percentiles = [[], [], []]

      for (let s = 0; s < nEnsemble; s++) {
        members[s] = []
      }
      const medianTime = (data.times[0] + data.times[data.times.length - 1]) / 2

      data.times.forEach(function (time, index) {
        const dateTime = new Date((time - medianTime) * 1000 + refDate.getTime())
        for (let i = 0; i < nEnsemble; i++) {
          members[i].push({ x: dateTime, y: data.values[index][i] })
        }
        const points = data.values[index]
        percentiles[0].push({ x: dateTime, y: percentile(0.5, points) })
        percentiles[1].push({ x: dateTime, y: percentile([0.25, 0.75], points) })
        percentiles[2].push({ x: dateTime, y: percentile([0.05, 0.95], points) })
      })

      const plotControl1 = new ChartLine(members[0], {})
      const plotMedian1 = new ChartMarker(percentiles[0], {})
      const plotPercentile50 = new ChartArea(percentiles[1], {})
      const plotPercentile90 = new ChartArea(percentiles[2], {})

      const style90 = {
        fill: 'skyblue',
        stroke: 'skyblue',
      }
      const style50 = {
        fill: 'deepskyblue',
        stroke: 'deepskyblue',
      }
      plotPercentile90.addTo(
        axis,
        { x: { key: 'x', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } },
        'percent90',
        style90
      )
      plotPercentile50.addTo(
        axis,
        { x: { key: 'x', axisIndex: 0 }, y: { key: 'y', axisIndex: 1 } },
        'percent50',
        style50
      )

      plotControl1.addTo(
        axis,
        { x: { key: 'x', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } },
        'control',
        '#control-line'
      )
      plotMedian1.addTo(
        axis,
        { x: { key: 'x', axisIndex: 0 }, y: { key: 'y', axisIndex: 1 } },
        'median',
        '#median-line'
      )
      axis.accept(currentTime)
      axis.redraw({ x: { autoScale: true }, y: { autoScale: true } })
      axis.zoom()
      axis.accept(zoom)
      axis.accept(mouseOver)
    })
    .catch((error) => console.error(`Failed to create chart: ${error}`))
}
window.setTimeout(dataload, 1)

addListenerByClassName('theme-button', 'click', () =>
  document.documentElement.classList.toggle('dark')
)

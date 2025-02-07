import '@lib/scss/wb-charts.scss'
import '@shared/shared.css'
import './ensemblezoom.css'

import * as d3 from 'd3'
import { AxisPosition, AxisType, CartesianAxes, ChartArea, ChartLine } from '@lib'
import { addListenerByClassName, percentile } from '@shared'

const height = null
const width = null
const container1 = document.getElementById('chart-container-1')

const axis1 = new CartesianAxes(container1, width, height, {
  x: [
    {
      type: AxisType.time,
      label: 'datum',
      position: AxisPosition.AtZero,
      showGrid: false,
    },
  ],
  y: [],
})
const container2 = document.getElementById('chart-container-2')
const axis = new CartesianAxes(container2, width, height, {
  x: [
    {
      type: AxisType.time,
      label: 'datum',
      position: AxisPosition.AtZero,
      showGrid: false,
    },
  ],
  y: [],
})

const refDate = new Date(2018, 10, 1)

d3.json('../data/ensemble.json')
  .then(function (data) {
    const nEnsemble = data.values[0].length
    const members = Array(nEnsemble)
    const percentiles = [[], [], []]

    for (let s = 0; s < nEnsemble; s++) {
      members[s] = []
    }
    data.times.forEach(function (time, index) {
      const dateTime = new Date(time * 1000)
      if (dateTime.getTime() > refDate.getTime()) return

      for (let i = 0; i < nEnsemble; i++) {
        members[i].push({ x: dateTime, y: data.values[index][i] })
      }
      const points = data.values[index]
      percentiles[0].push({ x: dateTime, y: percentile(0.5, points) })
      percentiles[1].push({ x: dateTime, y: percentile([0.25, 0.75], points) })
      percentiles[2].push({ x: dateTime, y: percentile([0.05, 0.95], points) })
    })

    for (let i = 1; i < nEnsemble; i++) {
      const plotEnsemble = new ChartLine(members[i], {})
      plotEnsemble.addTo(
        axis1,
        { x: { key: 'x', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } },
        'ensemble-line',
        '.nsemble-line',
      )
    }
    const plotMedian = new ChartLine(percentiles[0], {})
    const plotControl = new ChartLine(members[0], {})
    plotControl.addTo(
      axis1,
      { x: { key: 'x', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } },
      'control',
      '#control-line',
    )
    plotMedian.addTo(
      axis1,
      { x: { key: 'x', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } },
      'median',
      '#median-line',
    )
    axis1.redraw({ x: { autoScale: true }, y: { autoScale: true } })

    const plotControl1 = new ChartLine(members[0], {})
    const plotMedian1 = new ChartLine(percentiles[0], {})
    const plotPercentile50 = new ChartArea(percentiles[1], {})
    const plotPercentile90 = new ChartArea(percentiles[2], {})

    plotPercentile90.addTo(
      axis,
      { x: { key: 'x', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } },
      'percent90',
      '#percent90',
    )
    plotPercentile50.addTo(
      axis,
      { x: { key: 'x', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } },
      'percent50',
      '#percent50',
    )
    plotControl1.addTo(
      axis,
      { x: { key: 'x', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } },
      'control',
      '#control-line',
    )
    plotMedian1.addTo(
      axis,
      { x: { key: 'x', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } },
      'median',
      '#median-line',
    )
    axis.redraw({ x: { autoScale: true }, y: { autoScale: true } })
  })
  .catch((error) => console.error(`Failed to create chart: ${error}`))

addListenerByClassName('theme-button', 'click', () =>
  document.documentElement.classList.toggle('dark'),
)

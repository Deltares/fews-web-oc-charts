import '../../src/scss/wb-charts.scss'
import '../shared.css'
import './mouseover.css'

import * as d3 from 'd3'
import {
  AxisPosition,
  AxisType,
  CartesianAxes,
  ChartArea,
  ChartLine,
  ChartMarker,
  CurrentTime,
  DstIndicator,
  Legend,
  LevelSelect,
  MouseOver,
  WarningLevels,
  ZoomHandler,
} from '../../src'
import { addListenerByClassName, percentile, toggleChart } from '../shared'

const container = document.getElementById('chart-container-1')
const axis = new CartesianAxes(container, null, null, {
  x: [
    {
      type: AxisType.time,
      label: 'datum',
      position: AxisPosition.AtZero,
      showGrid: false,
    },
  ],
  y: [
    {
      position: AxisPosition.Left,
      showGrid: true,
      nice: true,
      includeZero: true,
      label: 'Waterstand',
      unit: 'cm',
    },
  ],
  margin: {
    left: 100,
    right: 100,
  },
})

const legend = new Legend(
  [
    {
      selector: 'median',
      label: 'Middelste (P50)',
    },
    {
      selector: 'control',
      label: 'Controle',
    },
    {
      selector: 'percent90',
      label: '90% interval',
    },
    {
      selector: 'percent50',
      label: '50% interval',
    },
    {
      selector: 'ensemble',
      label: 'Verstoord',
    },
    {
      selector: 'missing',
      label: 'Missing',
    },
  ],
  document.getElementById('chart-legend-1')
)

const currentTime = new CurrentTime({
  x: {
    axisIndex: 0,
  },
})
const dstIndicator = new DstIndicator({
  x: {
    axisIndex: 0,
  },
})
const levelSelect = new LevelSelect(function (x) {
  console.log(x)
})

const refDate = new Date()
const refYear = refDate.getFullYear()
const mouseOver = new MouseOver(['control', 'median', 'percent90'])
const escalationLevels = [
  {
    id: 'laag',
    events: [
      { date: new Date(refYear, 0, 1), value: -90 },
      { date: new Date(refYear, 1, 1), value: -90 },
      { date: new Date(refYear, 2, 1), value: -90 },
      { date: new Date(refYear, 3, 1), value: -90 },
      { date: new Date(refYear, 4, 1), value: -100 },
      { date: new Date(refYear, 5, 1), value: -100 },
      { date: new Date(refYear, 6, 1), value: -100 },
      { date: new Date(refYear, 7, 1), value: -100 },
      { date: new Date(refYear, 8, 1), value: -100 },
      { date: new Date(refYear, 9, 1), value: -90 },
      { date: new Date(refYear, 10, 1), value: -90 },
      { date: new Date(refYear, 11, 1), value: -90 },
    ],
    color: 'rgba(205, 133, 63,.5)',
    c: '<',
  },
  {
    id: 'verhoogd',
    events: [
      { date: new Date(refYear, 0, 1), value: 110 },
      { date: new Date(refYear, 1, 1), value: 110 },
      { date: new Date(refYear, 2, 1), value: 110 },
      { date: new Date(refYear, 3, 1), value: 110 },
      { date: new Date(refYear, 4, 1), value: 100 },
      { date: new Date(refYear, 5, 1), value: 100 },
      { date: new Date(refYear, 6, 1), value: 100 },
      { date: new Date(refYear, 7, 1), value: 100 },
      { date: new Date(refYear, 8, 1), value: 100 },
      { date: new Date(refYear, 9, 1), value: 110 },
      { date: new Date(refYear, 10, 1), value: 110 },
      { date: new Date(refYear, 11, 1), value: 110 },
    ],
    color: 'rgba(255, 215, 0,.5)',
    c: '>',
  },
  {
    id: 'hoog',
    events: [
      { date: new Date(refYear, 0, 1), value: 120 },
      { date: new Date(refYear, 1, 1), value: 120 },
      { date: new Date(refYear, 2, 1), value: 120 },
      { date: new Date(refYear, 3, 1), value: 120 },
      { date: new Date(refYear, 4, 1), value: 110 },
      { date: new Date(refYear, 5, 1), value: 110 },
      { date: new Date(refYear, 6, 1), value: 110 },
      { date: new Date(refYear, 7, 1), value: 110 },
      { date: new Date(refYear, 8, 1), value: 110 },
      { date: new Date(refYear, 9, 1), value: 120 },
      { date: new Date(refYear, 10, 1), value: 120 },
      { date: new Date(refYear, 11, 1), value: 120 },
    ],
    color: 'rgba(255, 150, 0,.5)',
    c: '>',
  },
  {
    id: 'extreem',
    events: [
      { date: new Date(refYear, 0, 1), value: 160 },
      { date: new Date(refYear, 1, 1), value: 160 },
      { date: new Date(refYear, 2, 1), value: 160 },
      { date: new Date(refYear, 3, 1), value: 160 },
      { date: new Date(refYear, 4, 1), value: 140 },
      { date: new Date(refYear, 5, 1), value: 140 },
      { date: new Date(refYear, 6, 1), value: 140 },
      { date: new Date(refYear, 7, 1), value: 140 },
      { date: new Date(refYear, 8, 1), value: 140 },
      { date: new Date(refYear, 9, 1), value: 160 },
      { date: new Date(refYear, 10, 1), value: 160 },
      { date: new Date(refYear, 11, 1), value: 160 },
    ],
    color: 'rgba(255, 0, 0,.5)',
    c: '>',
  },
]

const escalationsVisitor = new WarningLevels(escalationLevels, {})
const zoom = new ZoomHandler()

axis.accept(legend)

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
      console.log(new Date(medianTime * 1000))

      data.times.forEach(function (time, index) {
        const dateTime = new Date((time - medianTime) * 1000 + refDate.getTime())
        for (let i = 0; i < nEnsemble; i++) {
          members[i].push({
            x: dateTime,
            y: data.values[index][i],
          })
        }
        const points = data.values[index]
        percentiles[0].push({
          x: dateTime,
          y: percentile(0.5, points),
        })
        percentiles[1].push({
          x: dateTime,
          y: percentile([0.25, 0.75], points),
        })
        percentiles[2].push({
          x: dateTime,
          y: percentile([0.05, 0.95], points),
        })
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
        {
          x: {
            key: 'x',
            axisIndex: 0,
          },
          y: {
            key: 'y',
            axisIndex: 0,
          },
        },
        'percent90',
        style90
      )
      plotPercentile50.addTo(
        axis,
        {
          x: {
            key: 'x',
            axisIndex: 0,
          },
          y: {
            key: 'y',
            axisIndex: 0,
          },
        },
        'percent50',
        style50
      )

      for (let i = 1; i < nEnsemble; i++) {
        const plotEnsemble = new ChartLine(members[i], {})
        const declaration = {
          stroke: 'green',
          'stroke-width': '1px',
          fill: 'none',
          opacity: '.5',
        }

        plotEnsemble.addTo(
          axis,
          {
            x: {
              key: 'x',
              axisIndex: 0,
            },
            y: {
              key: 'y',
              axisIndex: 0,
            },
          },
          'ensemble',
          declaration
        )
      }

      plotControl1.addTo(
        axis,
        {
          x: {
            key: 'x',
            axisIndex: 0,
          },
          y: {
            key: 'y',
            axisIndex: 0,
          },
        },
        'control',
        '#control-line'
      )
      plotMedian1.addTo(
        axis,
        {
          x: {
            key: 'x',
            axisIndex: 0,
          },
          y: {
            key: 'y',
            axisIndex: 0,
          },
        },
        'median',
        '#median-line'
      )
      axis.redraw({
        x: {
          autoScale: true,
        },
        y: {
          autoScale: true,
        },
      })
      axis.zoom()
      axis.accept(currentTime)
      axis.accept(dstIndicator)
      axis.accept(levelSelect)
      axis.accept(escalationsVisitor)
      axis.accept(zoom)
      axis.accept(mouseOver)
    })
    .catch((error) => console.error(`Failed to create chart: ${error}`))
}
window.setTimeout(dataload, 1000)

addListenerByClassName('theme-button', 'click', () =>
 document.documentElement.classList.toggle('dark')
)
addListenerByClassName('legend-button', 'click', (event) => toggleChart(event.target, axis))
